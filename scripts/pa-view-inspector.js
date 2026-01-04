/* 文件名: Scripts/pa-view-inspector.js
   用途: 全景数据巡检仪 (Ultimate Fusion)
   包含: 健康度评分 + 缺失值检测 + 维度分布 + 每日一题诊断
*/

const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

const style = document.createElement("style");
style.innerHTML = `
    .insp-container { display: flex; flex-direction: column; gap: 15px; }
    .insp-row-flex { display: flex; gap: 15px; flex-wrap: wrap; }
    .insp-card { flex: 1; min-width: 280px; background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.6) 100%); backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 12px; padding: 15px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); }
    .insp-title { font-weight: bold; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px; }
    .insp-item { display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 6px; align-items: center; }
    .insp-tag { padding: 1px 5px; border-radius: 3px; font-size: 0.75em; font-weight: bold; }
  .insp-table { width: 100%; border-collapse: collapse; font-size: 0.76em; margin-top: 8px; table-layout: fixed; }
  .insp-table th { text-align: left; opacity: 0.5; padding: 4px 6px; border-bottom: 1px solid rgba(255,255,255,0.1); font-weight: 600; }
  .insp-table td { padding: 4px 6px; border-bottom: 1px solid rgba(255,255,255,0.05); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .insp-td-date { width: 44px; }
  .insp-td-ticker { width: 54px; }
  .insp-td-tf { width: 54px; }
  .insp-td-outcome { width: 58px; }
  .insp-td-exec { width: 100px; }
  .insp-td-review { width: 86px; }
    .txt-red { color: ${c.loss}; } .txt-green { color: ${c.live}; } .txt-dim { opacity: 0.5; }
`;
document.head.appendChild(style);

if (window.paData) {
  const D = window.paData;
  const trades = D.trades; // 倒序
  const sr = D.sr;

  // --- 0. 策略仓库同步 (Strategy Sync) ---
  let strategyMap = new Map(); // canonicalName -> { patterns: Set, category: Set }
  let strategyLookup = new Map(); // alias (CN/EN/Full) -> canonicalName

  const sIdx = D.strategyIndex;
  if (sIdx?.list?.length) {
    // 优先复用引擎的单一信源，避免 Inspector 自扫导致口径漂移
    for (const s of sIdx.list) {
      const canonical = s.canonicalName || s.displayName || s.file?.name;
      if (!canonical) continue;
      const patternSet = new Set(
        (s.patterns || []).map((x) => x.toString().trim()).filter(Boolean)
      );
      const categorySet = new Set(
        (s.setupCategories || [])
          .map((x) => x.toString().trim())
          .filter(Boolean)
      );
      strategyMap.set(canonical, {
        patterns: patternSet,
        category: categorySet,
      });
    }
    if (sIdx.lookup) strategyLookup = sIdx.lookup;
    else {
      // 兜底：至少保证 canonical 自身可查
      for (const key of strategyMap.keys()) strategyLookup.set(key, key);
    }
  } else {
    // 强制单一信源：Inspector 不再自行扫描策略仓库。
    // 若这里为空，说明 pa-core 的策略索引构建失败/尚未加载。
    console.warn(
      "[PA] strategyIndex missing; Inspector strategy mapping disabled"
    );
  }

  // --- 1. 健康度体检逻辑 (Health Check) ---
  // 1.1 读取属性预设作为标准
  let allowedValues = {};
  let valueMap = {}; // alias -> canonical (for normalization)

  const presetPage = dv.page("Templates/属性值预设.md");
  const presetLoaded = !!presetPage;
  if (presetPage) {
    // 遍历预设文件的所有属性，建立白名单
    for (let key in presetPage) {
      if (key === "file" || key === "position") continue;
      let val = presetPage[key];
      if (Array.isArray(val)) {
        // 提取括号前的内容作为标准值，同时也允许完整值
        allowedValues[key] = new Set();
        val.forEach((v) => {
          if (typeof v === "string") {
            let full = v.trim();
            allowedValues[key].add(full);

            if (full.includes("(")) {
              let parts = full.split("(");
              let cn = parts[0].trim();
              let en = parts[1].replace(")", "").trim();
              allowedValues[key].add(cn);

              // Map aliases to CN name for display
              valueMap[full] = cn;
              valueMap[cn] = cn;
              valueMap[en] = cn;
            } else {
              valueMap[full] = full;
            }
          }
        });
      }
    }
  }

  let missing = {
    ticker: 0,
    tf: 0,
    setup: 0,
    logic: 0,
    illegal: 0,
    unknownStrat: 0,
    stratMismatch: 0,
  };
  let illegalDetails = []; // 记录具体的非法值详情

  trades.forEach((t) => {
    if (!t.ticker || t.ticker === "Unknown") missing.ticker++;
    if (!t.tf || t.tf === "Unknown") missing.tf++;
    // setup (category) is less critical if strategyName is present, but still good to have
    if (!t.setup || t.setup === "Unknown") missing.setup++;
    // 逻辑自检: 有盈亏但R值为0
    if (t.pnl !== 0 && t.r === 0) missing.logic++;

    // --- 策略一致性检查 (Strategy Consistency) ---
    let sName = t.strategyName;
    let sPatterns = t.patterns || [];

    if (sName && sName !== "Unknown") {
      // 1. 检查策略名称是否存在 (支持别名)
      let canonicalName = strategyLookup.get(sName);

      if (!canonicalName) {
        missing.unknownStrat++;
        illegalDetails.push({
          link: t.link,
          field: "未知策略名",
          value: sName,
        });
      } else {
        // 2. 检查形态是否匹配策略
        let stratInfo = strategyMap.get(canonicalName);
        let hasValidPattern = sPatterns.some((p) =>
          stratInfo.patterns.has(p.toString().trim())
        );

        // 如果交易记录了形态，但没有一个属于该策略，则警告
        if (sPatterns.length > 0 && !hasValidPattern) {
          missing.stratMismatch++;
          illegalDetails.push({
            link: t.link,
            field: "策略/形态不匹配",
            value: `${sName} vs [${sPatterns.join(",")}]`,
          });
        }
      }
    }

    // 1.2 合规性检查 (Compliance Check)
    if (presetPage) {
      // 检查市场周期
      if (t.cycle && allowedValues["市场周期/market_cycle"]) {
        // t.cycle 可能是数组或字符串
        let cycles = Array.isArray(t.cycle) ? t.cycle : [t.cycle];
        cycles.forEach((c) => {
          // 兼容处理: 允许完整值 或 括号前中文
          let valStr = c.toString().trim();
          let valCn = valStr.split("(")[0].trim();
          if (
            valStr &&
            !allowedValues["市场周期/market_cycle"].has(valStr) &&
            !allowedValues["市场周期/market_cycle"].has(valCn)
          ) {
            missing.illegal++;
            illegalDetails.push({
              link: t.link,
              field: "市场周期",
              value: valStr,
            });
          }
        });
      }
      // 检查设置类别 (使用 rawSetup)
      if (t.rawSetup && allowedValues["设置类别/setup_category"]) {
        let setups = Array.isArray(t.rawSetup) ? t.rawSetup : [t.rawSetup];
        setups.forEach((s) => {
          let valStr = s.toString().trim();
          let valCn = valStr.split("(")[0].trim();
          if (
            valStr &&
            valStr !== "Unknown" &&
            !allowedValues["设置类别/setup_category"].has(valStr) &&
            !allowedValues["设置类别/setup_category"].has(valCn)
          ) {
            missing.illegal++;
            illegalDetails.push({
              link: t.link,
              field: "设置类别",
              value: valStr,
            });
          }
        });
      }
    }
  });

  let totalIssues = Object.values(missing).reduce((a, b) => a + b, 0);
  let healthScore = Math.max(
    0,
    100 - Math.ceil((totalIssues / Math.max(trades.length, 1)) * 20)
  );
  let healthColor =
    healthScore > 90 ? c.live : healthScore > 60 ? c.back : c.loss;

  // --- 2. 维度分布统计 (Distributions) ---
  const toZh = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v !== "string") return v;

    let s = v.toString().trim();
    if (!s) return s;

    const hasCJK = (str) => /[\u4e00-\u9fff]/.test(str || "");
    const normalizePair = (cn, en) => {
      cn = (cn || "").toString().trim();
      en = (en || "").toString().trim();
      if (!cn && en) cn = "待补充";
      if (cn && !en) return cn;
      if (!cn && !en) return "";
      return `${cn}/${en}`;
    };
    const splitPair = (str) => {
      if (!str) return null;
      if (str.includes("/")) {
        const parts = str.split("/");
        const cn = (parts[0] || "").trim();
        const en = parts.slice(1).join("/").trim();
        return { cn, en };
      }
      if (str.includes("(") && str.endsWith(")")) {
        const parts = str.split("(");
        const cn = (parts[0] || "").trim();
        const en = parts
          .slice(1)
          .join("(")
          .replace(/\)\s*$/, "")
          .trim();
        return { cn, en };
      }
      return null;
    };

    if (s === "Unknown") return "未知/Unknown";
    if (s === "Empty") return "空/Empty";

    // 周期/timeframe 代码（PT5M、M5、H1、D1...）优先映射成中文/英文
    {
      const tf = s.toUpperCase();
      const mk = (cn) => normalizePair(cn, s);
      let m = tf.match(/^PT(\d+)([MH])$/); // ISO-8601: PT5M / PT1H
      if (m) {
        const n = Number(m[1]);
        const u = m[2];
        if (u === "M") return mk(`${n}分钟`);
        if (u === "H") return mk(`${n}小时`);
      }
      m = tf.match(/^P(\d+)D$/); // P1D
      if (m) {
        const n = Number(m[1]);
        return mk(n === 1 ? "日线" : `${n}天`);
      }
      m = tf.match(/^M(\d+)$/);
      if (m) return mk(`${Number(m[1])}分钟`);
      m = tf.match(/^H(\d+)$/);
      if (m) return mk(`${Number(m[1])}小时`);
      m = tf.match(/^D(\d+)$/);
      if (m) return mk(Number(m[1]) === 1 ? "日线" : `${Number(m[1])}天`);
      m = tf.match(/^W(\d+)$/);
      if (m) return mk(Number(m[1]) === 1 ? "周线" : `${Number(m[1])}周`);
    }

    const directPair = splitPair(s);
    if (directPair) {
      let { cn, en } = directPair;
      if (!hasCJK(cn) && hasCJK(en)) {
        const tmp = cn;
        cn = en;
        en = tmp;
      }
      if (!hasCJK(cn) && en) cn = "待补充";
      return normalizePair(cn, en);
    }

    // preset 预设映射（英文 -> 中文），尽量输出 中文/英文
    if (valueMap && valueMap[s]) {
      const cn = valueMap[s];
      if (hasCJK(cn)) return normalizePair(cn, s);
    }

    // 策略索引映射（英文别名 -> 规范名，常见为 中文(English)）
    if (strategyLookup && typeof strategyLookup.get === "function") {
      const canonical = strategyLookup.get(s);
      if (canonical && canonical !== s) {
        const p = splitPair(canonical);
        if (p) return normalizePair(p.cn, p.en);
        if (hasCJK(canonical)) return canonical;
        return normalizePair("待补充", canonical);
      }
    }

    // 如果已经是中文，就直接返回；纯英文则保证带中文前缀
    if (hasCJK(s)) return s;
    return normalizePair("待补充", s);
  };

  function getDist(key, useMap = false) {
    let dist = {};
    trades.forEach((t) => {
      // v5.0+: 聚合优先使用引擎的稳定 key，避免“中文/英文/括号写法”把同一类拆散
      const keyMap = {
        ticker: "tickerKey",
        tf: "tfKey",
        setup: "setupKey",
        market_cycle: "marketCycleKey",
      };

      const stableKeyField = keyMap[key];
      let stableKey = stableKeyField ? t?.[stableKeyField] : null;
      if (Array.isArray(stableKey))
        stableKey = stableKey.length ? stableKey[0] : null;
      if (stableKey && typeof stableKey !== "string")
        stableKey = stableKey.toString();
      stableKey = (stableKey || "").toString().trim();

      // 展示仍优先使用原始字段（带中英），但分组以 stableKey 为准
      let raw = t?.[key];
      if (Array.isArray(raw)) raw = raw.length ? raw[0] : "";
      raw = (raw || "").toString().trim();

      let val = stableKey || raw || "Unknown";
      // 如果启用了映射且存在映射值，则尽量输出 中文/英文（由 toZh 统一处理）
      if (useMap && valueMap[val]) {
        // no-op: toZh(val) 会基于 valueMap 生成 中文/英文
      }
      // 特殊处理: 如果是 setup 且有 strategyName，优先使用 strategyName (并尝试映射)
      if (key === "setup" && t.strategyName && t.strategyName !== "Unknown") {
        let sName = t.strategyName;
        // 尝试获取规范名称 (中文优先)
        if (strategyLookup.get(sName)) {
          let canonical = strategyLookup.get(sName);
          sName = canonical;
        }
        val = sName;
      }

      // 如果 val 来自 stableKey（如 ES/5m/Trend Pullback），优先用 raw 做展示汉化
      // 这样既不影响分组稳定，又尽量保留你填写的中英信息。
      const displayVal = raw && stableKey ? raw : val;
      val = toZh(displayVal);

      if (val) dist[val] = (dist[val] || 0) + 1;
    });
    return Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // Top 5
  }
  const distTicker = getDist("ticker");
  const distSetup = getDist("setup", true); // Enable mapping for setup/strategy

  // --- 3. 执行质量统计 ---
  const distExec = getDist("error");
  const execColorFn = (name) => {
    if (name.includes("完美") || name.includes("Perfect")) return c.live;
    if (name.includes("主动") || name.includes("Valid")) return c.back; // 黄色
    if (name.includes("恐慌") || name.includes("Panic")) return c.loss;
    return "gray";
  };

  const execToCn = (raw) => {
    const s = (raw || "").toString().trim();
    if (!s || s === "-") return s;
    // 常见执行标签：保证一定有中文
    const key = s.toLowerCase();
    if (key.includes("perfect")) return "完美/Perfect";
    if (key === "none" || key.includes("normal")) return "正常/None";
    if (key.includes("fomo")) return "追涨杀跌/FOMO";
    if (key.includes("panic")) return "恐慌/Panic";
    if (key.includes("valid") || key.includes("scratch"))
      return "主动离场/Scratch";
    if (key.includes("tight")) return "止损太紧/Tight Stop";
    return toZh(s);
  };

  // --- 4. 辅助渲染函数 ---
  const renderMiniBar = (data, colorFn) => {
    const total = trades.length || 1; // 用总数做分母
    const pill = (label, value, col) => {
      return `<span style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); font-size:0.75em;">
          <span style="display:inline-block; width:6px; height:6px; border-radius:999px; background:${col}; opacity:0.9;"></span>
          <span style="opacity:0.85; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${label}</span>
          <span style="opacity:0.6; font-variant-numeric:tabular-nums;">${value}</span>
        </span>`;
    };

    let html = `<div style="display:flex; flex-wrap:wrap; gap:6px;">`;
    data.forEach(([k, v]) => {
      const pct = Math.round((v / total) * 100);
      const col = typeof colorFn === "function" ? colorFn(k) : colorFn;
      html += pill(k, `${v} (${pct}%)`, col);
    });
    html += `</div>`;
    return html;
  };

  // --- 5. 主界面渲染 ---
  // 5.1 构建异常详情 HTML
  let detailsHTML = "";
  if (
    illegalDetails.length > 0 ||
    missing.logic > 0 ||
    missing.setup > 0 ||
    missing.ticker > 0 ||
    missing.tf > 0
  ) {
    const logicIssues = trades.filter((t) => t.pnl !== 0 && t.r === 0);
    const missingSetupIssues = trades.filter(
      (t) => !t.setup || t.setup === "Unknown"
    );
    const missingTickerIssues = trades.filter(
      (t) => !t.ticker || t.ticker === "Unknown"
    );
    const missingTfIssues = trades.filter((t) => !t.tf || t.tf === "Unknown");

    // 待补充（需要汉化）：常见出现在策略名/执行标签仍为纯英文时
    const hasCJK = (str) => /[\u4e00-\u9fff]/.test((str || "").toString());
    const needsCn = (str) => {
      const s = (str || "").toString().trim();
      if (!s) return false;
      if (s === "Unknown" || s === "Empty") return false;
      if (hasCJK(s)) return false;
      return /[a-zA-Z]/.test(s);
    };
    const cnTodoIssues = trades
      .filter(
        (t) => needsCn(t.strategyName) || needsCn(t.setup) || needsCn(t.error)
      )
      .slice(0, 30);
    const issueCount =
      illegalDetails.length +
      logicIssues.length +
      missingSetupIssues.length +
      missingTickerIssues.length +
      missingTfIssues.length +
      cnTodoIssues.length;

    detailsHTML = `
      <details class="insp-card" style="border-left: 3px solid ${c.loss};">
        <summary style="cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <span style="font-weight:bold; color:${c.loss};">⚠️ 异常详情</span>
          <span style="font-size:0.8em; opacity:0.7; white-space:nowrap;">
            <strong style="color:${c.loss};">${issueCount}</strong>
            <span style="opacity:0.8;">（非法值 ${illegalDetails.length} · 逻辑错误 ${logicIssues.length} · 缺失设置 ${missingSetupIssues.length} · 缺失品种 ${missingTickerIssues.length} · 缺失周期 ${missingTfIssues.length} · 待补充 ${cnTodoIssues.length}）</span>
          </span>
        </summary>
        <div style="margin-top:10px; max-height: 200px; overflow-y: auto;">
            <table class="insp-table">
                <thead><tr><th>文件</th><th>问题</th><th>当前值</th></tr></thead>
                <tbody>`;

    // Add Illegal values
    illegalDetails.forEach((item) => {
      let label = item.field;
      if (["市场周期", "设置类别"].includes(item.field))
        label = "非法" + item.field;

      detailsHTML += `<tr>
              <td>${item.link}</td>
              <td><span class="insp-tag" style="background:rgba(239, 68, 68, 0.1); color:${
                c.loss
              }">${label}</span></td>
              <td style="opacity:0.7">${toZh(item.value)}</td>
          </tr>`;
    });

    // Add Logic issues (R=0 but PnL!=0)
    logicIssues.forEach((t) => {
      detailsHTML += `<tr>
              <td>${t.link}</td>
              <td><span class="insp-tag" style="background:rgba(239, 68, 68, 0.1); color:${c.loss}">逻辑错误</span></td>
          <td style="opacity:0.7">盈亏=${t.pnl}, R=0</td>
          </tr>`;
    });

    // Add Missing Setup
    missingSetupIssues.forEach((t) => {
      detailsHTML += `<tr>
              <td>${t.link}</td>
              <td><span class="insp-tag" style="background:rgba(255, 165, 0, 0.1); color:${c.loss}">缺失设置</span></td>
          <td style="opacity:0.7">空</td>
          </tr>`;
    });

    // Add Missing Ticker
    missingTickerIssues.forEach((t) => {
      detailsHTML += `<tr>
              <td>${t.link}</td>
              <td><span class="insp-tag" style="background:rgba(255, 165, 0, 0.1); color:${c.loss}">缺失品种</span></td>
          <td style="opacity:0.7">空</td>
          </tr>`;
    });

    // Add Missing Timeframe
    missingTfIssues.forEach((t) => {
      detailsHTML += `<tr>
              <td>${t.link}</td>
              <td><span class="insp-tag" style="background:rgba(255, 165, 0, 0.1); color:${c.loss}">缺失周期</span></td>
          <td style="opacity:0.7">空</td>
          </tr>`;
    });

    // Add CN TODO issues (click file link to jump)
    cnTodoIssues.forEach((t) => {
      const rawStrat = (t.strategyName || t.setup || "-").toString();
      const rawExec = (t.error || "-").toString();
      const showStrat = toZh(rawStrat);
      const showExec = execToCn(rawExec);
      detailsHTML += `<tr>
        <td>${t.link}</td>
        <td><span class="insp-tag" style="background:rgba(59, 130, 246, 0.12); color:${c.demo}">待补充</span></td>
        <td style="opacity:0.75">策略: ${showStrat} · 执行: ${showExec}</td>
      </tr>`;
    });

    detailsHTML += `</tbody></table></div></details>`;
  }

  const root = dv.el("div", "");
  root.innerHTML = `
    <div class="insp-container">
        
        <div class="insp-row-flex">
            <div class="insp-card" style="border-left: 3px solid ${healthColor};">
                <div class="insp-title" style="color:${healthColor}">
                    <span>❤️ 系统健康度: ${healthScore}</span>
                    <span style="font-size:0.8em; opacity:0.6;">${
                      trades.length
                    } 交易</span>
                </div>
                ${
                  !presetLoaded
                    ? `<div class="insp-item" style="color:${c.loss}; font-weight:bold;">⚠️ 未找到 'Templates/属性值预设.md'</div>`
                    : ""
                }
                <div class="insp-item"><span>缺失品种</span> <span class="${
                  missing.ticker > 0 ? "txt-red" : "txt-dim"
                }">${missing.ticker}</span></div>
                <div class="insp-item"><span>缺失周期</span> <span class="${
                  missing.tf > 0 ? "txt-red" : "txt-dim"
                }">${missing.tf}</span></div>
                <div class="insp-item"><span>缺失设置</span> <span class="${
                  missing.setup > 0 ? "txt-red" : "txt-dim"
                }">${missing.setup}</span></div>
                <div class="insp-item"><span>逻辑异常（R=0）</span> <span class="${
                  missing.logic > 0 ? "txt-red" : "txt-dim"
                }">${missing.logic}</span></div>
                <div class="insp-item"><span>非法属性值</span> <span class="${
                  missing.illegal > 0 ? "txt-red" : "txt-dim"
                }">${missing.illegal}</span></div>
                <div class="insp-item"><span>未知策略</span> <span class="${
                  missing.unknownStrat > 0 ? "txt-red" : "txt-dim"
                }">${missing.unknownStrat}</span></div>
                <div class="insp-item"><span>策略不匹配</span> <span class="${
                  missing.stratMismatch > 0 ? "txt-red" : "txt-dim"
                }">${missing.stratMismatch}</span></div>
            </div>

            <details class="insp-card" style="flex:1;">
                <summary style="cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:${
                      c.purple
                    };">🧠 神经系统诊断</span>
                    <span style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:0.8em; opacity:0.6;">${
                        D.loadTime
                      }</span>
                      <span class="insp-tag" style="background:${
                        D.isCached ? c.live : c.back
                      }; color:black;">${D.isCached ? "⚡️" : "🐢"}</span>
                    </span>
                </summary>
                <div style="margin-top:10px;">
                  <div class="insp-item"><span>每日一题池</span> <span class="${
                    sr.quizPool.length > 0 ? "txt-green" : "txt-red"
                  }">${sr.quizPool.length} 题</span></div>
                  <div class="insp-item"><span>文件夹识别</span> <span class="${
                    Object.keys(sr.folders).length > 0 ? "txt-green" : "txt-red"
                  }">${
    Object.keys(sr.folders).length > 0 ? "✅ 正常" : "❌ 失败"
  }</span></div>
                  <div class="insp-item"><span>大纲加载</span> <span class="${
                    D.course.syllabus.length > 0 ? "txt-green" : "txt-red"
                  }">${D.course.syllabus.length} 课</span></div>
                  <div class="insp-item"><span>策略库同步</span> <span class="${
                    strategyMap.size > 0 ? "txt-green" : "txt-red"
                  }">${strategyMap.size} 个</span></div>
                </div>
            </details>
        </div>

        ${detailsHTML}

        <details class="insp-card" style="flex:unset; min-width: unset;">
            <summary style="cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; opacity:0.85; font-weight:700;">
              <span>📊 分布摘要（可展开）</span>
              <span style="font-size:0.8em; opacity:0.6; font-weight:normal;">完整画像建议看 Schema</span>
            </summary>
            <div style="margin-top:12px;" class="insp-row-flex">
                <div class="insp-card" style="box-shadow:none;">
                    <div class="insp-title" style="color:${
                      c.demo
                    }">品种分布 (Ticker)</div>
                    ${renderMiniBar(distTicker, c.demo)}
                </div>
                <div class="insp-card" style="box-shadow:none;">
                    <div class="insp-title" style="color:${
                      c.live
                    }">策略分布 (Setup)</div>
                    ${renderMiniBar(distSetup, c.live)}
                </div>
                <div class="insp-card" style="box-shadow:none;">
                    <div class="insp-title" style="color:${
                      c.back
                    }">执行质量 (Execution)</div>
                    ${renderMiniBar(distExec, execColorFn)}
                </div>
            </div>
        </details>

        <div class="insp-card">
            <div class="insp-title" style="border:none;">
              <span>📄 原始数据明细 <span style="font-size:0.85em; opacity:0.55; font-weight:600;">(Raw Data)</span></span>
                <span style="font-size:0.8em; opacity:0.5; font-weight:normal;">最近 15 笔</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="insp-table">
            <thead><tr><th>日期</th><th>品种</th><th>周期</th><th>策略</th><th>结果</th><th>执行</th><th>复盘</th></tr></thead>
                    <tbody>
                        ${trades
                          .slice(0, 15)
                          .map((t) => {
                            let resTxt =
                              t.pnl > 0 ? "盈利" : t.pnl < 0 ? "亏损" : "平保";
                            let resCol =
                              t.pnl > 0 ? c.live : t.pnl < 0 ? c.loss : "gray";
                            // 优先显示新字段，兼容旧字段
                            let execTxt = (t.error || "-").toString();
                            let execDisp = execToCn(execTxt);
                            let execCol = execColorFn(execDisp);

                            // 检查缺失项
                            let tkDisp =
                              t.ticker && t.ticker !== "Unknown"
                                ? `<b>${toZh(t.ticker)}</b>`
                                : `<span class="txt-red">未知</span>`;
                            let tfDisp =
                              t.tf && t.tf !== "Unknown"
                                ? toZh(t.tf)
                                : `<span class="txt-red">-</span>`;

                            // 策略显示逻辑: 优先策略名(中文) > Setup类别
                            let stratDisp = t.setup || "-";
                            if (
                              t.strategyName &&
                              t.strategyName !== "Unknown"
                            ) {
                              let sName = t.strategyName;
                              if (strategyLookup.get(sName)) {
                                let canonical = strategyLookup.get(sName);
                                sName = canonical;
                              }
                              stratDisp = sName;
                            } else {
                              stratDisp = stratDisp; // 展示值统一交给 toZh
                            }

                            stratDisp = toZh(stratDisp);

                            return `<tr>
                                ${(() => {
                                  const escAttr = (s) =>
                                    (s ?? "")
                                      .toString()
                                      .replace(/&/g, "&amp;")
                                      .replace(/</g, "&lt;")
                                      .replace(/>/g, "&gt;")
                                      .replace(/\"/g, "&quot;")
                                      .replace(/'/g, "&#39;");

                                  const escHtml = (s) =>
                                    (s ?? "")
                                      .toString()
                                      .replace(/&/g, "&amp;")
                                      .replace(/</g, "&lt;")
                                      .replace(/>/g, "&gt;");

                                  const dateDisp = t.date
                                    ? t.date.slice(5)
                                    : "--";
                                  const stratFull = stratDisp || "-";
                                  const stratShort =
                                    stratFull.length > 16
                                      ? stratFull.slice(0, 16) + "…"
                                      : stratFull;
                                  const execFull = execDisp || "-";
                                  const execShort =
                                    execFull.length > 12
                                      ? execFull.slice(0, 12) + "…"
                                      : execFull;

                                  const hints = Array.isArray(t.reviewHints)
                                    ? t.reviewHints
                                    : [];
                                  const reviewCell =
                                    hints.length > 0
                                      ? `<details style="display:inline-block;">
                                          <summary style="cursor:pointer; list-style:none; opacity:0.85; font-weight:700;">
                                            🧩 ${hints.length}
                                          </summary>
                                          <div style="margin-top:6px; padding:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; max-width:420px;">
                                            ${hints
                                              .map((h) => {
                                                const zh = escHtml(h?.zh || "");
                                                const en = escHtml(h?.en || "");
                                                const showZh = zh || "-";
                                                const showEn = en
                                                  ? ` <span style=\"opacity:0.6\">(${en})</span>`
                                                  : "";
                                                return `<div style=\"font-size:0.72em; line-height:1.35; margin-bottom:6px; white-space:normal;\">• ${showZh}${showEn}</div>`;
                                              })
                                              .join("")}
                                          </div>
                                        </details>`
                                      : `<span class="txt-dim">-</span>`;

                                  return `
                                    <td class="insp-td-date" style="opacity:0.6">${dateDisp}</td>
                                    <td class="insp-td-ticker">${tkDisp}</td>
                                    <td class="insp-td-tf">${tfDisp}</td>
                                    <td title="${escAttr(
                                      stratFull
                                    )}">${stratShort}</td>
                                    <td class="insp-td-outcome" style="color:${resCol}; font-weight:bold;">${resTxt}</td>
                                    <td class="insp-td-exec" style="color:${execCol}" title="${escAttr(
                                    execFull
                                  )}">${execShort}</td>
                                    <td class="insp-td-review" style="white-space:normal; overflow:visible;">${reviewCell}</td>
                                  `;
                                })()}
                            </tr>`;
                          })
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
} else {
  dv.paragraph("⚠️ Engine not loaded.");
}

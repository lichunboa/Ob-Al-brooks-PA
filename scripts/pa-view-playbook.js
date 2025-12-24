const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");

// === 数据源：优先使用引擎缓存，避免重复全库扫描 ===
const idx = window.paData?.strategyIndex;
const strategyList = idx?.list || [];
const strategyByName = idx?.byName;
const strategyLookup = idx?.lookup;
const strategyByPattern = idx?.byPattern || {};
const trades = window.paData?.tradesAsc || [];

const toArr = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v?.constructor && v.constructor.name === "Proxy") return Array.from(v);
  return [v];
};
const normStr = (v) =>
  v === undefined || v === null ? "" : v.toString().trim();

const hasCJK = (str) => /[\u4e00-\u9fff]/.test((str || "").toString());
const prettyName = (raw) => {
  const s = normStr(raw);
  if (!s) return s;
  const canonical = strategyLookup?.get?.(s);
  if (canonical) return canonical;
  if (s.includes("(") && s.endsWith(")")) return s;
  if (s.includes("/") && hasCJK(s.split("/")[0])) return s;
  if (!hasCJK(s) && /[a-zA-Z]/.test(s)) return `待补充/${s}`;
  return s;
};

const cycleToCn = (raw) => {
  const s0 = normStr(raw);
  if (!s0) return s0;
  if (hasCJK(s0)) return s0;
  if (s0.includes("/")) return s0;
  if (s0.includes("(") && s0.endsWith(")")) return s0;
  const key = s0.toLowerCase();
  const map = {
    range: "交易区间/Range",
    "trading range": "交易区间/Trading Range",
    trend: "趋势/Trend",
    pullback: "回调/Pullback",
    reversal: "反转/Reversal",
    breakout: "突破/Breakout",
    spike: "急速/Spike",
  };
  return map[key] || `待补充/${s0}`;
};
const prettyCycles = (v, limit = 2) =>
  toArr(v)
    .map(cycleToCn)
    .map(normStr)
    .filter(Boolean)
    .slice(0, limit)
    .join(", ");
const cycleMatches = (cycles, currentCycle) => {
  const cur = normStr(currentCycle);
  if (!cur) return false;
  return (cycles || []).some((c) => {
    const cc = normStr(c);
    return cc && (cc.includes(cur) || cur.includes(cc));
  });
};

// 今日复盘日记（用于“今日推荐”）
const today = moment().format("YYYY-MM-DD");
const isoFromAny = (v) => {
  if (!v) return "";
  try {
    if (typeof v.toISODate === "function") return v.toISODate();
  } catch (e) {}
  if (Array.isArray(v)) return isoFromAny(v[0]);
  if (v?.constructor && v.constructor.name === "Proxy") {
    try {
      const arr = Array.from(v);
      return isoFromAny(arr[0]);
    } catch (e) {}
  }
  if (typeof v === "string") {
    const m = v.match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : "";
  }
  if (typeof v === "object") {
    try {
      for (const k of Object.keys(v)) {
        const m = k.match(/\d{4}-\d{2}-\d{2}/);
        if (m) return m[0];
      }
    } catch (e) {}
  }
  return "";
};
const pageISODate = (p) => {
  const d1 = isoFromAny(p?.file?.day);
  if (d1) return d1;
  return isoFromAny(p?.date);
};
const todayJournal = dv
  .pages('"Daily"')
  .where((p) => {
    const name = (p?.file?.name || "").toString();
    const isJournal =
      name.includes("_Journal") ||
      name.toLowerCase().includes("journal") ||
      name.includes("复盘");
    if (!isJournal) return false;
    return pageISODate(p) === today;
  })
  .first();
const isActiveStrategy = (statusRaw) => {
  const s = normStr(statusRaw);
  if (!s) return false;
  return s.includes("实战") || s.toLowerCase().includes("active");
};
const safePct = (wins, total) =>
  total > 0 ? Math.round((wins / total) * 100) : 0;

// 将交易归因到策略（策略名优先，其次形态匹配）
function resolveStrategyCanonical(trade) {
  const raw = normStr(trade?.strategyName);
  if (raw && raw !== "Unknown") {
    if (strategyLookup?.get?.(raw)) return strategyLookup.get(raw);
    if (strategyLookup?.get?.(raw.toLowerCase()))
      return strategyLookup.get(raw.toLowerCase());
    return raw;
  }
  const pats = toArr(trade?.patterns).map(normStr).filter(Boolean);
  for (const p of pats) {
    const canonical = strategyByPattern[p];
    if (canonical) return canonical;
  }
  return null;
}

// 汇总每个策略的实战表现
const perf = new Map(); // canonical -> { total, wins, pnl, lastDate }
for (const t of trades) {
  const canonical = resolveStrategyCanonical(t);
  if (!canonical) continue;
  const p = perf.get(canonical) || { total: 0, wins: 0, pnl: 0, lastDate: "" };
  p.total += 1;
  if (t.pnl > 0) p.wins += 1;
  p.pnl += Number(t.pnl) || 0;
  if (t.date && (!p.lastDate || t.date > p.lastDate)) p.lastDate = t.date;
  perf.set(canonical, p);
}

// 策略仓库路径
const strategyRepo = idx?.repoPath || "策略仓库 (Strategy Repository)";
const strategies = strategyList;

// 按市场周期分类
const cycleGroupDefs = [
  { name: "🔄 交易区间", keywords: ["交易区间", "区间", "Range"] },
  {
    name: "📈 趋势延续",
    keywords: ["趋势", "强趋势", "趋势回调", "Trend", "Pullback"],
  },
  { name: "🚀 急速/突破", keywords: ["急速", "突破模式", "Spike", "Breakout"] },
  { name: "🔃 反转", keywords: ["反转", "Reversal"] },
];

// 避免“同一策略出现在多个组”造成混乱：只归入一个最合适的组。
// 这里优先把包含“交易区间”的归到交易区间组，其余再按常规优先级分配。
const groupAssignPriority = [
  "🔄 交易区间",
  "📈 趋势延续",
  "🚀 急速/突破",
  "🔃 反转",
];

let html = "";
let totalStrategies = strategies.length;
let activeStrategies = strategies.filter((s) =>
  isActiveStrategy(s.statusRaw)
).length;
let usageCount = 0;
perf.forEach((p) => (usageCount += p.total));

// 顶部统计
html += `<div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-bottom:16px;">
  <div style="background:rgba(59,130,246,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:${
      cfg.colors.demo
    };">${totalStrategies}</div>
    <div style="font-size:0.7em; opacity:0.7;">总策略</div>
  </div>
  <div style="background:rgba(34,197,94,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#22c55e;">${activeStrategies}</div>
    <div style="font-size:0.7em; opacity:0.7;">实战中</div>
  </div>
  <div style="background:rgba(251,191,36,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#fbbf24;">${
      totalStrategies - activeStrategies
    }</div>
    <div style="font-size:0.7em; opacity:0.7;">学习中</div>
  </div>
  <div style="background:rgba(168,85,247,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#a855f7;">${usageCount}</div>
    <div style="font-size:0.7em; opacity:0.7;">总使用</div>
  </div>
</div>`;

// 今日推荐（基于复盘日记市场周期）
if (
  todayJournal &&
  (todayJournal["市场周期/market_cycle"] || todayJournal.market_cycle)
) {
  const currentCycle =
    todayJournal["市场周期/market_cycle"] || todayJournal.market_cycle;
  const rec = strategies
    .filter(
      (s) =>
        isActiveStrategy(s.statusRaw) &&
        cycleMatches(s.marketCycles, currentCycle)
    )
    .sort((a, b) => {
      const pa = perf.get(a.canonicalName) || {
        total: 0,
        wins: 0,
        pnl: 0,
        lastDate: "",
      };
      const pb = perf.get(b.canonicalName) || {
        total: 0,
        wins: 0,
        pnl: 0,
        lastDate: "",
      };
      return (pb.total || 0) - (pa.total || 0) || (pb.pnl || 0) - (pa.pnl || 0);
    })
    .slice(0, 6);

  html += `
  <div style="margin:-6px 0 14px 0; padding:10px 12px; background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.18); border-radius:8px;">
    <div style="font-weight:700; opacity:0.75; margin-bottom:6px;">🌊 今日市场周期: <span style="color:${
      cfg.colors.demo
    }">${prettyCycles(currentCycle, 4) || "无/N/A"}</span></div>
    <div style="font-size:0.85em; opacity:0.75;">
      ${
        rec.length
          ? `推荐优先关注：${rec
              .map(
                (s) => {
                  const safePath = s?.file?.path;
                  const safeHref = safePath ? encodeURI(safePath) : "";
                  const label = prettyName(
                    s?.displayName || s?.canonicalName || s?.file?.name
                  );
                  return safeHref
                    ? `<a href=\"${safeHref}\" class=\"internal-link\" style=\"white-space:nowrap; text-decoration:none;\">${label}</a>`
                    : `<span style=\"white-space:nowrap;\">${label}</span>`;
                }
              )
              .join(" · ")}`
          : "暂无匹配的实战策略（可去 Today 里补充周期/或按形态匹配）。"
      }
    </div>
  </div>`;
}

// 按市场周期分组显示
const groupByName = new Map(cycleGroupDefs.map((d) => [d.name, d]));
const groupBuckets = new Map(cycleGroupDefs.map((d) => [d.name, []]));
const otherBucket = [];

const matchesGroup = (def, cycles) => {
  const keywords = def?.keywords || [];
  return keywords.some((k) =>
    cycles.some((c) => c.includes(k) || k.includes(c))
  );
};

for (const s of strategies) {
  const cycles = (s.marketCycles || []).map(normStr).filter(Boolean);
  let assigned = null;

  for (const name of groupAssignPriority) {
    const def = groupByName.get(name);
    if (def && matchesGroup(def, cycles)) {
      assigned = name;
      break;
    }
  }

  if (!assigned) {
    for (const def of cycleGroupDefs) {
      if (matchesGroup(def, cycles)) {
        assigned = def.name;
        break;
      }
    }
  }

  if (assigned) groupBuckets.get(assigned).push(s);
  else otherBucket.push(s);
}

cycleGroupDefs.forEach((def) => {
  const groupName = def.name;
  let matches = groupBuckets.get(groupName) || [];

  // 让列表更“可用”：实战优先，其次近期/使用/表现
  matches = matches.sort((a, b) => {
    const aActive = isActiveStrategy(a.statusRaw) ? 1 : 0;
    const bActive = isActiveStrategy(b.statusRaw) ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;

    const pa = perf.get(a.canonicalName) || {
      total: 0,
      wins: 0,
      pnl: 0,
      lastDate: "",
    };
    const pb = perf.get(b.canonicalName) || {
      total: 0,
      wins: 0,
      pnl: 0,
      lastDate: "",
    };
    if ((pb.lastDate || "") !== (pa.lastDate || ""))
      return (pb.lastDate || "").localeCompare(pa.lastDate || "");
    if ((pb.total || 0) !== (pa.total || 0))
      return (pb.total || 0) - (pa.total || 0);
    if ((pb.pnl || 0) !== (pa.pnl || 0)) return (pb.pnl || 0) - (pa.pnl || 0);
    return (a.displayName || a.canonicalName || "").localeCompare(
      b.displayName || b.canonicalName || ""
    );
  });

  if (matches.length > 0) {
    html += `<div style="margin-bottom:14px;">
      <div style="font-size:0.85em; opacity:0.7; font-weight:bold; margin-bottom:8px;">${groupName} (${matches.length})</div>
      <div style="display:flex; flex-direction:column; gap:8px;">`;

    for (let s of matches) {
      const page = dv.page(s.file.path);
      let strategyName = prettyName(s.displayName || s.canonicalName || s.file.name);
      const p = perf.get(s.canonicalName) || {
        total: 0,
        wins: 0,
        pnl: 0,
        lastDate: "",
      };
      let winRate = safePct(p.wins, p.total);
      let riskReward =
        page?.["盈亏比/risk_reward"] ||
        page?.["risk_reward"] ||
        page?.["盈亏比"] ||
        "无/N/A";
      let status = s.statusRaw || "学习中";
      let usageCount = p.total || 0;
      let setupCategory = (s.setupCategories || [])
        .slice(0, 2)
        .map(prettyName)
        .join(", ");
      let source = prettyName(s.source || "");

      // 获取市场周期
      let cycleText = (s.marketCycles || [])
        .slice(0, 2)
        .map(cycleToCn)
        .join(", ");

      // 状态颜色
      let statusColor =
        status === "实战中"
          ? "#22c55e"
          : status === "验证中"
          ? "#fbbf24"
          : status === "学习中"
          ? "#3b82f6"
          : "#6b7280";

      // 胜率颜色
      let winRateColor =
        winRate >= 60
          ? "#22c55e"
          : winRate >= 50
          ? "#fbbf24"
          : winRate > 0
          ? "#ef4444"
          : "#6b7280";

      // 生成唯一ID（避免中文/空导致空ID）
      const cardIdBase = normStr(
        s?.file?.path || s?.file?.name || s?.canonicalName || strategyName
      );
      const cardIdSlug = (cardIdBase || "strategy")
        .replace(/[^a-zA-Z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      let cardId = `strategy-${cardIdSlug || "strategy"}`;
      const safePath = s?.file?.path;
      const safeHref = safePath ? encodeURI(safePath) : "";

      html += `
      <div style="
        background:rgba(255,255,255,0.03);
        border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;
        overflow:hidden;
        transition: all 0.2s;
      " onmouseover="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(59,130,246,0.3)';" 
         onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.borderColor='rgba(255,255,255,0.1)';">
        
        <!-- 卡片头部 - 可点击展开 -->
        <div onclick="
          let detail = document.getElementById('${cardId}');
          let arrow = document.getElementById('${cardId}-arrow');
          if(detail.style.display === 'none') {
            detail.style.display = 'block';
            arrow.style.transform = 'rotate(90deg)';
          } else {
            detail.style.display = 'none';
            arrow.style.transform = 'rotate(0deg)';
          }
        " style="
          padding:8px 10px;
          cursor:pointer;
          display:flex;
          justify-content:space-between;
          align-items:center;
        ">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="font-size:0.88em; font-weight:600; color:${
                cfg.colors.demo
              };">${strategyName}</span>
              <span style="font-size:0.65em; padding:2px 6px; background:${statusColor}20; color:${statusColor}; border-radius:3px;">● ${status}</span>
            </div>
            <div style="display:flex; gap:10px; font-size:0.68em; opacity:0.7; flex-wrap:wrap;">
              <span>📊 R/R: <strong>${riskReward}</strong></span>
              ${
                winRate > 0
                  ? `<span>✓ 胜率: <strong style="color:${winRateColor};">${winRate}%</strong></span>`
                  : ""
              }
              ${
                usageCount > 0
                  ? `<span>🔢 使用: <strong>${usageCount}次</strong></span>`
                  : ""
              }
              ${
                p.lastDate
                  ? `<span>🕒 最近: <strong>${p.lastDate}</strong></span>`
                  : ""
              }
            </div>
          </div>
          <div id="${cardId}-arrow" style="
            font-size:0.8em; 
            opacity:0.5; 
            transition:transform 0.2s;
            transform:rotate(0deg);
          ">▶</div>
        </div>
        
        <!-- 展开详情 -->
        <div id="${cardId}" style="
          display:none;
          padding:0 10px 10px 10px;
          border-top:1px solid rgba(255,255,255,0.05);
          animation: slideDown 0.2s ease-out;
        ">
          <div style="margin-top:8px; font-size:0.74em;">
            <div style="display:grid; grid-template-columns: auto 1fr; gap:6px 12px; opacity:0.8;">
              <span style="opacity:0.6;">市场周期:</span>
              <span>${cycleText || "无/N/A"}</span>
              
              <span style="opacity:0.6;">设置类别:</span>
              <span>${setupCategory || "无/N/A"}</span>
              
              <span style="opacity:0.6;">来源:</span>
              <span>${source || "无/N/A"}</span>
            </div>
            
            <div style="margin-top:10px; display:flex; gap:6px;">
              <a href="${safeHref}" class="internal-link" style="
                flex:1;
                background:rgba(59,130,246,0.15);
                color:${cfg.colors.demo};
                padding:6px 10px;
                border-radius:4px;
                text-decoration:none;
                font-size:0.75em;
                text-align:center;
                border:1px solid rgba(59,130,246,0.3);
              ">${safePath ? "📖 查看详情" : "⚠️ 无法打开"}</a>
            </div>
          </div>
        </div>
      </div>`;
    }
    html += `</div></div>`;
  }
});

// 未分类
if (otherBucket.length > 0) {
  html += `<div style="margin-bottom:14px;">
    <div style="font-size:0.85em; opacity:0.7; font-weight:bold; margin-bottom:8px;">📦 其他/未分类 (${otherBucket.length})</div>
    <div style="display:flex; flex-direction:column; gap:8px;">`;
  otherBucket
    .sort((a, b) =>
      (a.displayName || a.canonicalName || "").localeCompare(
        b.displayName || b.canonicalName || ""
      )
    )
    .forEach((s) => {
      const name = prettyName(
        s.displayName || s.canonicalName || s.file?.name || "(未命名)"
      );
      const safePath = s?.file?.path;
      const safeHref = safePath ? encodeURI(safePath) : "";
      html += `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <div style="font-size:0.88em; font-weight:600; color:${
            cfg.colors.demo
          };">${name}</div>
          <a href="${safeHref}" class="internal-link" style="font-size:0.75em; opacity:0.75; text-decoration:none;">${
        safePath ? "打开 →" : "缺少路径"
      }</a>
        </div>`;
    });
  html += `</div></div>`;
}

// 快速访问链接
html += `<div style="margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.1);">
  <div style="display:flex; gap:8px; flex-wrap:wrap;">
    <a href="策略仓库 (Strategy Repository)/太妃方案/太妃方案.md" class="internal-link" style="
      background:rgba(147,51,234,0.15);
      color:#a855f7;
      padding:4px 10px;
      border-radius:4px;
      text-decoration:none;
      font-size:0.75em;
      border:1px solid rgba(147,51,234,0.3);
    ">📚 太妃方案</a>
    <span style="
      background:rgba(100,100,100,0.15);
      color:#888;
      padding:4px 10px;
      border-radius:4px;
      font-size:0.75em;
      border:1px solid rgba(100,100,100,0.3);
    ">📖 Al Brooks经典 (即将推出)</span>
  </div>
</div>`;

// --- 📊 策略表现统计 (Strategy Performance) ---
// 生成统计表格 HTML
let statsHtml = `<div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--background-modifier-border);">
<div style="font-weight:700; opacity:0.7; margin-bottom:10px;">🏆 实战表现 (Performance)</div>
<table style="width:100%; font-size:0.85em; border-collapse: collapse;">
    <tr style="border-bottom:1px solid var(--background-modifier-border); text-align:left; color:var(--text-muted);">
        <th style="padding:4px;">策略</th>
        <th style="padding:4px;">胜率</th>
        <th style="padding:4px;">盈亏</th>
        <th style="padding:4px;">次数</th>
    </tr>`;

// 排序并生成行（按盈亏排序）
[...perf.entries()]
  .sort((a, b) => (b[1].pnl || 0) - (a[1].pnl || 0))
  .forEach(([canonical, s]) => {
    const winRate = safePct(s.wins, s.total);
    const pnlColor =
      s.pnl > 0 ? "#22c55e" : s.pnl < 0 ? "#ef4444" : "var(--text-muted)";

    const item = strategyByName?.get?.(canonical);
    const display = prettyName(item?.displayName || canonical);
    const nameDisplay = item?.file?.path
      ? `<a href="${encodeURI(
          item.file.path
        )}" class="internal-link">${display}</a>`
      : display;

    statsHtml += `
        <tr style="border-bottom:1px solid var(--background-modifier-border);">
            <td style="padding:6px 4px;">${nameDisplay}</td>
            <td style="padding:6px 4px;">${winRate}%</td>
            <td style="padding:6px 4px; color:${pnlColor}; font-weight:bold;">${
      s.pnl > 0 ? "+" : ""
    }${Math.round(s.pnl)}</td>
            <td style="padding:6px 4px;">${s.total}</td>
        </tr>`;
  });

statsHtml += `</table></div>`;
html += statsHtml;

const root = dv.el("div", "", { attr: { style: cfg.colors.cardBg } });
root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🗂️ 策略仓库 (Strategy Repository)</div>
${
  html ||
  `<div style='opacity:0.5; font-size:0.8em;'>暂无策略卡片。<br>请在策略仓库中创建策略卡片。</div>`
}
`;

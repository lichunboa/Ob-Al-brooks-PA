/* 文件名: Scripts/pa-core.js (v14.6 FIXED)
   用途: 核心数据引擎 (修复版)
   修复: 找回了因篇幅省略导致的记忆库 (SR) 和课程数据计算逻辑
*/

// 引入依赖
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const utils = require(basePath + "/scripts/pa-utils.js");

const startT = performance.now();
const todayStr = moment().format("YYYY-MM-DD");

// --- 1. 缓存控制 (Smart Cache) ---
// 强制刷新: 由各视图/按钮置位 window.paForceReload=true 触发
const forceReload = window.paForceReload === true;
window.paForceReload = false;

// 统一 Dataview 刷新：兼容不同版本的 commandId
window.paRefreshViews = async (opts = {}) => {
  try {
    if (opts.hard) window.paForceReload = true;
    const cmdIds = [
      "dataview:force-refresh-views",
      "dataview:dataview-force-refresh-views",
    ];
    for (const id of cmdIds) {
      try {
        await app.commands.executeCommandById(id);
        return true;
      } catch (_) {
        // try next id
      }
    }
  } catch (e) {
    console.log("paRefreshViews failed", e);
  }
  return false;
};

let useCache = false;

// 缓存过期控制（默认使用 cfg.settings.cacheExpiry）
const cacheExpiryMs = Number(cfg?.settings?.cacheExpiry || 0);
const nowMs = Date.now();
const cacheFresh =
  !cacheExpiryMs ||
  (window.paData &&
    typeof window.paData.cacheTs === "number" &&
    nowMs - window.paData.cacheTs < cacheExpiryMs);

if (
  !forceReload &&
  cacheFresh &&
  window.paData &&
  window.paData.tradesAsc &&
  window.paData.tradesAsc.length > 0
) {
  // 深度检查: 确保关键数据结构都存在
  if (
    window.paData.tradesAsc[0].ticker !== undefined &&
    window.paData.sr &&
    window.paData.sr.load && // 确保 load 存在
    window.paData.sr.fileList &&
    window.paData.strategyIndex
  ) {
    useCache = true;
  }
}

// 数据容器初始化
let trades = [];
let stats = { livePnL: 0, liveWin: 0, liveCount: 0, tuition: 0, errors: {} };
let srData = {
  total: 0,
  due: 0,
  reviewed: 0,
  avgEase: 0,
  score: 0,
  status: "🌱 初始",
  load: {}, // 这是一个必须初始化的对象，否则 View 会报错
  folders: {},
  fileList: [],
  cnt: { cloze: 0, sNorm: 0, sRev: 0, mNorm: 0, mRev: 0 },
  quizPool: [],
  focusFile: null,
};
let courseData = { done: new Set(), map: {}, syllabus: [], hybridRec: null };
let strategyIndex = {
  repoPath: "策略仓库 (Strategy Repository)",
  list: [],
  byName: new Map(), // canonicalName -> item
  lookup: new Map(), // alias (CN/EN/Full) -> canonicalName
  byPattern: {}, // pattern -> canonicalName
  updatedAt: null,
};

// ============================================================
// 1.5 智能复盘要点（仅生成 hints，不改 UI）
// ============================================================
const buildReviewHints = (trade) => {
  try {
    const hints = [];
    const push = (id, zh, en) => hints.push({ id, zh, en });

    const has = (v) => {
      if (v === null || v === undefined) return false;
      if (Array.isArray(v)) return v.length > 0;
      const s = String(v).trim();
      return !!s && s !== "Unknown";
    };

    const setup = trade?.setup;
    const cycle = trade?.market_cycle;
    const tf = trade?.tf;
    const dir = trade?.dir;
    const ticker = trade?.ticker;
    const patterns = Array.isArray(trade?.patterns) ? trade.patterns : [];
    const err = trade?.error;
    const r = trade?.r;

    push(
      "context",
      "一句话复述市场背景（趋势/区间/突破）与当天关键位置（磁体/支撑阻力）。",
      "In one sentence: market context (trend/range/breakout) and key levels (magnet/SR)."
    );

    if (!has(setup)) {
      push(
        "setup_missing",
        "补齐设置类别：这笔更像哪类 setup？（趋势回调/突破/反转/楔形/双顶底/末端旗形…）",
        "Fill setup category: which setup fits best (pullback/breakout/reversal/wedge/DTDB/final flag…)?"
      );
    }

    if (!has(cycle)) {
      push(
        "cycle_missing",
        "补齐市场周期：强趋势/弱趋势/区间/突破模式/通道？用一词标注。",
        "Fill market cycle: strong trend/weak trend/range/breakout mode/channel—label with one term."
      );
    }

    if (!has(trade?.strategyName) || trade?.strategyName === "Unknown") {
      push(
        "strategy_missing",
        "补齐策略名称：用策略卡的规范名（中文/英文）记录，方便后续统计与复盘检索。",
        "Fill strategy name: use the canonical strategy card name (CN/EN) for consistent stats/search."
      );
    }

    if (patterns.length === 0) {
      push(
        "patterns_missing",
        "补齐观察到的形态：至少写 1 个最关键的形态或信号（如：楔形/双顶底/末端旗形/缺口…）。",
        "Fill observed patterns: record at least one key pattern/signal (wedge/DTDB/final flag/gap…)."
      );
    }

    if (!has(tf)) {
      push(
        "tf_missing",
        "补齐时间周期：这笔的执行周期是什么？（如 5分钟/15分钟/1小时/日线）",
        "Fill timeframe: what execution timeframe (e.g., 5m/15m/1h/daily)?"
      );
    }

    if (!has(ticker)) {
      push(
        "ticker_missing",
        "补齐品种：这笔交易的标的是什么？（SPX/ES/NQ/…）",
        "Fill ticker: what instrument (SPX/ES/NQ/…)?"
      );
    }

    if (!has(dir)) {
      push(
        "dir_missing",
        "补齐方向：做多/做空？为什么顺势/逆势？",
        "Fill direction: long/short? why with-trend or counter-trend?"
      );
    }

    push(
      "entry_logic",
      "写清入场理由：触发点是什么？（信号K、突破/回调到位、二次入场等）",
      "Entry logic: what triggered the entry (signal bar, breakout/pullback, second entry, etc.)?"
    );

    push(
      "risk_mgmt",
      "写清风控：止损放哪、初始风险、是否加仓/减仓、何时移动止损？",
      "Risk management: stop placement, initial risk, scaling in/out, and stop management."
    );

    if (typeof r === "number" && !Number.isNaN(r)) {
      if (r < 0) {
        push(
          "loss_review",
          "亏损复盘：这是计划内亏损还是错误亏损？下一次如何避免同类错误？",
          "Loss review: planned loss or error loss? what will you change next time?"
        );
      } else if (r > 0) {
        push(
          "win_review",
          "盈利复盘：有没有过早止盈/错过加仓/持仓管理可以优化？",
          "Win review: any early exit/missed scale-in/management improvements?"
        );
      }
    }

    if (has(err) && String(err).trim() !== "None" && String(err).trim() !== "无") {
      push(
        "error_review",
        "针对执行评价：具体哪里做得不对？给出 1 条可执行的改进规则。",
        "Execution quality: what exactly went wrong? write 1 actionable improvement rule."
      );
    }

    return hints;
  } catch (e) {
    return [];
  }
};

// ============================================================
// 2. 数据加载逻辑
// ============================================================

if (useCache) {
  // ⚡️ 极速模式
  trades = window.paData.tradesAsc;
  stats = window.paData.stats;
  srData = window.paData.sr;
  courseData = window.paData.course;
  strategyIndex = window.paData.strategyIndex;
} else {
  // 🐢 扫描模式 (Full Scan)

  // --- A. 交易数据处理 ---
  const tradePages = dv
    .pages(`${cfg.tags.trade}`)
    .where((p) => !p.file.path.includes(cfg.paths.templates));

  for (let t of tradePages) {
    // 增强的日期解析逻辑
    let dateStr = "";
    let rawDate = t.date || t.file.day;

    if (rawDate) {
      if (rawDate.path) {
        // 处理链接类型 [[2025-12-19]] -> "2025-12-19"
        // 假设文件名就是日期，或者链接文本是日期
        // Dataview Link 对象: { path: "...", display: "...", ... }
        // 通常 path 是 "2025-12-19.md" 或 "2025-12-19"
        let path = rawDate.path;
        // 移除扩展名
        dateStr = path.replace(/\.md$/i, "").split("/").pop();
      } else if (rawDate.ts) {
        // 处理 Luxon DateTime 对象 (Dataview 默认日期格式)
        dateStr = moment(rawDate.ts).format("YYYY-MM-DD");
      } else {
        // 处理字符串或其他
        dateStr = rawDate.toString();
      }
    }

    // 验证日期有效性，无效则回退到文件创建时间
    let m = moment(dateStr, [
      "YYYY-MM-DD",
      "YYYYMMDD",
      "MM-DD-YYYY",
      "DD-MM-YYYY",
    ]);
    let date = m.isValid()
      ? m.format("YYYY-MM-DD")
      : moment(t.file.ctime.ts).format("YYYY-MM-DD");

    let pnl = utils.getVal(t, ["净利润/net_profit", "net_profit"]);
    let rawAcct = utils.getStr(t, ["账户类型/account_type", "account_type"]);
    let type = utils.getAccountType(rawAcct);

    // 兼容新旧字段名：优先找 execution_quality
    let errStr = utils.getStr(t, [
      "执行评价/execution_quality",
      "execution_quality",
      "管理错误/management_error",
      "management_error",
    ]);

    // 学费统计逻辑优化：Valid Scratch (黄色) 不计入学费
    if (type === "Live" && pnl < 0) {
      let isBadError =
        !errStr.includes("Perfect") &&
        !errStr.includes("Valid") &&
        !errStr.includes("None") &&
        !errStr.includes("完美") &&
        !errStr.includes("主动");
      if (isBadError) {
        let k = errStr.split("(")[0].trim();
        stats.tuition += Math.abs(pnl);
        stats.errors[k] = (stats.errors[k] || 0) + Math.abs(pnl);
      }
    }
    if (type === "Live") {
      stats.livePnL += pnl;
      stats.liveCount++;
      if (pnl > 0) stats.liveWin++;
    }

    // R值计算
    let initRisk = utils.getVal(t, ["初始风险/initial_risk", "initial_risk"]);
    let r = 0;
    if (initRisk !== 0) {
      // 修复: 即使初始风险写成负数(如 -16.6), 也取绝对值作为分母
      r = pnl / Math.abs(initRisk);
    } else {
      let entry = utils.getVal(t, ["入场/entry_price", "entry_price", "entry"]);
      let stop = utils.getVal(t, ["止损/stop_loss", "stop_loss", "stop"]);
      let exit =
        utils.getVal(t, ["离场/exit_price", "exit_price", "exit"]) || entry;
      let rawR = utils.calculateR(entry, stop, exit);
      if (pnl < 0 && rawR > 0) rawR = -rawR;
      if (pnl > 0 && rawR < 0) rawR = -rawR;
      r = rawR;
    }

    const tradeItem = {
      id: t.file.path,
      link: t.file.link,
      name: t.file.name,
      date: date,
      type: type,
      pnl: pnl,
      r: r,
      setup: utils.getStr(t, ["设置类别/setup_category", "setup_category"]),
      market_cycle: utils.getStr(t, ["市场周期/market_cycle", "market_cycle"]),
      error: errStr,
      cover: t["封面/cover"] || t["cover"] || "Unknown", // 保留原始值,不清洗
      ticker: utils.getStr(t, ["品种/ticker", "ticker"]),
      dir: utils.getStr(t, ["方向/direction", "direction"]),
      tf: utils.getStr(t, ["时间周期/timeframe", "timeframe"]),
      order: utils.getStr(t, ["订单类型/order_type", "order_type"]),
      signal: utils.getStr(t, [
        "信号K/signal_bar_quality",
        "signal_bar_quality",
      ]),
      plan: utils.getStr(t, ["交易方程/trader_equation", "trader_equation"]),
      // 新增原始字段用于合规性检查
      cycle: t["市场周期/market_cycle"] || t["market_cycle"],
      rawSetup: t["设置类别/setup_category"] || t["setup_category"],
      // 补充缺失数据 (用于高级分析)
      entry: utils.getVal(t, ["入场/entry_price", "entry_price", "entry"]),
      exit: utils.getVal(t, ["离场/exit_price", "exit_price", "exit"]),
      stop: utils.getVal(t, ["止损/stop_loss", "stop_loss", "stop"]),
      tags: t.file.tags || [],
      patterns: utils.getArr(t, [
        "观察到的形态/patterns_observed",
        "patterns_observed",
      ]),
      strategyName: utils.getStr(t, [
        "策略名称/strategy_name",
        "strategy_name",
      ]),
    };

    // v5.0: 智能复盘要点（仅生成，不改变现有 UI）
    tradeItem.reviewHints = buildReviewHints(tradeItem);

    trades.push(tradeItem);
  }
  trades.sort((a, b) => a.date.localeCompare(b.date)); // 正序

  // --- B. 记忆库数据处理 (智能增量更新) ---
  // 优化: 如果内存中已有 SR 数据且不是强制完全重载，则复用旧数据，避免每次改交易都重读所有卡片
  if (
    window.paData &&
    window.paData.sr &&
    window.paData.sr.total > 0 &&
    !forceReload
  ) {
    srData = window.paData.sr;
    // console.log("🚀 复用 SR 缓存数据");
  } else {
    const srPages = dv.pages(
      `${cfg.tags.flashcards} AND -"${cfg.paths.templates}"`
    );
    let easeSum = 0;
    const srRegex = /!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)/g;

    await Promise.all(
      srPages.map(async (p) => {
        try {
          let file = app.vault.getAbstractFileByPath(p.file.path);
          if (!file) return;
          let content = await app.vault.read(file);
          if (!content) return;

          // 简单清洗代码块
          let clean = content
            .replace(/```[\s\S]*?```/g, "")
            .replace(/`[^`]*`/g, "");

          // 统计卡片
          let c_cloze = (clean.match(/==[^=]+==/g) || []).length;
          let c_sRev = (clean.match(/(?<!:):{3}(?!:)/g) || []).length;
          let c_sNorm = (clean.match(/(?<!:):{2}(?!:)/g) || []).length;
          let c_mRev = (clean.match(/^(?:\>)?\s*\?{2}\s*$/gm) || []).length;
          let c_mNorm = (clean.match(/^(?:\>)?\s*\?{1}\s*$/gm) || []).length;

          let fileCards = c_cloze + c_sNorm + c_mNorm + c_sRev * 2 + c_mRev * 2;
          srData.total += fileCards;
          srData.cnt.cloze += c_cloze;
          srData.cnt.sRev += c_sRev;
          srData.cnt.sNorm += c_sNorm;
          srData.cnt.mRev += c_mRev;
          srData.cnt.mNorm += c_mNorm;

          // 抓取题目
          let singleMatches = [...clean.matchAll(/^(.+?)::(.+)$/gm)];
          singleMatches.forEach((m) =>
            srData.quizPool.push({
              q: m[1].trim(),
              file: p.file.name,
              path: p.file.path,
              type: "Basic",
            })
          );

          // 文件夹归属
          let folderName = p.file.folder.split("/").pop() || "Root";
          if (fileCards > 0)
            srData.folders[folderName] =
              (srData.folders[folderName] || 0) + fileCards;

          let fStat = {
            name: p.file.name,
            path: p.file.path,
            folder: folderName,
            count: fileCards,
            due: 0,
            easeSum: 0,
            easeCount: 0,
            avgEase: 250,
          };

          // SR 数据提取 (关键修复点)
          let matches = [...content.matchAll(srRegex)];
          matches.forEach((m) => {
            srData.reviewed++;
            let d = m[1];
            let ease = parseInt(m[3]);
            easeSum += ease;

            // 填充 load 对象，防止 View 报错
            if (d <= todayStr) {
              srData.due++;
            } else {
              srData.load[d] = (srData.load[d] || 0) + 1;
            }

            fStat.easeSum += ease;
            fStat.easeCount++;
            if (d <= todayStr) fStat.due++;
          });

          if (fStat.easeCount > 0)
            fStat.avgEase = Math.round(fStat.easeSum / fStat.easeCount);
          if (fileCards > 0) srData.fileList.push(fStat);
        } catch (e) {}
      })
    );

    // 计算最难文件
    srData.fileList.sort((a, b) => b.count - a.count);
    let dueFiles = srData.fileList.filter((f) => f.due > 0);
    if (dueFiles.length > 0) {
      dueFiles.sort((a, b) => a.avgEase - b.avgEase);
      srData.focusFile = dueFiles[0];
    } else if (srData.fileList.length > 0) {
      let hardFiles = [...srData.fileList].sort(
        (a, b) => a.avgEase - b.avgEase
      );
      srData.focusFile = hardFiles[0];
    }

    // 计算全局分数
    if (srData.reviewed > 0) {
      srData.avgEase = easeSum / srData.reviewed;
      let rawScore = (srData.avgEase / cfg.settings.masteryDivider) * 100;
      srData.score = Math.min(100, Math.round(rawScore));
      if (srData.due > 50) srData.status = "🔥 积压 (Overload)";
      else if (srData.score < 70) srData.status = "🧠 吃力 (Hard)";
      else if (srData.score > 90) srData.status = "🦁 精通 (Master)";
      else srData.status = "🟢 健康 (Healthy)";
    }
  }

  // --- C. 课程进度处理 (智能增量更新) ---
  if (
    window.paData &&
    window.paData.course &&
    window.paData.course.syllabus.length > 0 &&
    !forceReload
  ) {
    courseData = window.paData.course;
    // console.log("🚀 复用 Course 缓存数据");
  } else {
    const coursePages = dv.pages(`${cfg.tags.course}`);
    for (let p of coursePages) {
      let ids = p.module_id;
      if (!ids) continue;
      if (!Array.isArray(ids)) ids = [ids];
      for (let id of ids) {
        let strId = id.toString();
        courseData.map[strId] = p.file.link;
        if (p.studied) courseData.done.add(strId);
      }
    }
    // 读取大纲文件
    const syFile = app.vault
      .getFiles()
      .find((f) => f.name === cfg.paths.syllabus);
    if (syFile) {
      try {
        const syText = await app.vault.read(syFile);
        const start = syText.indexOf("[");
        const end = syText.lastIndexOf("]");
        if (start !== -1 && end !== -1)
          courseData.syllabus = JSON.parse(syText.substring(start, end + 1));
      } catch (e) {}
    }
  }

  // --- D. 策略索引 (Single Source of Truth) ---
  // 统一策略仓库字段、别名、形态映射，供 Today/Playbook/Inspector/Analytics 复用
  try {
    const strategyRepo = strategyIndex.repoPath;
    const stratPages = dv.pages(`"${strategyRepo}"`);

    strategyIndex.list = [];
    strategyIndex.byName = new Map();
    strategyIndex.lookup = new Map();
    strategyIndex.byPattern = {};

    const toArr = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      if (v?.constructor && v.constructor.name === "Proxy")
        return Array.from(v);
      return [v];
    };
    const normStr = (v) =>
      v === undefined || v === null ? "" : v.toString().trim();
    const addLookup = (alias, canonical) => {
      const k = normStr(alias);
      if (!k) return;
      strategyIndex.lookup.set(k, canonical);
      strategyIndex.lookup.set(k.toLowerCase(), canonical);
    };

    const firstScalar = (val) => {
      if (val === undefined || val === null) return null;
      if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
      if (val?.constructor && val.constructor.name === "Proxy") {
        try {
          const arr = Array.from(val);
          return arr.length > 0 ? arr[0] : null;
        } catch (e) {
          return null;
        }
      }
      return val;
    };
    const getRawStr = (page, keys, fallback = "") => {
      for (let k of keys) {
        let v = page?.[k];
        if (v === undefined || v === null) continue;
        v = firstScalar(v);
        if (v === undefined || v === null) continue;
        const s = v.toString().trim();
        if (s) return s;
      }
      return fallback;
    };

    for (let p of stratPages) {
      // 注意：这里不能用 utils.getStr（会把“中文 (English)”清洗成只剩英文）
      const rawStrategyName = getRawStr(
        p,
        ["策略名称/strategy_name", "strategy_name"],
        ""
      );

      // 只收录真正的“策略卡片”，排除方案说明/索引页
      const cats = toArr(p?.categories || p?.category || []).map(normStr);
      const tags = toArr(p?.tags || p?.tag || []).map(normStr);
      const isStrategyCard =
        !!rawStrategyName ||
        cats.includes("策略") ||
        tags.some((t) => t === "PA/Strategy" || t.endsWith("/Strategy"));
      if (!isStrategyCard) continue;

      const canonicalName = rawStrategyName || p.file.name;

      const statusRaw = getRawStr(
        p,
        ["策略状态/strategy_status", "strategy_status", "策略状态"],
        ""
      );

      const marketCycles = toArr(
        p["市场周期/market_cycle"] || p["market_cycle"] || p["市场周期"]
      )
        .map(normStr)
        .filter(Boolean);
      const setupCategories = toArr(
        p["设置类别/setup_category"] || p["setup_category"] || p["设置类别"]
      )
        .map(normStr)
        .filter(Boolean);
      const patterns = toArr(
        p["观察到的形态/patterns_observed"] ||
          p["patterns_observed"] ||
          p["观察到的形态"]
      )
        .map(normStr)
        .filter(Boolean);
      const source = getRawStr(p, ["来源/source", "source", "来源"], "");

      let displayName = canonicalName;
      if (displayName.includes("(") && displayName.includes(")")) {
        displayName = displayName.split("(")[0].trim();
      }

      const item = {
        canonicalName,
        displayName,
        statusRaw,
        marketCycles,
        setupCategories,
        patterns,
        source,
        file: p.file,
      };

      strategyIndex.list.push(item);
      strategyIndex.byName.set(canonicalName, item);

      addLookup(canonicalName, canonicalName);
      if (canonicalName.includes("(") && canonicalName.includes(")")) {
        const parts = canonicalName.split("(");
        const cn = parts[0].trim();
        const en = parts[1].replace(")", "").trim();
        if (cn) addLookup(cn, canonicalName);
        if (en) addLookup(en, canonicalName);
      }

      for (const pat of patterns) {
        strategyIndex.byPattern[pat] = canonicalName;
        if (pat.includes("(") && pat.includes(")")) {
          const m = pat.match(/\(([^)]+)\)/);
          if (m && m[1]) strategyIndex.byPattern[m[1].trim()] = canonicalName;
        }
      }
    }

    strategyIndex.updatedAt = moment().format("YYYY-MM-DD HH:mm:ss");
  } catch (e) {
    console.log("策略索引构建失败", e);
  }
}

// ============================================================
// 3. 混合推荐 (每次运行重算)
// ============================================================
let candidates = [];
if (courseData.syllabus.length > 0) {
  let nextItem = courseData.syllabus.find(
    (s) => !courseData.done.has(s.id.toString())
  );
  if (nextItem) candidates.push({ type: "New", data: nextItem, weight: 30 });
}
if (srData.quizPool.length > 0) {
  for (let i = 0; i < 5; i++) {
    let randQ =
      srData.quizPool[Math.floor(Math.random() * srData.quizPool.length)];
    candidates.push({ type: "Quiz", data: randQ, weight: 20 });
  }
}
if (candidates.length > 0) {
  let totalWeight = candidates.reduce((acc, c) => acc + c.weight, 0);
  let randomNum = Math.random() * totalWeight;
  let weightSum = 0;
  for (let c of candidates) {
    weightSum += c.weight;
    if (randomNum <= weightSum) {
      courseData.hybridRec = c;
      break;
    }
  }
}

// ============================================================
// 4. 数据挂载 & 状态栏
// ============================================================
window.paData = {
  trades: [...trades].reverse(),
  tradesAsc: trades,
  stats: stats,
  sr: srData,
  course: courseData,
  strategyIndex: strategyIndex,
  updateTime: moment().format("HH:mm:ss"),
  cacheTs: Date.now(),
  loadTime: (performance.now() - startT).toFixed(0) + "ms",
  isCached: useCache,
};

const refreshBtnId = "pa-refresh-" + Date.now();
const hardBtnId = "pa-reload-" + Date.now();
let pnlColor =
  stats.livePnL > 0
    ? cfg.colors.live
    : stats.livePnL < 0
    ? cfg.colors.loss
    : "inherit";
let statusIcon = useCache ? "⚡️" : "🐢";

dv.el(
  "div",
  `
<div style="font-size: 0.75em; opacity: 0.6; text-align: right; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-family: monospace; margin-bottom: 10px; display:flex; justify-content:flex-end; align-items:center; gap:10px;">
    <span>${statusIcon} v14.6 FIXED</span>
    <span>Live: <strong style="color:${pnlColor}">$${stats.livePnL.toFixed(
    2
  )}</strong></span>
    <span>Cards: ${srData.total}</span>
    <button id="${refreshBtnId}" title="换推荐 (不读文件)" style="background:rgba(255,255,255,0.1); border:none; color:#ccc; cursor:pointer; padding:2px 8px; border-radius:4px;">🎲 换一换</button>
    <button id="${hardBtnId}" title="重新扫描全库 (新笔记后点这个)" style="background:none; border:1px solid rgba(255,255,255,0.2); color:#666; cursor:pointer; padding:2px 6px; border-radius:4px;">↻ 数据</button>
</div>
`
);

setTimeout(() => {
  const btnRefresh = document.getElementById(refreshBtnId);
  const btnHard = document.getElementById(hardBtnId);
  if (btnRefresh)
    btnRefresh.onclick = () => window.paRefreshViews?.({ hard: false });
  if (btnHard)
    btnHard.onclick = () => {
      new Notice("正在重新扫描全库...");
      window.paRefreshViews?.({ hard: true });
    };
}, 500);

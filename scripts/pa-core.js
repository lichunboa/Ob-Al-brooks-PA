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

// 避免并发/递归刷新导致的卡死
window.__paBuilding = true;

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

    // 兜底 1：按名称动态寻找命令（Dataview 不同版本 commandId 可能变化）
    try {
      const cmds = app?.commands?.commands || {};
      const needle = "force refresh";
      let foundId = null;
      for (const [id, cmd] of Object.entries(cmds)) {
        const name = (cmd?.name || "").toString().toLowerCase();
        if (name.includes("dataview") && name.includes(needle)) {
          foundId = id;
          break;
        }
      }
      if (foundId) {
        await app.commands.executeCommandById(foundId);
        return true;
      }
    } catch (e) {
      // ignore
    }

    // 兜底 2：尝试 Dataview API（若存在）
    try {
      const dvPlugin = app?.plugins?.plugins?.dataview;
      if (dvPlugin?.api?.forceRefresh) {
        await dvPlugin.api.forceRefresh();
        return true;
      }
      if (dvPlugin?.api?.refresh) {
        await dvPlugin.api.refresh();
        return true;
      }
    } catch (e) {
      // ignore
    }
  } catch (e) {
    console.log("paRefreshViews failed", e);
  }
  return false;
};

// --- 1.1 自动失效缓存 + 自动触发刷新 ---
// 目标：你改任何交易/日记/策略笔记后，不需要关掉重开/重启 Obsidian。
// 说明：Dataview 默认不会因为“其它文件变化”自动重渲染当前页面；因此需要监听 vault 事件并触发一次 refresh。
if (!window.__paAutoRefreshInstalled) {
  window.__paAutoRefreshInstalled = true;

  // 脏标记：有相关文件更新时置位，避免 TTL 内一直读缓存导致“看不到修改”
  if (window.paDirty === undefined) window.paDirty = false;

  const debounceMs = Number(cfg?.settings?.autoRefreshDebounceMs || 900);
  let timer = null;
  const scheduleRefresh = (hard = false) => {
    // 构建过程中不要递归刷新；结束后下一次 DV 刷新会重新计算
    if (window.__paBuilding) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await window.paRefreshViews?.({ hard });
      } catch (e) {
        // ignore
      }
    }, debounceMs);
  };

  const shouldCare = (file) => {
    const path = file?.path || "";
    if (!path) return false;
    // 只关注 Markdown，避免导出/附件等触发重算
    if (!path.toLowerCase().endsWith(".md")) return false;
    // 排除模板（可按需打开）；模板变化一般不需要立刻重算全库
    if (path.startsWith("Templates/")) return false;
    return true;
  };

  window.paMarkDirty = (reason = "modify", path = "") => {
    window.paDirty = true;

    // 细分：只让受影响的子缓存失效（避免无谓重算）
    try {
      const p = (path || "").toString();
      if (p.startsWith("Daily/") || p.includes("/Daily/")) {
        window.paDirtyDaily = true;
      }
    } catch (e) {
      // ignore
    }

    // 轻量刷新优先；真正需要全量强刷时依旧可以点 ↻ 数据
    scheduleRefresh(false);
  };

  const onModify = (file) => {
    try {
      if (!shouldCare(file)) return;
      window.paMarkDirty("modify", file.path);
    } catch (e) {
      // ignore
    }
  };

  try {
    app?.vault?.on?.("modify", onModify);
    app?.vault?.on?.("rename", onModify);
    app?.vault?.on?.("delete", onModify);
  } catch (e) {
    // ignore
  }

  // metadataCache 事件在某些场景更可靠（frontmatter/标签变化）
  try {
    app?.metadataCache?.on?.("changed", (file) => onModify(file));
  } catch (e) {
    // ignore
  }
}

let useCache = false;

// 缓存过期控制（默认使用 cfg.settings.cacheExpiry）
const cacheExpiryMs = Number(cfg?.settings?.cacheExpiry || 0);
const nowMs = Date.now();
const cacheFresh =
  !cacheExpiryMs ||
  (window.paData &&
    typeof window.paData.cacheTs === "number" &&
    nowMs - window.paData.cacheTs < cacheExpiryMs);

// 如果最近有相关文件更新，则强制本次不使用缓存（解决“改了但看不到”）
const dirty = window.paDirty === true;

if (
  !forceReload &&
  !dirty &&
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
let dailyData = { journalsByDate: new Map(), todayJournal: null };
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

    if (
      has(err) &&
      String(err).trim() !== "None" &&
      String(err).trim() !== "无"
    ) {
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
  dailyData = window.paData.daily || dailyData;
  strategyIndex = window.paData.strategyIndex;

  // v5.0: 兼容旧缓存（确保 reviewHints 可用）
  try {
    if (Array.isArray(trades) && trades.length > 0) {
      const needsReviewHints = trades.some(
        (t) => !t || !Array.isArray(t.reviewHints)
      );
      if (needsReviewHints) {
        for (const t of trades) {
          if (!t) continue;
          if (!Array.isArray(t.reviewHints))
            t.reviewHints = buildReviewHints(t);
        }
      }
    }
  } catch (e) {
    // ignore
  }
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
      mtime: t.file?.mtime?.ts || t.file?.ctime?.ts || null,
      ctime: t.file?.ctime?.ts || null,
      type: type,
      pnl: pnl,
      r: r,
      setup: utils.getRawStr(t, ["设置类别/setup_category", "setup_category"]),
      setupKey: utils.normalizeEnumKey(
        utils.getRawStr(t, ["设置类别/setup_category", "setup_category"], "")
      ),
      market_cycle: utils.getRawStr(t, [
        "市场周期/market_cycle",
        "market_cycle",
      ]),
      marketCycleKey: utils.normalizeEnumKey(
        utils.getRawStr(t, ["市场周期/market_cycle", "market_cycle"], "")
      ),
      error: errStr,
      outcome: utils.getRawStr(t, ["结果/outcome", "outcome"], ""),
      cover: t["封面/cover"] || t["cover"] || "Unknown", // 保留原始值,不清洗
      ticker: utils.getRawStr(t, ["品种/ticker", "ticker"]),
      tickerKey: utils.normalizeTickerKey(
        utils.getRawStr(t, ["品种/ticker", "ticker"], "")
      ),
      dir: utils.getRawStr(t, ["方向/direction", "direction"]),
      dirKey: utils.normalizeDirectionKey(
        utils.getRawStr(t, ["方向/direction", "direction"], "")
      ),
      tf: utils.getRawStr(t, ["时间周期/timeframe", "timeframe"]),
      tfKey: utils.normalizeTimeframeKey(
        utils.getRawStr(t, ["时间周期/timeframe", "timeframe"], "")
      ),
      order: utils.getRawStr(t, ["订单类型/order_type", "order_type"]),
      orderKey: utils.normalizeEnumKey(
        utils.getRawStr(t, ["订单类型/order_type", "order_type"], "")
      ),
      signal: utils.getRawStr(t, [
        "信号K/signal_bar_quality",
        "signal_bar_quality",
      ]),
      signalKey: utils.normalizeEnumKey(
        utils.getRawStr(
          t,
          ["信号K/signal_bar_quality", "signal_bar_quality"],
          ""
        )
      ),
      plan: utils.getRawStr(t, ["交易方程/trader_equation", "trader_equation"]),
      planKey: utils.normalizeEnumKey(
        utils.getRawStr(t, ["交易方程/trader_equation", "trader_equation"], "")
      ),
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
      strategyName: utils.getRawStr(t, [
        "策略名称/strategy_name",
        "strategy_name",
      ]),
      strategyKey: utils.normalizeEnumKey(
        utils.getRawStr(t, ["策略名称/strategy_name", "strategy_name"], "")
      ),
    };

    // v5.0: 智能复盘要点（仅生成，不改变现有 UI）
    tradeItem.reviewHints = buildReviewHints(tradeItem);

    trades.push(tradeItem);
  }
  trades.sort((a, b) => a.date.localeCompare(b.date)); // 正序

  // 本轮已重新计算完成，清理脏标记
  window.paDirty = false;

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
        const parseSyllabusJson = (mdText) => {
          if (!mdText || typeof mdText !== "string") return null;

          // 1) 优先解析 ```json 代码块
          let m = mdText.match(/```json\s*([\s\S]*?)```/i);
          if (m && m[1]) {
            const candidate = m[1].trim();
            if (candidate) return JSON.parse(candidate);
          }

          // 2) 次选：任意 ``` 代码块
          m = mdText.match(/```\s*([\s\S]*?)```/);
          if (m && m[1]) {
            const candidate = m[1].trim();
            if (candidate) return JSON.parse(candidate);
          }

          // 3) 兜底：兼容旧逻辑（扫描第一段 JSON 数组）
          const start = mdText.indexOf("[");
          const end = mdText.lastIndexOf("]");
          if (start !== -1 && end !== -1 && end > start) {
            const candidate = mdText.substring(start, end + 1).trim();
            if (candidate) return JSON.parse(candidate);
          }

          return null;
        };

        const parsed = parseSyllabusJson(syText);
        if (parsed && Array.isArray(parsed)) courseData.syllabus = parsed;
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
        // 策略助手/Playbook 需要的扩展字段（仍保持单一信源）
        riskReward:
          p["盈亏比/risk_reward"] ||
          p["risk_reward"] ||
          p["盈亏比"] ||
          "无/N/A",
        entryCriteria:
          p["入场条件/entry_criteria"] ||
          p["entry_criteria"] ||
          p["入场条件"] ||
          [],
        riskAlerts:
          p["风险提示/risk_alerts"] || p["risk_alerts"] || p["风险提示"] || [],
        stopLossRecommendation:
          p["止损建议/stop_loss_recommendation"] ||
          p["stop_loss_recommendation"] ||
          p["止损建议"] ||
          [],
        signalBarRequirements:
          p["信号K要求/signal_bar_requirements"] ||
          p["signal_bar_requirements"] ||
          p["信号K要求"] ||
          [],
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
// 2.4 日记上下文 (Daily Journal Context)
// ============================================================
try {
  // 优先复用缓存，缺失/强刷才重建
  const canReuseDaily =
    !forceReload &&
    !dirty &&
    window.paDirtyDaily !== true &&
    window.paData &&
    window.paData.daily &&
    window.paData.daily.journalsByDate;
  if (canReuseDaily) {
    dailyData = window.paData.daily;
  } else {
    const journalsByDate = new Map();
    const dailyPages = dv.pages('"Daily"');

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
          for (const vv of Object.values(v)) {
            const iso = isoFromAny(vv);
            if (iso) return iso;
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
    const isJournal = (p) => {
      const name = (p?.file?.name || "").toString();
      return (
        name.includes("_Journal") ||
        name.toLowerCase().includes("journal") ||
        name.includes("复盘")
      );
    };

    for (const p of dailyPages) {
      if (!isJournal(p)) continue;
      const d = pageISODate(p);
      if (!d) continue;
      const mc = utils.getRawStr(
        p,
        ["市场周期/market_cycle", "market_cycle"],
        ""
      );
      journalsByDate.set(d, {
        date: d,
        path: p.file.path,
        link: p.file.link,
        market_cycle: mc,
      });
    }

    dailyData = {
      journalsByDate,
      todayJournal: journalsByDate.get(todayStr) || null,
    };

    // 已重建日记上下文，清理脏标记
    window.paDirtyDaily = false;
  }
} catch (e) {
  // ignore
}

// ============================================================
// 2.5 交易索引 (仅派生数据，不改 UI)
// ============================================================
const buildTradeIndex = (tradeListAsc) => {
  const by = {
    tickerKey: new Map(),
    tfKey: new Map(),
    setupKey: new Map(),
    marketCycleKey: new Map(),
    strategyKey: new Map(),
    dirKey: new Map(),
  };
  const labels = {
    tickerKey: new Map(),
    tfKey: new Map(),
    setupKey: new Map(),
    marketCycleKey: new Map(),
    strategyKey: new Map(),
    dirKey: new Map(),
  };

  const normKey = (v) => {
    const s = v === undefined || v === null ? "" : String(v).trim();
    if (!s || s === "Unknown") return "unknown";
    return s;
  };

  const ensureKeys = (t) => {
    if (!t || typeof t !== "object") return;
    // 兼容旧缓存：如果缺少 *Key，则用 utils 的 normalize 系列补齐
    if (!t.tickerKey) t.tickerKey = utils.normalizeTickerKey(t.ticker || "");
    if (!t.tfKey) t.tfKey = utils.normalizeTimeframeKey(t.tf || "");
    if (!t.dirKey) t.dirKey = utils.normalizeDirectionKey(t.dir || "");
    if (!t.setupKey) t.setupKey = utils.normalizeEnumKey(t.setup || "");
    if (!t.marketCycleKey)
      t.marketCycleKey = utils.normalizeEnumKey(t.market_cycle || "");
    if (!t.strategyKey)
      t.strategyKey = utils.normalizeEnumKey(t.strategyName || "");
  };

  const add = (map, key, trade) => {
    const k = normKey(key);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(trade);
    return k;
  };

  const addLabel = (labelMap, k, label) => {
    if (labelMap.has(k)) return;
    const s = label === undefined || label === null ? "" : String(label).trim();
    if (!s || s === "Unknown") return;
    labelMap.set(k, s);
  };

  const list = Array.isArray(tradeListAsc) ? tradeListAsc : [];
  for (const t of list) {
    ensureKeys(t);

    const kTicker = add(by.tickerKey, t.tickerKey, t);
    addLabel(labels.tickerKey, kTicker, t.ticker);

    const kTf = add(by.tfKey, t.tfKey, t);
    addLabel(labels.tfKey, kTf, t.tf);

    const kDir = add(by.dirKey, t.dirKey, t);
    addLabel(labels.dirKey, kDir, t.dir);

    const kSetup = add(by.setupKey, t.setupKey, t);
    addLabel(labels.setupKey, kSetup, t.setup);

    const kCycle = add(by.marketCycleKey, t.marketCycleKey, t);
    addLabel(labels.marketCycleKey, kCycle, t.market_cycle);

    const kStrat = add(by.strategyKey, t.strategyKey, t);
    addLabel(labels.strategyKey, kStrat, t.strategyName);
  }

  const counts = {
    tickerKey: new Map(),
    tfKey: new Map(),
    setupKey: new Map(),
    marketCycleKey: new Map(),
    strategyKey: new Map(),
    dirKey: new Map(),
  };
  for (const k of by.tickerKey.keys())
    counts.tickerKey.set(k, by.tickerKey.get(k).length);
  for (const k of by.tfKey.keys()) counts.tfKey.set(k, by.tfKey.get(k).length);
  for (const k of by.setupKey.keys())
    counts.setupKey.set(k, by.setupKey.get(k).length);
  for (const k of by.marketCycleKey.keys())
    counts.marketCycleKey.set(k, by.marketCycleKey.get(k).length);
  for (const k of by.strategyKey.keys())
    counts.strategyKey.set(k, by.strategyKey.get(k).length);
  for (const k of by.dirKey.keys())
    counts.dirKey.set(k, by.dirKey.get(k).length);

  return { by, labels, counts };
};

// ============================================================
// 2.6 教练焦点 (仅派生数据，不改 UI)
// ============================================================
const buildCoachFocus = (tradeListAsc, index, todayIso) => {
  const list = Array.isArray(tradeListAsc) ? tradeListAsc : [];
  const safeNum = (v) =>
    typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;
  const isDone = (t) => {
    const s = (t?.outcome || "").toString().trim();
    return !!s;
  };
  const isWin = (t) => {
    const s = (t?.outcome || "").toString();
    return s === "Win" || s.includes("Win") || s.includes("止盈");
  };
  const isLoss = (t) => {
    const s = (t?.outcome || "").toString();
    return s === "Loss" || s.includes("Loss") || s.includes("止损");
  };
  const isScratch = (t) => {
    const s = (t?.outcome || "").toString();
    return s === "Scratch" || s.includes("Scratch") || s.includes("保本");
  };

  const weekStart = moment(todayIso, "YYYY-MM-DD")
    .startOf("isoWeek")
    .format("YYYY-MM-DD");
  const weekEnd = moment(todayIso, "YYYY-MM-DD")
    .endOf("isoWeek")
    .format("YYYY-MM-DD");

  const windowed = {
    today: list.filter((t) => t && t.date === todayIso),
    week: list.filter((t) => t && t.date >= weekStart && t.date <= weekEnd),
    last30: list.filter(
      (t) =>
        t &&
        t.date &&
        t.date >=
          moment(todayIso, "YYYY-MM-DD")
            .subtract(29, "days")
            .format("YYYY-MM-DD")
    ),
  };

  const summarize = (items) => {
    const out = {
      total: items.length,
      completed: 0,
      active: 0,
      wins: 0,
      losses: 0,
      scratches: 0,
      pnl: 0,
      avgR: 0,
      winRate: 0,
      expectancyR: 0,
    };
    if (items.length === 0) return out;
    let rSum = 0;
    let rCnt = 0;
    for (const t of items) {
      out.pnl += safeNum(t?.pnl);
      if (isDone(t)) {
        out.completed += 1;
        if (isWin(t)) out.wins += 1;
        else if (isLoss(t)) out.losses += 1;
        else if (isScratch(t)) out.scratches += 1;
      } else {
        out.active += 1;
      }
      if (typeof t?.r === "number" && !Number.isNaN(t.r)) {
        rSum += t.r;
        rCnt += 1;
      }
    }
    out.avgR = rCnt > 0 ? rSum / rCnt : 0;
    out.winRate =
      out.completed > 0 ? Math.round((out.wins / out.completed) * 100) : 0;
    out.expectancyR = out.completed > 0 ? rSum / out.completed : 0;
    return out;
  };

  const dimDefs = [
    { kind: "setupKey", label: "设置/Setup" },
    { kind: "marketCycleKey", label: "周期/Cycle" },
    { kind: "strategyKey", label: "策略/Strategy" },
    { kind: "tickerKey", label: "品种/Ticker" },
    { kind: "tfKey", label: "周期/TF" },
    { kind: "dirKey", label: "方向/Dir" },
  ];

  const computeDim = (items, kind) => {
    const groups = new Map();
    for (const t of items) {
      const k = (t?.[kind] || "unknown").toString().trim() || "unknown";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }

    const rows = [];
    for (const [k, g] of groups) {
      const s = summarize(g);
      // 只在“已完成样本”足够时才给出强信号，避免噪声
      const minCompleted = 2;
      const weight = Math.min(1, s.completed / 8); // 0~1
      const penalty =
        s.completed >= minCompleted ? Math.max(0, -s.expectancyR) : 0;
      const urgency = penalty * (0.5 + 0.5 * weight); // 越亏、样本越多越紧急

      rows.push({
        kind,
        key: k,
        label: index?.labels?.[kind]?.get?.(k) || "",
        stats: s,
        urgency,
      });
    }

    rows.sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
    return rows;
  };

  const pickFocus = (items) => {
    let best = null;
    for (const def of dimDefs) {
      const rows = computeDim(items, def.kind);
      if (rows.length === 0) continue;
      const top = rows[0];
      if (!best || (top.urgency || 0) > (best.urgency || 0)) {
        best = { ...top, dimLabel: def.label };
      }
    }
    return best;
  };

  const build = (items, meta) => {
    const summary = summarize(items);
    const focus = pickFocus(items);
    const topDims = {};
    for (const def of dimDefs) {
      const rows = computeDim(items, def.kind).slice(0, 3);
      topDims[def.kind] = rows;
    }

    return {
      ...meta,
      summary,
      focus,
      top: topDims,
    };
  };

  const todayPack = build(windowed.today, { date: todayIso });
  const weekPack = build(windowed.week, { start: weekStart, end: weekEnd });
  const last30Pack = build(windowed.last30, {
    start: moment(todayIso, "YYYY-MM-DD")
      .subtract(29, "days")
      .format("YYYY-MM-DD"),
    end: todayIso,
  });

  // 最近 N 周焦点序列：用于“周优先”的持续性加权（类似复习卡片：重复暴露=需要强化）
  const buildWeeklyFocusSeries = (weeksBack = 8) => {
    const out = [];
    const base = moment(todayIso, "YYYY-MM-DD").startOf("isoWeek");
    for (let i = 0; i < weeksBack; i++) {
      const start = base.clone().subtract(i, "weeks");
      const end = start.clone().endOf("isoWeek");
      const s = start.format("YYYY-MM-DD");
      const e = end.format("YYYY-MM-DD");
      const items = list.filter(
        (t) => t && t.date && t.date >= s && t.date <= e
      );

      // 每周 Top3 候选：把各维度最紧急的那一条汇总后取 Top3
      const cand = [];
      for (const def of dimDefs) {
        const rows = computeDim(items, def.kind);
        if (!rows || rows.length === 0) continue;
        const top = rows[0];
        if (top && (Number(top.urgency) || 0) > 0)
          cand.push({ ...top, dimLabel: def.label });
      }
      cand.sort((a, b) => (Number(b.urgency) || 0) - (Number(a.urgency) || 0));
      const top3 = cand.slice(0, 3);
      const focus = top3.length > 0 ? top3[0] : pickFocus(items);
      out.push({ start: s, end: e, focus, top3 });
    }
    return out; // 从本周开始倒序
  };

  const weeklySeries = buildWeeklyFocusSeries(8);

  // 多时间窗加权：
  // - today: 更敏感但样本小 -> 权重较低
  // - week: 默认主窗口
  // - last30: 用于检测“顽固问题” -> 权重更高
  // 并对“同一问题跨窗口仍为负期望”的情况做持续性加成（类似复习卡片：重复暴露=需要强化）。
  const buildCombined = (packs) => {
    const weights = { today: 0.8, week: 1.0, last30: 1.25 };
    const byKey = new Map(); // kind:key -> agg

    const idOf = (row) => {
      if (!row) return null;
      const u = Number(row.urgency) || 0;
      if (u <= 0) return null;
      return `${row.kind}:${row.key}`;
    };

    // 周维度：Top3 暴露次数 + 连续周数（周优先，SR 风格）
    const weeklyTopIdSets = weeklySeries.map((w) => {
      const ids = (Array.isArray(w?.top3) ? w.top3 : [])
        .map(idOf)
        .filter(Boolean);
      return new Set(ids);
    });

    const weekHits = new Map(); // id -> count
    for (const set of weeklyTopIdSets) {
      for (const id of set) weekHits.set(id, (weekHits.get(id) || 0) + 1);
    }

    const weekStreakCache = new Map();
    const weekStreakOf = (id) => {
      if (!id) return 0;
      if (weekStreakCache.has(id)) return weekStreakCache.get(id);
      let n = 0;
      for (const set of weeklyTopIdSets) {
        if (set.has(id)) n += 1;
        else break;
      }
      weekStreakCache.set(id, n);
      return n;
    };

    const addRow = (windowName, row) => {
      if (!row) return;
      const k = `${row.kind}:${row.key}`;
      const w = weights[windowName] || 1;
      const base = Number(row.urgency) || 0;
      const score = base * w;

      let agg = byKey.get(k);
      if (!agg) {
        agg = {
          kind: row.kind,
          key: row.key,
          label: row.label,
          dimLabel: row.dimLabel,
          score: 0,
          windows: new Set(),
          lastSeen: windowName,
          weekHitCount: weekHits.get(k) || 0,
          weekStreak: weekStreakOf(k) || 0,
          // 取“更大样本”的统计作为展示参考（last30 优先）
          stats: row.stats,
          urgency: row.urgency,
        };
        byKey.set(k, agg);
      }

      agg.score += score;
      if (base > 0) agg.windows.add(windowName);
      // stats/urgency 取更“稳”的窗口：last30 > week > today
      const rank = (n) => (n === "last30" ? 3 : n === "week" ? 2 : 1);
      if (rank(windowName) >= rank(agg.lastSeen)) {
        agg.lastSeen = windowName;
        agg.stats = row.stats;
        agg.urgency = row.urgency;
      }
    };

    // 把每个窗口的 top 候选（各维度 top3）灌入 combined，避免全量扫描过重
    for (const [windowName, pack] of Object.entries(packs)) {
      const top = pack?.top || {};
      for (const kind of Object.keys(top)) {
        const rows = Array.isArray(top[kind]) ? top[kind] : [];
        for (const r of rows) {
          addRow(windowName, { ...r, dimLabel: r.dimLabel || r.kind });
        }
      }
    }

    // 持续性加成：同一问题在多个窗口都为负期望 -> 提升优先级
    const list = [];
    for (const agg of byKey.values()) {
      const n = agg.windows.size;
      const persistence = n >= 2 ? 1 + 0.25 * (n - 1) : 1;

      // 周优先：同一问题在最近多周重复出现/连续出现 -> 加权更高
      const hit = Number(agg.weekHitCount) || 0;
      const streak = Number(agg.weekStreak) || 0;
      const hitBonus = hit >= 2 ? 1 + 0.2 * (Math.min(hit, 5) - 1) : 1;
      const streakBonus =
        streak >= 2 ? 1 + 0.35 * (Math.min(streak, 5) - 1) : 1;
      const weeklyBonus = Math.min(2.2, hitBonus * streakBonus);

      agg.score = agg.score * persistence * weeklyBonus;
      list.push(agg);
    }
    list.sort((a, b) => (b.score || 0) - (a.score || 0));

    const focus = list.length > 0 ? list[0] : null;
    return {
      focus,
      // 给 UI/调试用：只保留前 12 条
      ranked: list.slice(0, 12).map((x) => ({
        kind: x.kind,
        key: x.key,
        label: x.label,
        dimLabel: x.dimLabel,
        score: x.score,
        urgency: x.urgency,
        stats: x.stats,
        weekHitCount: x.weekHitCount,
        weekStreak: x.weekStreak,
        windows: Array.from(x.windows),
        sourceWindow: x.lastSeen,
      })),
      weights,
      weekly: {
        weeksBack: weeklySeries.length,
        series: weeklySeries.map((w) => ({
          start: w.start,
          end: w.end,
          focus: w.focus
            ? {
                kind: w.focus.kind,
                key: w.focus.key,
                label: w.focus.label,
                dimLabel: w.focus.dimLabel,
                urgency: w.focus.urgency,
                stats: w.focus.stats,
              }
            : null,
          top3: (Array.isArray(w.top3) ? w.top3 : []).map((t) => ({
            kind: t.kind,
            key: t.key,
            label: t.label,
            dimLabel: t.dimLabel,
            urgency: t.urgency,
            stats: t.stats,
          })),
        })),
      },
    };
  };

  const combined = buildCombined({
    today: todayPack,
    week: weekPack,
    last30: last30Pack,
  });

  return {
    today: todayPack,
    week: weekPack,
    last30: last30Pack,
    combined,
  };
};

// ============================================================
// 2.7 统一推荐中枢（交易 > 课程 > 卡片）
// ============================================================
const buildUnifiedRecommendations = ({
  coach,
  courseData,
  srData,
  consolePath,
}) => {
  const out = {
    ranked: [],
    weights: { trade: 1.0, course: 0.7, sr: 0.5 },
    generatedAt: moment().format("YYYY-MM-DD HH:mm:ss"),
  };

  const push = (item) => {
    if (!item) return;
    out.ranked.push(item);
  };

  const linkTo = (path, label) => ({ path, label });
  const h = {
    trading: `${consolePath}#⚔️ 交易中心 (Trading Hub)`,
    learning: `${consolePath}#📚 学习模块`,
    manage: `${consolePath}#📉 管理模块`,
  };

  // 1) 交易（最优先）：来自 coach.combined.focus
  const focus =
    coach?.combined?.focus ||
    coach?.today?.focus ||
    coach?.week?.focus ||
    coach?.last30?.focus;
  if (focus) {
    const label = (focus.label || focus.key || "Unknown").toString();
    const dim = (focus.dimLabel || focus.kind || "").toString();
    const completed = Number(focus?.stats?.completed) || 0;
    const winRate = Number(focus?.stats?.winRate) || 0;
    const exp = Number(focus?.stats?.expectancyR);
    const expStr = Number.isFinite(exp) ? exp.toFixed(2) : "0.00";
    const streak = Number(focus?.weekStreak) || 0;
    const streakStr = streak >= 2 ? `（连续${streak}周）` : "";
    const score = Number(focus.score) || Number(focus.urgency) || 0;

    push({
      source: "trade",
      score: score * out.weights.trade,
      title: `复盘焦点：${dim} → ${label}${streakStr}`,
      reason: `样本${completed}，期望R ${expStr}，胜率 ${winRate}%`,
      action: linkTo(h.manage, "打开 Inspector 做针对性复盘"),
      data: {
        kind: focus.kind,
        key: focus.key,
        weekStreak: streak,
        weekHitCount: Number(focus?.weekHitCount) || 0,
      },
    });
  } else {
    push({
      source: "trade",
      score: 0,
      title: "复盘焦点：暂无（交易样本不足）",
      reason: "先记录更多交易/完善字段，再计算教练焦点。",
      action: linkTo(h.trading, "打开交易中心"),
      data: {},
    });
  }

  // 2) 课程：优先用 Core 的 hybridRec
  const hybrid = courseData?.hybridRec;
  if (hybrid && hybrid.data) {
    const isNew = hybrid.type === "New";
    const title = isNew
      ? `课程推荐：继续学习 ${hybrid.data.t || hybrid.data.id || ""}`
      : `课程推荐：复习/测验 ${hybrid.data.t || hybrid.data.q || ""}`;
    const path = hybrid.data.path || h.learning;
    push({
      source: "course",
      score: (Number(hybrid.weight) || (isNew ? 30 : 20)) * out.weights.course,
      title,
      reason: isNew ? "新章节推进" : "复习巩固/闪卡测验",
      action: linkTo(path, "打开课程/笔记"),
      data: { type: hybrid.type },
    });
  } else {
    push({
      source: "course",
      score: 0,
      title: "课程推荐：暂无（未加载大纲或无候选）",
      reason: "检查 PA_Syllabus_Data.md 或课程标签。",
      action: linkTo(h.learning, "打开学习模块"),
      data: {},
    });
  }

  // 3) 卡片：优先 due/focusFile，其次随机 quizPool
  if (srData?.due > 0 && srData?.focusFile?.path) {
    push({
      source: "sr",
      score: Math.min(50, Number(srData.due) * 2) * out.weights.sr,
      title: `卡片推荐：优先复习 ${srData.focusFile.name.replace(
        /\.md$/i,
        ""
      )}`,
      reason: `今日到期 ${srData.focusFile.due}（优先清零）`,
      action: linkTo(srData.focusFile.path, "打开卡片"),
      data: { type: "Focus" },
    });
  } else if (Array.isArray(srData?.quizPool) && srData.quizPool.length > 0) {
    const rnd =
      srData.quizPool[Math.floor(Math.random() * srData.quizPool.length)];
    if (rnd?.path) {
      push({
        source: "sr",
        score: 10 * out.weights.sr,
        title: `卡片推荐：随机一题 ${rnd.q || ""}`,
        reason: "随手保持曝光",
        action: linkTo(rnd.path, "打开卡片"),
        data: { type: "Random" },
      });
    }
  } else {
    push({
      source: "sr",
      score: 0,
      title: "卡片推荐：暂无（无到期/无题库）",
      reason: "可以先建立 flashcards 或配置 SR 数据源。",
      action: linkTo(h.learning, "打开记忆库"),
      data: {},
    });
  }

  // 按 score 排序，并保证 trade > course > sr 的默认展示顺序（同分时）
  const pri = { trade: 3, course: 2, sr: 1 };
  out.ranked.sort(
    (a, b) =>
      (b.score || 0) - (a.score || 0) ||
      (pri[b.source] || 0) - (pri[a.source] || 0)
  );

  return out;
};

// ============================================================
// 3. 混合推荐 (每次运行重算)
// ============================================================
let candidates = [];
if (courseData.syllabus.length > 0) {
  const hasNote = (s) => {
    const id = s?.id?.toString?.() ?? "";
    if (!id) return false;
    return !!courseData.map?.[id];
  };

  // 优先推荐“已创建笔记”的下一课（避免大纲里存在但笔记尚未创建时挡在最前面）
  let nextItem = courseData.syllabus.find(
    (s) => !courseData.done.has(s.id.toString()) && hasNote(s)
  );
  // 兜底：如果还没有任何笔记被创建，仍回退到大纲第一条未完成
  if (!nextItem) {
    nextItem = courseData.syllabus.find(
      (s) => !courseData.done.has(s.id.toString())
    );
  }
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
const index = buildTradeIndex(trades);
const coach = buildCoachFocus(trades, index, todayStr);
const recommendations = buildUnifiedRecommendations({
  coach,
  courseData,
  srData,
  consolePath: "🦁 交易员控制台 (Trader Command)5.0.md",
});
window.paData = {
  trades: [...trades].reverse(),
  tradesAsc: trades,
  index: index,
  coach: coach,
  recommendations: recommendations,
  stats: stats,
  sr: srData,
  course: courseData,
  daily: dailyData,
  strategyIndex: strategyIndex,
  updateTime: moment().format("HH:mm:ss"),
  cacheTs: Date.now(),
  loadTime: (performance.now() - startT).toFixed(0) + "ms",
  isCached: useCache,
};

// 构建结束
window.__paBuilding = false;

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

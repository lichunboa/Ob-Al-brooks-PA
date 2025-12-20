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
const forceReload = window.paForceReload === true;
window.paForceReload = false;

let useCache = false;
if (
  !forceReload &&
  window.paData &&
  window.paData.tradesAsc &&
  window.paData.tradesAsc.length > 0
) {
  // 深度检查: 确保关键数据结构都存在
  if (
    window.paData.tradesAsc[0].ticker !== undefined &&
    window.paData.sr &&
    window.paData.sr.load && // 确保 load 存在
    window.paData.sr.fileList
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

// ============================================================
// 2. 数据加载逻辑
// ============================================================

if (useCache) {
  // ⚡️ 极速模式
  trades = window.paData.tradesAsc;
  stats = window.paData.stats;
  srData = window.paData.sr;
  courseData = window.paData.course;
} else {
  // 🐢 扫描模式 (Full Scan)

  // --- A. 交易数据处理 ---
  const tradePages = dv
    .pages(`${cfg.tags.trade}`)
    .where((p) => !p.file.path.includes(cfg.paths.templates));

  for (let t of tradePages) {
    let date = moment(t.date || t.file.day).format("YYYY-MM-DD");
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
    if (initRisk > 0) {
      r = pnl / initRisk;
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

    trades.push({
      id: t.file.path,
      link: t.file.link,
      name: t.file.name,
      date: date,
      type: type,
      pnl: pnl,
      r: r,
      setup: utils.getStr(t, ["设置类别/setup_category", "setup_category"]),
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
    });
  }
  trades.sort((a, b) => a.date.localeCompare(b.date)); // 正序

  // --- B. 记忆库数据处理 (之前丢失的部分已找回) ---
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
    let hardFiles = [...srData.fileList].sort((a, b) => a.avgEase - b.avgEase);
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

  // --- C. 课程进度处理 (之前丢失的部分已找回) ---
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
  updateTime: moment().format("HH:mm:ss"),
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
    btnRefresh.onclick = () =>
      app.commands.executeCommandById("dataview:force-refresh-views");
  if (btnHard)
    btnHard.onclick = () => {
      new Notice("正在重新扫描全库...");
      window.paForceReload = true;
      app.commands.executeCommandById("dataview:force-refresh-views");
    };
}, 500);

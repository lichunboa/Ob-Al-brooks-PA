```dataviewjs
/* === 🦁 PA Core Engine v13.8 (Focus Logic) === 
   更新：计算单文件的 Ease 分数，找出"最难"的文件用于推荐
   功能：全库清洗、智能评分、来源分析、交互增强
*/

const startT = performance.now();
const todayStr = moment().format("YYYY-MM-DD");

// ============================================================
// 1. 交易数据清洗 (保持不变)
// ============================================================
const tradePages = dv.pages("#PA/Trade").where(p => !p.file.path.includes("Templates"));
let trades = [];
let stats = { livePnL:0, liveWin:0, liveCount:0, tuition:0, errors:{} };

const getVal = (p, keys) => { for(let k of keys) if(p[k]!==undefined) return Number(p[k]); return 0; };
const getStr = (p, keys) => {
    for(let k of keys) if(p[k]) {
        let s = p[k].toString();
        if (s.match(/[a-zA-Z]/)) {
             if(s.includes("(")) return s.split("(")[1].replace(")","").trim();
             if(s.includes("/")) return s.split("/")[1].trim();
        }
        return s.split("(")[0].trim();
    }
    return "Unknown";
};

for (let t of tradePages) {
    let date = moment(t.date || t.file.day).format("YYYY-MM-DD");
    let pnl = getVal(t, ["净利润/net_profit", "net_profit", "profit"]);
    let rawAcct = getStr(t, ["账户类型/account_type", "account_type"]).toLowerCase();
    
    let type = "Demo";
    if (rawAcct.includes("live") || rawAcct.includes("实盘")) type = "Live";
    else if (rawAcct.includes("back") || rawAcct.includes("回测")) type = "Backtest";

    let ticker = getStr(t, ["品种/ticker", "ticker"]);
    let dir = getStr(t, ["方向/direction", "direction"]); 
    let tf = getStr(t, ["时间周期/timeframe", "timeframe"]); 
    let orderType = getStr(t, ["订单类型/order_type", "order_type"]); 
    let signal = getStr(t, ["信号K/signal_bar_quality", "signal_bar_quality"]); 
    let plan = getStr(t, ["交易方程/trader_equation", "trader_equation"]); 

    let initRisk = getVal(t, ["初始风险/initial_risk", "initial_risk"]);
    let r = 0;
    if (initRisk > 0) { r = pnl / initRisk; } 
    else {
        let entry = getVal(t, ["入场/entry_price", "entry_price", "entry"]);
        let stop = getVal(t, ["止损/stop_loss", "stop_loss", "stop"]);
        let exit = getVal(t, ["离场/exit_price", "exit_price", "exit"]) || entry;
        let riskDist = Math.abs(entry - stop);
        if (riskDist > 0) {
            let dist = exit - entry;
            let rawR = dist / riskDist;
            if (pnl < 0 && rawR > 0) rawR = -rawR; 
            if (pnl > 0 && rawR < 0) rawR = -rawR;
            r = rawR;
        }
    }

    let errStr = getStr(t, ["管理错误/management_error", "management_error"]);
    if (type === "Live" && pnl < 0 && errStr && !errStr.includes("None") && !errStr.includes("Perfect")) {
        let errKey = errStr.split("(")[0].trim();
        stats.tuition += Math.abs(pnl);
        stats.errors[errKey] = (stats.errors[errKey] || 0) + Math.abs(pnl);
    }
    if (type === "Live") {
        stats.livePnL += pnl;
        stats.liveCount++;
        if (pnl > 0) stats.liveWin++;
    }
    trades.push({
        id: t.file.path, link: t.file.link, name: t.file.name, date: date, type: type,
        pnl: pnl, r: r, setup: getStr(t, ["设置类别/setup_category", "setup_category"]).split("(")[0].trim(),
        error: errStr, cover: getStr(t, ["封面/cover", "cover"]),
        ticker: ticker, dir: dir, tf: tf, order: orderType, signal: signal, plan: plan
    });
}
trades.sort((a, b) => a.date.localeCompare(b.date)); 
let tradesDesc = [...trades].reverse();

// ============================================================
// 2. SR 记忆库清洗 (升级：计算单文件 Ease)
// ============================================================
const srPages = dv.pages('#flashcards AND -"Templates"');
let srData = { 
    total: 0, due: 0, reviewed: 0, avgEase: 0, 
    score: 0, status: "🌱 初始", 
    load: {}, 
    folders: {}, 
    fileList: [], 
    cnt: { cloze:0, sNorm:0, sRev:0, mNorm:0, mRev:0 },
    focusFile: null // 新增：最需要复习的文件
};
let easeSum = 0;
const srRegex = /!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)/g; 

await Promise.all(srPages.map(async (p) => {
    try {
        let file = app.vault.getAbstractFileByPath(p.file.path);
        if (!file) return;
        let content = await app.vault.read(file);
        if (!content) return;

        let clean = content.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

        // 计数
        let c_cloze = (clean.match(/==[^=]+==/g) || []).length;
        let c_sRev = (clean.match(/(?<!:):{3}(?!:)/g) || []).length;
        let c_sNorm = (clean.match(/(?<!:):{2}(?!:)/g) || []).length;
        let c_mRev = (clean.match(/^(?:\>)?\s*\?{2}\s*$/gm) || []).length;
        let c_mNorm = (clean.match(/^(?:\>)?\s*\?{1}\s*$/gm) || []).length;
        
        let fileCards = c_cloze + c_sNorm + c_mNorm + (c_sRev*2) + (c_mRev*2);
        srData.total += fileCards;
        srData.cnt.cloze += c_cloze;
        srData.cnt.sRev += c_sRev;
        srData.cnt.sNorm += c_sNorm;
        srData.cnt.mRev += c_mRev;
        srData.cnt.mNorm += c_mNorm;

        // 单文件统计对象
        let fileStat = {
            name: p.file.name,
            path: p.file.path,
            folder: p.file.folder.split("/").pop(),
            count: fileCards,
            due: 0,
            easeSum: 0,
            easeCount: 0,
            avgEase: 250 // 默认中等
        };

        if (fileCards > 0) {
            srData.folders[fileStat.folder] = (srData.folders[fileStat.folder] || 0) + fileCards;
        }

        // 提取 SR 数据
        let matches = [...content.matchAll(srRegex)];
        matches.forEach(m => {
            srData.reviewed++;
            let d = m[1];
            let ease = parseInt(m[3]);
            
            // 全局累加
            easeSum += ease;
            if (d <= todayStr) srData.due++;
            else srData.load[d] = (srData.load[d] || 0) + 1;

            // 单文件累加
            fileStat.easeSum += ease;
            fileStat.easeCount++;
            if (d <= todayStr) fileStat.due++;
        });

        // 计算单文件平均分
        if (fileStat.easeCount > 0) {
            fileStat.avgEase = Math.round(fileStat.easeSum / fileStat.easeCount);
        }

        if (fileCards > 0) srData.fileList.push(fileStat);

    } catch(e) {}
}));

// 排序并找出 Focus File (规则：有 Due > 0，且 AvgEase 最低)
srData.fileList.sort((a, b) => b.count - a.count);

let candidateFiles = srData.fileList.filter(f => f.due > 0);
if (candidateFiles.length > 0) {
    // 按难度排序 (Ease 越低越难)
    candidateFiles.sort((a, b) => a.avgEase - b.avgEase);
    srData.focusFile = candidateFiles[0]; // 最难的那个
}

// 全局分数
if (srData.reviewed > 0) {
    srData.avgEase = (easeSum / srData.reviewed);
    let rawScore = (srData.avgEase / 290) * 100;
    srData.score = Math.min(100, Math.round(rawScore));

    if (srData.due > 50) srData.status = "🔥 积压 (Overload)";
    else if (srData.score < 70) srData.status = "🧠 吃力 (Hard)";
    else if (srData.score > 90) srData.status = "🦁 精通 (Master)";
    else srData.status = "🟢 健康 (Healthy)";
}

// ============================================================
// 3. 课程进度
// ============================================================
const coursePages = dv.pages("#PA/Course");
let courseData = { done: new Set(), map: {} };
for(let p of coursePages) {
    let ids = p.module_id; if(!ids) continue;
    if(!Array.isArray(ids)) ids = [ids];
    for(let id of ids) {
        let strId = id.toString();
        courseData.map[strId] = p.file.link;
        if(p.studied) courseData.done.add(strId);
    }
}

// ============================================================
// 4. 挂载全局 & 状态栏
// ============================================================
window.paData = {
    trades: tradesDesc, tradesAsc: trades, stats: stats,
    sr: srData, course: courseData,
    updateTime: moment().format("HH:mm:ss"),
    loadTime: (performance.now() - startT).toFixed(0) + "ms"
};

const refreshBtnId = "pa-engine-refresh-" + Date.now();
let pnlColor = stats.livePnL > 0 ? "#4caf50" : (stats.livePnL < 0 ? "#ff6b6b" : "inherit");

dv.el("div", `
<div style="font-size: 0.75em; opacity: 0.6; text-align: right; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-family: monospace; margin-bottom: 10px; display:flex; justify-content:flex-end; align-items:center;">
    <span style="margin-right: 15px;">🦁 v13.8</span>
    <span style="margin-right: 15px;">Live: <strong style="color:${pnlColor}">$${stats.livePnL.toFixed(2)}</strong></span>
    <span style="margin-right: 15px;">Cards: ${srData.total}</span>
    <button id="${refreshBtnId}" style="
        background:none; border:1px solid rgba(255,255,255,0.2); color:rgba(255,255,255,0.6); 
        cursor:pointer; padding:2px 8px; border-radius:4px; font-size:0.9em; transition: all 0.2s;
    ">↻ 刷新</button>
</div>
`);

setTimeout(() => {
    const btn = document.getElementById(refreshBtnId);
    if (btn) {
        btn.onclick = () => {
            new Notice("正在重新抓取数据...");
            app.commands.executeCommandById("dataview:force-refresh-views");
        };
        btn.onmouseover = () => { btn.style.background = "rgba(255,255,255,0.1)"; btn.style.color = "#fff"; };
        btn.onmouseout = () => { btn.style.background = "none"; btn.style.color = "rgba(255,255,255,0.6)"; };
    }
}, 500);
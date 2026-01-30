```dataviewjs
/* === 🦁 PA Core Engine v13.1 (Mastery Logic) === 
   更新：新增"掌握度(Score)"和"健康状态(State)"自动计算逻辑
   基础：保留了 V13 的全维度搜集和正则修复
*/

const startT = performance.now();
const todayStr = moment().format("YYYY-MM-DD");

// ============================================================
// 1. 交易数据清洗 (保持 V13 逻辑)
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
// 2. SR 记忆库清洗 (增加评分算法)
// ============================================================
const srPages = dv.pages('#flashcards AND -"Templates"');
// 增加 score 和 status 字段
let srData = { 
    total: 0, due: 0, reviewed: 0, avgEase: 0, 
    score: 0, status: "🌱 初始", 
    load: {}, folders: {}, 
    cnt: { cloze:0, sNorm:0, sRev:0, mNorm:0, mRev:0 } // 详细计数
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

        if (fileCards > 0) {
            let fName = p.file.folder.split("/").pop();
            srData.folders[fName] = (srData.folders[fName] || 0) + fileCards;
        }

        let matches = [...content.matchAll(srRegex)];
        matches.forEach(m => {
            srData.reviewed++;
            let d = m[1];
            let ease = parseInt(m[3]);
            easeSum += ease;
            if (d <= todayStr) srData.due++;
            else srData.load[d] = (srData.load[d] || 0) + 1;
        });
    } catch(e) {}
}));

// --- 🦁 智能计算逻辑 (Algorithm) ---
if (srData.reviewed > 0) {
    srData.avgEase = (easeSum / srData.reviewed);
    
    // 1. 计算掌握度 (Mastery Score)
    // 逻辑：Ease 250 是标准(85分)，300 是精通(100分)，130 是最低(0分)
    // 公式：(AvgEase / 290) * 100
    let rawScore = (srData.avgEase / 290) * 100;
    srData.score = Math.min(100, Math.round(rawScore));

    // 2. 计算健康状态 (Health State)
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
// 4. 挂载
// ============================================================
window.paData = {
    trades: tradesDesc, tradesAsc: trades, stats: stats,
    sr: srData, course: courseData,
    updateTime: moment().format("HH:mm:ss"),
    loadTime: (performance.now() - startT).toFixed(0) + "ms"
};

// ============================================================
// 5. 极简状态栏
// ============================================================
let pnlColor = stats.livePnL > 0 ? "#4caf50" : (stats.livePnL < 0 ? "#ff6b6b" : "inherit");
dv.el("div", `
<div style="font-size: 0.75em; opacity: 0.6; text-align: right; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-family: monospace; margin-bottom: 10px;">
    <span style="margin-right: 15px;">🦁 Engine v13.1</span>
    <span style="margin-right: 15px;">Live: <strong style="color:${pnlColor}">$${stats.livePnL.toFixed(2)}</strong></span>
    <span style="margin-right: 15px;">Cards: ${srData.total} (Due: ${srData.due})</span>
    <span style="margin-right: 15px;">State: ${srData.status}</span>
    <span style="opacity: 0.5;">${window.paData.loadTime}</span>
</div>
`);
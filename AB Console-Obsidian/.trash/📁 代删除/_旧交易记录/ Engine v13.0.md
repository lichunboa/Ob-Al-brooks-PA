```dataviewjs
/* === 🦁 PA Core Engine v13.0 (Full-Dimension) === 
   功能：全库数据清洗中心。一次扫描，全局通用。
   更新：新增 Ticker, Direction, Timeframe, OrderType, Signal, Plan 六大维度搜集。
   修复：SR正则剔除代码块，解决"5178标签"异常。
*/

const startT = performance.now();
const todayStr = moment().format("YYYY-MM-DD");

// ============================================================
// 1. 交易数据清洗 (Trade Processor)
// ============================================================
const tradePages = dv.pages("#PA/Trade").where(p => !p.file.path.includes("Templates"));
let trades = [];
let stats = { livePnL:0, liveWin:0, liveCount:0, tuition:0, errors:{} };

// 辅助：清洗金额 (转数字)
const getVal = (p, keys) => {
    for(let k of keys) if(p[k] !== undefined) return Number(p[k]);
    return 0;
};
// 辅助：清洗文本 (取字符串并简化)
const getStr = (p, keys) => {
    for(let k of keys) if(p[k]) {
        let s = p[k].toString();
        // 简化逻辑：取 "/" 或 "(" 前面的部分，或者是英文部分
        // 例如 "做多 (Long)" -> "Long" (如果包含英文)
        if (s.match(/[a-zA-Z]/)) {
             // 尝试提取英文 (括号里的，或者 / 后面的)
             if(s.includes("(")) return s.split("(")[1].replace(")","").trim();
             if(s.includes("/")) return s.split("/")[1].trim();
             return s.split("(")[0].trim(); // 默认策略
        }
        return s.split("(")[0].trim();
    }
    return "Unknown";
};

for (let t of tradePages) {
    // A. 基础字段
    let date = moment(t.date || t.file.day).format("YYYY-MM-DD");
    let pnl = getVal(t, ["净利润/net_profit", "net_profit", "profit"]);
    let rawAcct = getStr(t, ["账户类型/account_type", "account_type"]).toLowerCase();
    
    // B. 账户归类
    let type = "Demo";
    if (rawAcct.includes("live") || rawAcct.includes("实盘")) type = "Live";
    else if (rawAcct.includes("back") || rawAcct.includes("回测")) type = "Backtest";

    // C. [新增] 多维度数据搜集
    let ticker = getStr(t, ["品种/ticker", "ticker"]);
    let dir = getStr(t, ["方向/direction", "direction"]); // Long/Short
    let tf = getStr(t, ["时间周期/timeframe", "timeframe"]); // 5m/15m
    let orderType = getStr(t, ["订单类型/order_type", "order_type"]); // Stop/Limit
    let signal = getStr(t, ["信号K/signal_bar_quality", "signal_bar_quality"]); // Strong Close...
    let plan = getStr(t, ["交易方程/trader_equation", "trader_equation"]); // Scalp/Swing

    // D. 智能 R 值计算
    let initRisk = getVal(t, ["初始风险/initial_risk", "initial_risk"]);
    let r = 0;
    if (initRisk > 0) {
        r = pnl / initRisk; 
    } else {
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

    // E. 错误统计
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

    // F. 数据打包
    trades.push({
        id: t.file.path,
        link: t.file.link,
        name: t.file.name,
        date: date,
        type: type,
        pnl: pnl,
        r: r,
        setup: getStr(t, ["设置类别/setup_category", "setup_category"]).split("(")[0].trim(),
        error: errStr,
        cover: getStr(t, ["封面/cover", "cover"]),
        // 新字段挂载
        ticker: ticker,
        dir: dir,
        tf: tf,
        order: orderType,
        signal: signal,
        plan: plan
    });
}

// 排序
trades.sort((a, b) => a.date.localeCompare(b.date)); 
let tradesDesc = [...trades].reverse();

// ============================================================
// 2. SR 记忆库清洗 (Fix: 剔除代码块)
// ============================================================
const srPages = dv.pages('#flashcards AND -"Templates"');
let srData = { total: 0, due: 0, reviewed: 0, avgEase: 0, load: {}, folders: {} };
let easeSum = 0;
const srRegex = /!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)/g; 

await Promise.all(srPages.map(async (p) => {
    try {
        let file = app.vault.getAbstractFileByPath(p.file.path);
        if (!file) return;
        let content = await app.vault.read(file);
        if (!content) return;

        // A. 剔除代码块 (关键修复！)
        let clean = content.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

        // B. 物理计数
        let c_cloze = (clean.match(/==[^=]+==/g) || []).length;
        let c_sRev = (clean.match(/(?<!:):{3}(?!:)/g) || []).length;
        let c_sNorm = (clean.match(/(?<!:):{2}(?!:)/g) || []).length;
        let c_mRev = (clean.match(/^(?:\>)?\s*\?{2}\s*$/gm) || []).length;
        let c_mNorm = (clean.match(/^(?:\>)?\s*\?{1}\s*$/gm) || []).length;
        
        let fileCards = c_cloze + c_sNorm + c_mNorm + (c_sRev*2) + (c_mRev*2);
        srData.total += fileCards;

        if (fileCards > 0) {
            let fName = p.file.folder.split("/").pop();
            srData.folders[fName] = (srData.folders[fName] || 0) + fileCards;
        }

        // C. SR 元数据
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
if (srData.reviewed > 0) srData.avgEase = (easeSum / srData.reviewed).toFixed(0);

// ============================================================
// 3. 课程进度映射
// ============================================================
const coursePages = dv.pages("#PA/Course");
let courseData = { done: new Set(), map: {} };
for(let p of coursePages) {
    let ids = p.module_id;
    if(!ids) continue;
    if(!Array.isArray(ids)) ids = [ids];
    for(let id of ids) {
        let strId = id.toString();
        courseData.map[strId] = p.file.link;
        if(p.studied) courseData.done.add(strId);
    }
}

// ============================================================
// 4. 挂载全局对象
// ============================================================
window.paData = {
    trades: tradesDesc,
    tradesAsc: trades,
    stats: stats,
    sr: srData,
    course: courseData,
    updateTime: moment().format("HH:mm:ss"),
    loadTime: (performance.now() - startT).toFixed(0) + "ms"
};

// ============================================================
// 5. 极简状态栏
// ============================================================
let pnlColor = stats.livePnL > 0 ? "#4caf50" : (stats.livePnL < 0 ? "#ff6b6b" : "inherit");

dv.el("div", `
<div style="font-size: 0.75em; opacity: 0.6; text-align: right; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-family: monospace; margin-bottom: 10px;">
    <span style="margin-right: 15px;">🦁 Engine v13.0 (Full-Dim)</span>
    <span style="margin-right: 15px;">Live: <strong style="color:${pnlColor}">$${stats.livePnL.toFixed(2)}</strong> (${stats.liveCount}笔)</span>
    <span style="margin-right: 15px;">Due: <strong style="color:${srData.due>0?'#ff6b6b':'inherit'}">${srData.due}</strong> / ${srData.total}</span>
    <span style="opacity: 0.5;">Load: ${window.paData.loadTime}</span>
</div>
`);
```
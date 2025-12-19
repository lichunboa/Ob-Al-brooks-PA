/* 文件名: Scripts/pa-view-account.js
   用途: 账户资金概览 + 月度热力图
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");

if (window.paData) {
    const trades = window.paData.trades; // 获取所有交易
    const c = cfg.colors;

    // 1. 统计各账户数据
    function getStats(type) {
        let subset = trades.filter(t => t.type === type);
        let total = subset.length;
        let wins = subset.filter(t => t.pnl > 0).length;
        let pnl = subset.reduce((acc, t) => acc + t.pnl, 0);
        let wr = total > 0 ? Math.round((wins / total) * 100) : 0;
        return { pnl: pnl.toFixed(2), wr, count: total };
    }

    const live = getStats("Live");
    const demo = getStats("Demo");
    const back = getStats("Backtest");

    // 2. 热力图数据 (本月 Live)
    const today = new Date();
    const currentMonth = moment().format("YYYY-MM");
    const daysInMonth = moment().daysInMonth();
    
    let dailyMap = {};
    trades.filter(t => t.type === "Live" && t.date.startsWith(currentMonth)).forEach(t => {
        let day = parseInt(t.date.split("-")[2]);
        dailyMap[day] = (dailyMap[day] || 0) + t.pnl;
    });

    let gridHtml = "";
    for (let d = 1; d <= daysInMonth; d++) {
        let pnl = dailyMap[d];
        let bg = c.tagBg;
        let txt = `<div style="font-size:0.6em; opacity:0.3;">${d}</div>`;
        
        if (pnl !== undefined) {
            bg = pnl > 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)";
            let color = pnl > 0 ? c.live : c.loss;
            txt = `<div style="font-size:0.6em; opacity:0.5;">${d}</div><div style="font-size:0.7em; font-weight:bold; color:${color};">${pnl.toFixed(0)}</div>`;
        }
        gridHtml += `<div style="width:32px; height:32px; background:${bg}; border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; border:${c.tagBorder};">${txt}</div>`;
    }

    // 3. 渲染
    const root = dv.el("div", "", { attr: { style: c.cardBg } });
    root.innerHTML = `
    <div style="display:flex; gap:20px;">
        <div style="flex:2; padding:10px; border-right:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="color:${c.live}; font-weight:800; font-size:1.1em;">🟢 实盘账户</div>
                <div style="font-size:0.8em; opacity:0.5;">${live.count} 笔交易</div>
            </div>
            <div style="margin-top:15px;">
                <div style="font-size:2.5em; font-weight:900; color:${live.pnl>=0?c.live:c.loss}">${live.pnl>0?'+':''}${live.pnl}<span style="font-size:0.5em; opacity:0.5">$</span></div>
                <div style="font-size:0.9em; opacity:0.8;">胜率: <b>${live.wr}%</b></div>
            </div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:10px;">
            <div style="display:flex; justify-content:space-between; font-size:0.9em;">
                <span style="color:${c.demo}">🔵 模拟盘</span>
                <span>${demo.pnl}$ (${demo.wr}%)</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.9em;">
                <span style="color:${c.back}">🟠 复盘回测</span>
                <span>${back.pnl}$ (${back.wr}%)</span>
            </div>
        </div>
    </div>
    <div style="margin-top:20px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:0.7em; opacity:0.6; margin-bottom:8px;">📅 本月热力图 (${currentMonth})</div>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">${gridHtml}</div>
    </div>
    `;
}
var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};
const c = cfg.colors;

if (window.paData) {
    const trades = window.paData.trades; 
    
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

    const daysInMonth = moment().daysInMonth();
    const currentMonth = moment().format("YYYY-MM");
    let dailyMap = {};
    trades.filter(t => t.type === "Live" && t.date.startsWith(currentMonth)).forEach(t => {
        let day = parseInt(t.date.split("-")[2]); dailyMap[day] = (dailyMap[day] || 0) + t.pnl;
    });

    let gridHtml = "";
    for (let d = 1; d <= daysInMonth; d++) {
        let pnl = dailyMap[d];
        let bg = "rgba(255,255,255,0.03)";
        let border = "rgba(255,255,255,0.05)";
        let txt = `<div style="font-size:0.6em; opacity:0.3;">${d}</div>`;
        if (pnl !== undefined) {
            bg = pnl > 0 ? c.live + "22" : c.loss + "22"; 
            border = pnl > 0 ? c.live + "44" : c.loss + "44";
            txt = `<div style="font-size:0.6em; opacity:0.5;">${d}</div><div style="font-size:0.7em; font-weight:bold; color:${pnl>0?c.live:c.loss};">${Math.round(pnl)}</div>`;
        }
        gridHtml += `<div style="width:34px; height:34px; background:${bg}; border:1px solid ${border}; border-radius:6px; display:flex; flex-direction:column; align-items:center; justify-content:center;">${txt}</div>`;
    }

    // UI: 使用 glassCard
    const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard } });
    root.innerHTML = `
    <div style="display:flex; gap:20px;">
        <div style="flex:2; padding:10px; border-right:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="color:${c.live}; font-weight:800; font-size:1.1em;">🟢 实盘账户 (LIVE)</div>
                <div style="font-size:0.85em; opacity:0.6;">${live.count} Trades</div>
            </div>
            <div style="margin-top:15px;">
                <div style="font-size:2.6em; font-weight:900; color:${live.pnl>=0?c.live:c.loss}; text-shadow:0 0 20px ${live.pnl>=0?c.live:c.loss}33;">${live.pnl>0?'+':''}${live.pnl}<span style="font-size:0.5em; opacity:0.5; margin-left:5px;">$</span></div>
                <div style="font-size:0.9em; opacity:0.8; margin-top:5px;">胜率 (Win Rate): <b style="color:${c.text}">${live.wr}%</b></div>
            </div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:12px;">
            <div style="background:${c.hover}; border-radius:8px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; font-size:0.9em;">
                <div style="display:flex; align-items:center; gap:6px;"><div style="width:6px; height:6px; border-radius:50%; background:${c.demo};"></div><span style="color:${c.demo}">🔵 模拟</span></div>
                <div style="font-weight:bold;">${demo.pnl} <span style="opacity:0.5; font-weight:normal;">(${demo.wr}%)</span></div>
            </div>
            <div style="background:${c.hover}; border-radius:8px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; font-size:0.9em;">
                <div style="display:flex; align-items:center; gap:6px;"><div style="width:6px; height:6px; border-radius:50%; background:${c.back};"></div><span style="color:${c.back}">🟠 回测</span></div>
                <div style="font-weight:bold;">${back.pnl} <span style="opacity:0.5; font-weight:normal;">(${back.wr}%)</span></div>
            </div>
        </div>
    </div>
    <div style="margin-top:20px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:0.75em; opacity:0.6; margin-bottom:10px;">📅 本月热力图 (${currentMonth})</div>
        <div style="display:flex; flex-wrap:wrap; gap:5px;">${gridHtml}</div>
    </div>`;
}
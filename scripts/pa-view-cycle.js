const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

// 重新从 DataView 获取原始页面以读取 market_cycle 属性 (Engine V14.5 未深度清洗此字段)
// 为了方便，这里还是做一次轻量查询，或者你也可以去修改 Engine 把 cycle 加进去
const pages = dv.pages(cfg.tags.trade).where(p => !p.file.path.includes(cfg.paths.templates));
let cycleStats = {};

for (let p of pages) {
    let acct = (p["账户类型/account_type"] || "").toString();
    if (!acct.includes("Live") && !acct.includes("实盘")) continue;

    let cycleRaw = p["市场周期/market_cycle"] || p["market_cycle"] || "Unknown";
    let cycle = Array.isArray(cycleRaw) ? cycleRaw[0] : cycleRaw.toString();
    if(cycle.includes("/")) cycle = cycle.split("/")[1].trim(); 
    else if(cycle.includes("(")) cycle = cycle.split("(")[0].trim();

    if (!cycleStats[cycle]) cycleStats[cycle] = 0;
    let pnl = Number(p["净利润/net_profit"] || p["net_profit"] || 0);
    cycleStats[cycle] += pnl;
}

let sortedCycles = Object.keys(cycleStats).map(k => ({ name: k, pnl: cycleStats[k] })).sort((a, b) => b.pnl - a.pnl);

const root = dv.el("div", "", { attr: { style: cfg.colors.cardBg } });
root.innerHTML = `<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🌪️ 不同市场环境表现 (Live PnL)</div><div style="display:flex; flex-wrap:wrap; gap:8px;">` + 
sortedCycles.map(cy => {
    let color = cy.pnl > 0 ? c.live : (cy.pnl < 0 ? c.loss : "gray");
    let bg = cy.pnl > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";
    return `<div style="background:${bg}; border-radius:6px; padding:8px 12px; flex:1; min-width:100px; text-align:center;">
    <div style="font-size:0.8em; opacity:0.8;">${cy.name}</div>
    <div style="font-weight:800; color:${color}; font-size:1.1em;">${cy.pnl>0?"+":""}${cy.pnl}</div></div>`;
}).join("") + `</div>`;
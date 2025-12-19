var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};
var c = cfg.colors || {};

// 数据获取
var pages = (typeof pages !== 'undefined') ? pages : dv.pages(cfg.tags.trade).where(p => !p.file.path.includes(cfg.paths.templates));
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

const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard } });
root.innerHTML = `
    <div style="font-weight:700; color:${c.text}; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
        <span style="color:${c.accent}">🌪️</span> 市场环境表现 (Cycle Performance)
    </div>
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:10px;">
        ${sortedCycles.map(cy => {
            let isWin = cy.pnl > 0;
            let color = isWin ? c.live : (cy.pnl < 0 ? c.loss : c.textSub);
            let bg = isWin ? `linear-gradient(180deg, ${c.live}11, ${c.live}05)` : `linear-gradient(180deg, ${c.loss}11, ${c.loss}05)`;
            let border = isWin ? `${c.live}33` : `${c.loss}33`;
            
            return `
            <div style="background:${bg}; border:1px solid ${border}; border-radius:8px; padding:10px; text-align:center; transition:transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                <div style="font-size:0.75em; color:${c.textSub}; margin-bottom:4px;">${cy.name}</div>
                <div style="font-weight:800; color:${color}; font-size:1.1em;">${isWin?"+":""}${cy.pnl}</div>
            </div>`;
        }).join("")}
    </div>
`;
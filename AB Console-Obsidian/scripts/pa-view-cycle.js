const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

// 单一信源：直接使用 pa-core 输出的 tradesAsc
const tradesAsc = window.paData?.tradesAsc || [];
let cycleStats = {};

for (let t of tradesAsc) {
  if (!t || t.type !== "Live") continue;

  let cycle = (t.market_cycle || "Unknown").toString();
  if (cycle.includes("/")) cycle = cycle.split("/")[1].trim();
  else if (cycle.includes("(")) cycle = cycle.split("(")[0].trim();

  if (!cycleStats[cycle]) cycleStats[cycle] = 0;
  cycleStats[cycle] += Number(t.pnl) || 0;
}

let sortedCycles = Object.keys(cycleStats)
  .map((k) => ({ name: k, pnl: cycleStats[k] }))
  .sort((a, b) => b.pnl - a.pnl);

const root = dv.el("div", "", { attr: { style: cfg.colors.cardBg } });
root.innerHTML =
  `<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🌪️ 不同市场环境表现 (Live PnL)</div><div style="display:flex; flex-wrap:wrap; gap:8px;">` +
  sortedCycles
    .map((cy) => {
      let color = cy.pnl > 0 ? c.live : cy.pnl < 0 ? c.loss : "gray";
      let bg =
        cy.pnl > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";
      return `<div style="background:${bg}; border-radius:6px; padding:8px 12px; flex:1; min-width:100px; text-align:center;">
    <div style="font-size:0.8em; opacity:0.8;">${cy.name}</div>
    <div style="font-weight:800; color:${color}; font-size:1.1em;">${
        cy.pnl > 0 ? "+" : ""
      }${cy.pnl}</div></div>`;
    })
    .join("") +
  `</div>`;

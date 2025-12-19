const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

const root = dv.el("div", "", { attr: { style: c.cardBg } });
const btn = (color, text, cmd) => `<button onclick="app.commands.executeCommandById('${cmd}')" style="background:${color}; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:bold; margin-right:10px;">${text}</button>`;

root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🚀 快速行动 (Quick Actions)</div>
<div style="display:flex; align-items:center;">
    ${btn(c.live, "+ 实盘 (Live)", "quickadd:choice:New Live Trade")}
    ${btn(c.demo, "+ 模拟 (Demo)", "quickadd:choice:New Demo Trade")}
    ${btn(c.back, "+ 回测 (Back)", "quickadd:choice:New Backtest")}
</div>`;
var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};
var c = cfg.colors || {};

if (typeof dv === 'undefined') return;
if (!window.paData) { dv.el("div", "🦁 Engine Loading...", { attr: { style: "opacity:0.5; padding:20px; text-align:center;" } }); return; }

const root = dv.el("div", "", { attr: { style: `background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px;` } });
const btn = (color, text, cmd) => `<button onclick="app.commands.executeCommandById('${cmd}')" style="background:${color}; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:bold; margin-right:10px;">${text}</button>`;

root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🚀 快速行动 (Quick Actions)</div>
<div style="display:flex; align-items:center;">
    ${btn(c.live, "+ 实盘 (Live)", "quickadd:choice:New Live Trade")}
    ${btn(c.demo, "+ 模拟 (Demo)", "quickadd:choice:New Demo Trade")}
    ${btn(c.back, "+ 回测 (Back)", "quickadd:choice:New Backtest")}
</div>`;
var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};
var c = cfg.colors || {};

const root = dv.el("div", "", { attr: { style: `background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px;` } });
const btn = (color, text, cmd) => `<button onclick="app.commands.executeCommandById('${cmd}')" style="background:${color}; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:bold; margin-right:10px;">${text}</button>`;

root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🚀 快速行动 (Quick Actions)</div>
<div style="display:flex; align-items:center;">
    ${btn(c.live, "+ 实盘 (Live)", "quickadd:choice:New Live Trade")}
    ${btn(c.demo, "+ 模拟 (Demo)", "quickadd:choice:New Demo Trade")}
    ${btn(c.back, "+ 回测 (Back)", "quickadd:choice:New Backtest")}
</div>`;
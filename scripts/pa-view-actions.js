const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

const root = dv.el("div", "", { attr: { style: c.cardBg } });
const btn = (color, text, cmd) =>
  `<button onclick="app.commands.executeCommandById('${cmd}')" style="background:${color}; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer; font-weight:bold; margin:4px; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-size:0.9em;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.3)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.2)';">${text}</button>`;

root.innerHTML = `
<div style="font-weight:800; opacity:0.85; margin-bottom:12px;">🚀 快速行动 <span style="font-weight:600; opacity:0.5; font-size:0.85em;">(Quick Actions)</span></div>

<div style="background:rgba(34,197,94,0.05); padding:14px; border-radius:8px; border:1px solid rgba(34,197,94,0.2);">
  <div style="font-size:0.85em; opacity:0.7; margin-bottom:8px;">💼 创建交易笔记 (观察 → 形态识别 → 策略匹配 → 交易)</div>
  <div style="display:flex; flex-wrap:wrap; justify-content:center;">
    ${btn(c.live, "🟢 实盘交易", "quickadd:choice:New Live Trade")}
    ${btn(c.demo, "🔵 模拟交易", "quickadd:choice:New Demo Trade")}
    ${btn(c.back, "🟡 回测记录", "quickadd:choice:New Backtest")}
  </div>
</div>
`;


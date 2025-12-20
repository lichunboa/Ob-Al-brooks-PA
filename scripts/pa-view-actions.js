const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

const root = dv.el("div", "", { attr: { style: c.cardBg } });
const btn = (color, text, cmd) =>
  `<button onclick="app.commands.executeCommandById('${cmd}')" style="background:${color}; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:bold; margin:4px 4px 4px 0; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.3)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.2)';">${text}</button>`;

root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🚀 快速行动 (Quick Actions)</div>

<div style="background:rgba(59,130,246,0.05); padding:12px; border-radius:8px; border:1px solid rgba(59,130,246,0.2); margin-bottom:10px;">
  <div style="font-size:0.85em; opacity:0.7; margin-bottom:8px;">📊 分析图表</div>
  <div style="display:flex; flex-wrap:wrap;">
    ${btn("#8b5cf6", "📈 新建图表分析", "quickadd:choice:New Chart Analysis")}
  </div>
</div>

<div style="background:rgba(34,197,94,0.05); padding:12px; border-radius:8px; border:1px solid rgba(34,197,94,0.2);">
  <div style="font-size:0.85em; opacity:0.7; margin-bottom:8px;">💼 创建交易笔记</div>
  <div style="display:flex; flex-wrap:wrap;">
    ${btn(c.live, "🟢 实盘 (Live)", "quickadd:choice:New Live Trade")}
    ${btn(c.demo, "🔵 模拟 (Demo)", "quickadd:choice:New Demo Trade")}
    ${btn(c.back, "🟡 回测 (Back)", "quickadd:choice:New Backtest")}
  </div>
</div>
`;

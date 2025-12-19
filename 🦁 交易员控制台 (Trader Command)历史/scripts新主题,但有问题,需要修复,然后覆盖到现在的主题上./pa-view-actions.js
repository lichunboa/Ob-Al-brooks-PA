const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/Scripts/pa-config.js");
const c = cfg.colors;

const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard + " padding:12px 20px; display:flex; justify-content:space-between; align-items:center;" } });

// 按钮样式生成器
const btnStyle = (color) => `
    background: linear-gradient(145deg, ${color}22, ${color}11);
    border: 1px solid ${color}44;
    color: ${color};
    padding: 6px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9em;
    transition: all 0.2s ease;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    backdrop-filter: blur(4px);
`;

const btn = (color, text, cmd) => `<button onclick="app.commands.executeCommandById('${cmd}')" style="${btnStyle(color)}" onmouseover="this.style.background='${color}';this.style.color='#fff';this.style.boxShadow='0 0 10px ${color}66'" onmouseout="this.style.background='linear-gradient(145deg, ${color}22, ${color}11)';this.style.color='${color}';this.style.boxShadow='0 2px 5px rgba(0,0,0,0.1)'">${text}</button>`;

root.innerHTML = `
    <div style="font-weight:700; color:${c.text}; display:flex; align-items:center; gap:8px;">
        <span style="font-size:1.2em;">🚀</span> 
        <span style="opacity:0.9;">Quick Actions</span>
    </div>
    <div style="display:flex; gap:12px;">
        ${btn(c.live, "+ Live Trade", "quickadd:choice:New Live Trade")}
        ${btn(c.demo, "+ Demo Trade", "quickadd:choice:New Demo Trade")}
        ${btn(c.back, "+ Backtest", "quickadd:choice:New Backtest")}
    </div>
`;
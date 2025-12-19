var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};
var c = (typeof c !== 'undefined') ? c : (cfg.colors || {});

if (typeof strategyFolder === 'undefined') var strategyFolder = "策略库Strategies"; 
var strategies = (typeof strategies !== 'undefined') ? strategies : dv.pages(`"${strategyFolder}"`);
var html = (typeof html !== 'undefined') ? html : "";
let contextKeywords = {
    "多头趋势 (Bull)": ["Bull Trend", "多头", "Bull"],
    "空头趋势 (Bear)": ["Bear Trend", "空头", "Bear"],
    "交易区间 (Range)": ["Trading Range", "区间", "Range"]
};

Object.keys(contextKeywords).forEach(ctxName => {
    let keywords = contextKeywords[ctxName];
    let matches = strategies.where(p => {
        let val = (p["trend_context/趋势环境"] || p["trend_context"] || "").toString();
        return keywords.some(k => val.includes(k));
    });
    
    if (matches.length > 0) {
        html += `<div style="margin-bottom:15px;">
            <div style="font-size:0.8em; color:${c.textSub}; font-weight:700; margin-bottom:6px; text-transform:uppercase;">${ctxName}</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">`;
        for (let s of matches) {
            html += `<a href="${s.file.path}" class="internal-link" style="background:rgba(255,255,255,0.05); color:${c.text}; padding:6px 12px; border-radius:6px; text-decoration:none; font-size:0.85em; border:1px solid ${c.border}; transition:0.2s;" onmouseover="this.style.background='${c.accent}22';this.style.borderColor='${c.accent}66'" onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='${c.border}'">${s.file.name}</a>`;
        }
        html += `</div></div>`;
    }
});

const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard } });
root.innerHTML = `
<div style="font-weight:700; color:${c.text}; margin-bottom:15px;">📘 策略剧本 (Playbook)</div>
${html || `<div style='opacity:0.5; font-size:0.8em; padding:20px; text-align:center;'>暂无策略笔记</div>`}
`;
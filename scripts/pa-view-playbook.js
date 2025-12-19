var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};

// 加载防护
if (typeof dv === 'undefined') return;
if (!window.paData) { dv.el("div", "🦁 Engine Loading...", { attr: { style: "opacity:0.5; padding:20px; text-align:center;" } }); return; }

if (typeof strategyFolder === 'undefined') var strategyFolder = "策略库Strategies";
var strategies = (typeof strategies !== 'undefined') ? strategies : dv.pages(`"${strategyFolder}"`);

let html = "";
let contextKeywords = {
    "多头趋势": ["Bull Trend", "多头", "Bull"],
    "空头趋势": ["Bear Trend", "空头", "Bear"],
    "交易区间": ["Trading Range", "区间", "Range"]
};

Object.keys(contextKeywords).forEach(ctxName => {
    let keywords = contextKeywords[ctxName];
    let matches = strategies.where(p => {
        let val = (p["trend_context/趋势环境"] || p["trend_context"] || "").toString();
        return keywords.some(k => val.includes(k));
    });
    
    if (matches.length > 0) {
        html += `<div style="margin-bottom:10px;">
            <div style="font-size:0.85em; opacity:0.7; font-weight:bold; margin-bottom:4px;">${ctxName}</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">`;
        for (let s of matches) {
            html += `<a href="${s.file.path}" class="internal-link" style="background:rgba(59,130,246,0.15); color:${cfg.colors.demo}; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:0.8em; border:1px solid rgba(59,130,246,0.3);">${s.file.name}</a>`;
        }
        html += `</div></div>`;
    }
});

const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard } });
root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">📘 策略剧本 (Playbook)</div>
${html || `<div style='opacity:0.5; font-size:0.8em;'>暂无策略笔记。<br>请检查 "trend_context" 属性。</div>`}
`;
var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};

if (typeof strategyFolder === 'undefined') var strategyFolder = "策略库Strategies"; // ⚠️ 请确认文件夹名称
var strategies = (typeof strategies !== 'undefined') ? strategies : dv.pages(`"${strategyFolder}"`);

let html = "";
let contextKeywords = {
    "多头趋势": ["Bull Trend", "多头", "Bull"],
    "空头趋势": ["Bear Trend", "空头", "Bear"],
    "交易区间": ["Trading Range", "区间", "Range"]
};

Object.keys(contextKeywords).forEach(ctxName => {
    let keywords = contextKeywords[ctxName];
    let matches = strategies.where(p => {
        let val = (p["trend_context/趋势环境"] || p["trend_context"] || "").toString();
        return keywords.some(k => val.includes(k));
    });
    
    if (matches.length > 0) {
        html += `<div style="margin-bottom:10px;">
            <div style="font-size:0.85em; opacity:0.7; font-weight:bold; margin-bottom:4px;">${ctxName}</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">`;
        for (let s of matches) {
            html += `<a href="${s.file.path}" class="internal-link" style="background:rgba(59,130,246,0.15); color:${cfg.colors.demo}; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:0.8em; border:1px solid rgba(59,130,246,0.3);">${s.file.name}</a>`;
        }
        html += `</div></div>`;
    }
});

const root = dv.el("div", "", { attr: { style: cfg.colors.cardBg } });
root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">📘 策略剧本 (Playbook)</div>
${html || `<div style='opacity:0.5; font-size:0.8em;'>暂无策略笔记。<br>请检查 "trend_context" 属性。</div>`}
`;
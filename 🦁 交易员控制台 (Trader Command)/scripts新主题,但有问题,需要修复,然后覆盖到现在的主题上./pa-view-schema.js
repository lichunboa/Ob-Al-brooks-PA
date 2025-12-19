var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};
var c = (typeof c !== 'undefined') ? c : (cfg.colors || {});

var pages = (typeof pages !== 'undefined') ? pages : dv.pages("#PA").where(p => !p.file.path.includes(cfg.paths.templates));
let schema = {}, tagsMap = {}, fixList = [];
const ignore = ["file", "date", "position", "categories", "aliases", "cssclasses", "cover", "封面"];

for (let p of pages) {
    if(p.file.tags) p.file.tags.forEach(t => tagsMap[t] = (tagsMap[t] || 0) + 1);
    for (let key in p) {
        if (ignore.includes(key) || key.startsWith("file") || key.includes("path")) continue;
        if (!schema[key]) schema[key] = {};
        let raw = p[key], vals = Array.isArray(raw) ? raw : [raw];
        for (let v of vals) {
            let s = (v===null||v===undefined) ? "null" : (v.path ? `[[${v.path.replace(".md","")}]]` : v.toString().trim());
            if (s==="") s="Empty";
            schema[key][s] = (schema[key][s] || 0) + 1;
            if (s==="Empty" || s==="null" || s.toLowerCase().includes("unknown")) {
                fixList.push({ link: p.file.link, key: key, val: s, issue: "❌ 异常值" });
            }
        }
    }
}

const root = dv.el("div", "", { attr: { style: "display:flex; flex-direction:column; gap:20px;" } });
var html = (typeof html !== 'undefined') ? html : "";

// 1. Fix Station
if (fixList.length > 0) {
    html += `
    <div style="${cfg.styles.glassCard} border:1px solid ${c.loss}66; box-shadow:0 0 15px ${c.loss}22;">
        <div style="font-weight:bold; color:${c.loss}; margin-bottom:10px; display:flex; justify-content:space-between;">
            <span>🚑 异常修复台 (Fix Station)</span>
            <span style="background:${c.loss}; color:white; padding:2px 8px; border-radius:10px; font-size:0.8em;">${fixList.length}</span>
        </div>
        <div style="max-height:200px; overflow-y:auto;">
            <table style="width:100%; font-size:0.85em; border-collapse:collapse;">
                <thead style="color:${c.textSub}; text-align:left; border-bottom:1px solid ${c.border};"><tr><th style="padding:5px;">File</th><th>Key</th><th>Value</th></tr></thead>
                <tbody>${fixList.map(x => `<tr><td style="padding:5px;">${x.link}</td><td style="color:${c.demo}; font-family:monospace;">${x.key}</td><td style="opacity:0.6;"><del>${x.val}</del></td></tr>`).join("")}</tbody>
            </table>
        </div>
    </div>`;
}

// 2. Tag Cloud
let tagHtml = Object.entries(tagsMap).sort((a,b)=>b[1]-a[1]).map(([t,c])=>`<span style="${cfg.styles.pill}">${t} <span style="opacity:0.5">(${c})</span></span>`).join("");
html += `<div style="${cfg.styles.glassCard}"><div style="font-weight:bold; color:${c.text}; margin-bottom:10px;">🏷️ 标签云</div><div style="display:flex; flex-wrap:wrap; gap:6px;">${tagHtml}</div></div>`;

// 3. Dictionary
let dictHtml = Object.keys(schema).sort().map(k => {
    let pills = Object.entries(schema[k]).sort((a,b)=>b[1]-a[1]).map(([v,n])=>`<span style="${cfg.styles.pill} ${v.includes('Empty')?'border-color:'+c.loss:''}">${v} <span style="opacity:0.5">(${n})</span></span>`).join("");
    return `<div style="display:grid; grid-template-columns: 150px 1fr; gap:10px; border-bottom:1px solid ${c.border}; padding:8px 0;"><div style="font-family:monospace; color:${c.accent}; font-size:0.9em;">${k}</div><div style="display:flex; gap:4px; flex-wrap:wrap;">${pills}</div></div>`;
}).join("");
html += `<div style="${cfg.styles.glassCard}"><div style="font-weight:bold; color:${c.text}; margin-bottom:10px;">📚 全域数据字典</div><div style="font-size:0.85em;">${dictHtml}</div></div>`;

root.innerHTML = html;
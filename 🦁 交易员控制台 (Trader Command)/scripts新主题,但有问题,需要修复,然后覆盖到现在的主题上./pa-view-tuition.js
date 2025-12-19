var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};
const c = cfg.colors;

if (window.paData) {
    const stats = window.paData.stats;
    const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard } });
    
    let content = "";
    if (stats.tuition === 0) {
        content = `<div style="color:${c.live}; font-weight:bold; padding:10px; background:${c.live}11; border-radius:8px; text-align:center;">🎉 完美执行！近期无纪律性亏损。</div>`;
    } else {
        let sortedErrors = Object.entries(stats.errors).sort((a,b) => b[1] - a[1]);
        content = `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:15px; border-bottom:1px solid ${c.border}; padding-bottom:10px;">
            <span style="font-size:0.9em; color:${c.textSub};">执行错误总亏损</span>
            <span style="color:${c.loss}; font-weight:800; font-size:1.4em; text-shadow:0 0 10px ${c.loss}44;">-$${stats.tuition}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
            ${sortedErrors.map(([name, cost]) => {
                let percent = Math.round((cost / stats.tuition) * 100);
                return `
                <div style="display:flex; align-items:center; font-size:0.85em;">
                    <div style="width:100px; color:${c.text}; opacity:0.9;">${name}</div>
                    <div style="flex:1; background:rgba(255,255,255,0.05); height:6px; border-radius:3px; overflow:hidden; margin:0 12px;">
                        <div style="width:${percent}%; height:100%; background:${c.loss}; border-radius:3px; box-shadow:0 0 8px ${c.loss}66;"></div>
                    </div>
                    <div style="width:60px; text-align:right; font-weight:bold; color:${c.loss}; opacity:0.9;">-$${cost}</div>
                </div>`;
            }).join("")}
        </div>`;
    }

    root.innerHTML = `
        <div style="font-weight:700; color:${c.text}; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
            <span style="color:${c.loss}">💸</span> 错误的代价 (Cost of Errors)
        </div>
        ${content}
    `;
}
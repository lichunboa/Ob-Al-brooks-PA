const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/Scripts/pa-config.js");
const c = cfg.colors;

if (window.paData) {
    const trades = window.paData.trades.slice(0, 20); 

    function renderCard(n) {
        let rawCover = n.cover; 
        if (!rawCover || rawCover === "Unknown") return "";
        let src = rawCover.includes("[[") ? app.vault.adapter.getResourcePath(app.metadataCache.getFirstLinkpathDest(rawCover.replace(/!|\[\[|\]\]/g, ""), n.id).path) : rawCover;
        if (!src) return "";

        let acct = n.type;
        let badgeColor = acct === "Live" ? c.live : (acct === "Backtest" ? c.back : c.demo);
        let pnlColor = n.pnl >= 0 ? c.live : c.loss;

        return `
        <div style="position:relative; aspect-ratio:16/9; border-radius:10px; overflow:hidden; border:1px solid ${c.border}; margin-bottom:0; box-shadow:0 4px 10px rgba(0,0,0,0.2); transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${src}" style="width:100%; height:100%; object-fit:cover;">
            <div style="position:absolute; top:8px; right:8px; background:${badgeColor}cc; backdrop-filter:blur(4px); color:white; font-size:0.65em; font-weight:800; padding:3px 8px; border-radius:4px; box-shadow:0 2px 5px rgba(0,0,0,0.2);">${acct.toUpperCase()}</div>
            <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(to top, rgba(0,0,0,0.9), transparent); padding:20px 10px 8px 10px; display:flex; justify-content:space-between; align-items:flex-end;">
                <a href="${n.id}" class="internal-link" style="color:white; text-decoration:none; font-size:0.8em; font-weight:bold; text-shadow:0 1px 3px black;">${n.name}</a>
                <div style="color:${pnlColor}; font-weight:800; font-size:1em; text-shadow:0 1px 3px black;">${n.pnl>0?"+":""}${n.pnl}</div>
            </div>
        </div>`;
    }

    let imgs = "";
    let count = 0;
    for (let i = 0; i < trades.length; i++) {
        let card = renderCard(trades[i]);
        if (card) { imgs += card; count++; }
        if (count >= 4) break; 
    }

    const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard } });
    root.innerHTML = `
    <div style="font-weight:700; color:${c.text}; margin-bottom:15px;">🖼️ 最新复盘 (Latest Charts)</div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        ${imgs || "<div style='grid-column:1/-1; opacity:0.5; padding:30px; text-align:center; border:1px dashed " + c.border + "; border-radius:8px;'>暂无封面图片</div>"}
    </div>
    <div style="text-align:center; margin-top:15px; padding-top:10px; border-top:1px solid ${c.border};">
        <a href="obsidian://search?query=tag:${cfg.tags.trade}" style="color:${c.accent}; text-decoration:none; font-size:0.85em; font-weight:500;">📂 查看所有图表 →</a>
    </div>
    `;
}
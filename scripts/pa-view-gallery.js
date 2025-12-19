/* 文件名: Scripts/pa-view-gallery.js
   用途: 综合画廊 (Simple & Clean)
   修复: 恢复 renderCard 完整逻辑，解决图片不显示问题
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

if (window.paData) {
    const trades = window.paData.trades.slice(0, 20); // 取前20个备选

    // 核心修复: 完整的图片渲染函数
    function renderCard(n) {
        let rawCover = n.cover; // Engine 已经提取了 cover 属性
        if (!rawCover || rawCover === "Unknown") return "";
        
        let src = "";
        // 1. 处理 Obsidian 内部链接 ![[image.png]]
        if (rawCover.includes("[[")) {
            let path = rawCover.replace("![[", "").replace("]]", "").replace("[[", "");
            // 尝试获取文件对象
            let file = app.metadataCache.getFirstLinkpathDest(path, n.id);
            if (file) {
                src = app.vault.adapter.getResourcePath(file.path);
            }
        } 
        // 2. 处理 http 链接
        else {
            src = rawCover; 
        }
        
        if (!src) return ""; // 如果解析不出图片路径，跳过

        let acct = n.type;
        let badgeColor = acct === "Live" ? c.live : (acct === "Backtest" ? c.back : c.demo);
        let pnlColor = n.pnl >= 0 ? c.live : c.loss;
        let pnlTxt = n.pnl > 0 ? `+${n.pnl}` : `${n.pnl}`;

        return `<div style="position:relative; aspect-ratio:16/9; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); margin-bottom:8px;">
            <img src="${src}" style="width:100%; height:100%; object-fit:cover;">
            <div style="position:absolute; top:5px; right:5px; background:${badgeColor}; color:black; font-size:0.6em; font-weight:800; padding:2px 6px; border-radius:4px;">${acct.toUpperCase()}</div>
            <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent, rgba(0,0,0,0.9)); padding:15px 8px 5px 8px; display:flex; justify-content:space-between; align-items:flex-end;">
                <a href="${n.id}" class="internal-link" style="color:white; text-decoration:none; font-size:0.75em; font-weight:bold;">${n.name}</a>
                <div style="color:${pnlColor}; font-weight:800; font-size:0.9em;">${pnlTxt}</div>
            </div>
        </div>`;
    }

    let imgs = "";
    let count = 0;
    for (let i = 0; i < trades.length; i++) {
        let card = renderCard(trades[i]);
        if (card) { 
            imgs += card; 
            count++; 
        }
        if (count >= 4) break; // 只显示 4 张
    }

    const root = dv.el("div", "", { attr: { style: c.cardBg } });
    root.innerHTML = `
    <div style="font-weight:700; opacity:0.7; margin-bottom:10px;">🖼️ 最新复盘 (Charts)</div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        ${imgs || "<div style='opacity:0.5; padding:20px; text-align:center;'>暂无封面图片<br><small>请在 Frontmatter 添加 cover: ![[图片]]</small></div>"}
    </div>
    <div style="text-align:center; margin-top:12px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.05);">
        <a href="obsidian://search?query=tag:${cfg.tags.trade}" style="color:${c.demo}; text-decoration:none; font-size:0.8em;">📂 查看所有图表</a>
    </div>
    `;
}
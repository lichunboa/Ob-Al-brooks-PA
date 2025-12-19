/* 文件名: Scripts/pa-view-memory.js (V2.0 Crystal)
   用途: 记忆库 UI 视图
*/
var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};

// 注入光效动画
const style = document.createElement('style');
style.innerHTML = `@keyframes glow { 0% { box-shadow: 0 0 5px ${cfg.colors.accent}44; } 50% { box-shadow: 0 0 15px ${cfg.colors.accent}88; } 100% { box-shadow: 0 0 5px ${cfg.colors.accent}44; } }`;
document.head.appendChild(style);

if (window.paData && window.paData.sr) {
    const sr = window.paData.sr;
    const course = window.paData.course;
    const c = cfg.colors;
    const pTotal = Math.max(sr.total, 1);

    // --- 来源数据 (逻辑保持不变) ---
    const safeFileList = sr.fileList || []; 
    const safeFolders = sr.folders || {};
    const topFolderNames = Object.entries(safeFolders).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

    const folderHtml = topFolderNames.map(fName => {
        const filesInFolder = safeFileList.filter(f => f.folder === fName).sort((a, b) => b.count - a.count).slice(0, 5)
            .map(f => `<div style="display:flex; justify-content:space-between; font-size:0.85em; padding:6px 0; border-bottom:1px solid ${c.border}; color:${c.textSub};"><a href="${f.path}" class="internal-link" style="text-decoration:none; color:${c.text}; width:80%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📄 ${f.name.replace('.md','')}</a><span>${f.count}</span></div>`).join("");
        return `<details style="background:${c.hover}; border:1px solid ${c.border}; border-radius:8px; margin-bottom:8px; overflow:hidden;"><summary style="padding:8px 12px; cursor:pointer; font-size:0.8em; color:${c.text}; font-weight:bold; display:flex; justify-content:space-between;"><span>📂 ${fName}</span><span style="background:rgba(255,255,255,0.1); padding:0 6px; border-radius:10px;">${safeFolders[fName]}</span></summary><div style="padding:0 12px 8px 12px;">${filesInFolder}</div></details>`;
    }).join("");

    // 图表逻辑
    const days = []; const loadCounts = [];
    for(let i=1; i<=7; i++) { let d = moment().add(i, 'days').format("YYYY-MM-DD"); days.push(`+${i}`); loadCounts.push(sr.load[d] || 0); }
    const maxLoad = Math.max(...loadCounts, 3);
    const chartHtml = loadCounts.map((val, i) => {
        let h = Math.max(4, (val / maxLoad) * 40); if (h > 40) h = 40;
        let bg = val > 0 ? c.accent : "rgba(255,255,255,0.1)";
        return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;"><div style="width:6px; height:${h}px; background:${bg}; border-radius:3px; box-shadow:0 0 ${val>0?8:0}px ${bg}66;"></div><div style="font-size:0.5em; opacity:0.4;">${days[i]}</div></div>`;
    }).join("");

    // 推荐卡片
    let recHtml = "";
    if (sr.due > 0 && sr.focusFile) {
        let f = sr.focusFile;
        recHtml = `<div style="color:${c.loss}; font-size:0.7em; font-weight:bold; margin-bottom:4px; letter-spacing:1px;">🔥 FOCUS REVIEW</div><a href="${f.path}" class="internal-link" style="color:${c.text}; font-weight:bold; font-size:0.95em; text-decoration:none; line-height:1.4;">${f.name.replace('.md','')}</a><div style="margin-top:6px; font-size:0.8em; display:flex; justify-content:space-between; color:${c.textSub};"><span>Due: <b style="color:${c.loss}">${f.due}</b></span><span>Ease: ${f.avgEase}</span></div>`;
    } else if (course.hybridRec) {
        let item = course.hybridRec.data;
        let isNew = course.hybridRec.type === "New";
        recHtml = `<div style="color:${c.accent}; font-size:0.7em; font-weight:bold; margin-bottom:4px; letter-spacing:1px;">${isNew?'🚀 NEW TOPIC':'🎲 QUIZ TIME'}</div><div style="color:${c.text}; font-weight:bold; font-size:0.95em; line-height:1.4;">${isNew ? item.t : `"${item.q}"`}</div><div style="margin-top:6px; font-size:0.8em; color:${c.textSub};">${isNew ? 'From Syllabus' : 'From Flashcards'}</div>`;
        if(!isNew) recHtml += `<a href="${item.path}" class="internal-link" style="display:block; margin-top:8px; text-align:center; background:${c.accent}22; color:${c.accent}; padding:4px; border-radius:4px; font-size:0.8em; text-decoration:none;">👉 Go</a>`;
    } else {
        recHtml = `<div style="opacity:0.5; font-size:0.85em; text-align:center;">All Clear! 🎉</div>`;
    }

    const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard } });
    root.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:1.4em;">🧠</span>
            <div>
                <div style="font-weight:800; font-size:1.1em; color:${c.text};">Memory Core</div>
                <div style="font-size:0.75em; color:${c.textSub};">Total: ${sr.total} Cards</div>
            </div>
        </div>
        <div style="text-align:right;">
            <div style="font-size:0.7em; color:${c.textSub}; text-transform:uppercase;">Due Today</div>
            <div style="font-size:1.6em; font-weight:900; color:${sr.due>0?c.loss:c.text}; text-shadow:0 0 10px ${sr.due>0?c.loss:c.text}44;">${sr.due}</div>
        </div>
    </div>

    <div style="display:flex; height:6px; width:100%; border-radius:3px; overflow:hidden; margin-bottom:20px; background:rgba(255,255,255,0.05);">
        <div style="width:${(sr.cnt.sNorm/pTotal)*100}%; background:${c.demo};"></div>
        <div style="width:${(sr.cnt.sRev*2/pTotal)*100}%; background:${c.demo}88;"></div>
        <div style="width:${(sr.cnt.mNorm/pTotal)*100}%; background:${c.live};"></div>
        <div style="width:${(sr.cnt.mRev*2/pTotal)*100}%; background:${c.live}88;"></div>
        <div style="width:${(sr.cnt.cloze/pTotal)*100}%; background:${c.accent}; box-shadow:0 0 10px ${c.accent};"></div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:20px;">
        <div style="background:${c.hover}; border:1px solid ${c.border}; border-radius:8px; padding:10px; text-align:center;">
            <div style="color:${c.demo}; font-size:0.7em; font-weight:bold; margin-bottom:2px;">BASIC</div>
            <div style="font-weight:800; color:${c.text};">${sr.cnt.sNorm + sr.cnt.sRev*2}</div>
        </div>
        <div style="background:${c.hover}; border:1px solid ${c.border}; border-radius:8px; padding:10px; text-align:center;">
            <div style="color:${c.live}; font-size:0.7em; font-weight:bold; margin-bottom:2px;">MULTI</div>
            <div style="font-weight:800; color:${c.text};">${sr.cnt.mNorm + sr.cnt.mRev*2}</div>
        </div>
        <div style="background:${c.hover}; border:1px solid ${c.border}; border-radius:8px; padding:10px; text-align:center;">
            <div style="color:${c.accent}; font-size:0.7em; font-weight:bold; margin-bottom:2px;">CLOZE</div>
            <div style="font-weight:800; color:${c.text};">${sr.cnt.cloze}</div>
        </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1.2fr; gap:15px; margin-bottom:20px;">
        <div style="background:rgba(0,0,0,0.2); border-radius:10px; padding:12px; display:flex; align-items:flex-end;">${chartHtml}</div>
        <div style="background:${sr.due>0?c.loss+'11':c.accent+'11'}; border:1px solid ${sr.due>0?c.loss+'33':c.accent+'33'}; border-radius:10px; padding:12px; display:flex; flex-direction:column; justify-content:center;">${recHtml}</div>
    </div>

    ${folderHtml ? `<div style="margin-bottom:20px;">${folderHtml}</div>` : ''}

    <button onclick="app.commands.executeCommandById('obsidian-spaced-repetition:srs-review-flashcards')" style="width:100%; background:linear-gradient(90deg, ${c.accent}, #7C3AED); color:white; border:none; padding:12px; border-radius:10px; cursor:pointer; font-weight:bold; font-size:0.95em; box-shadow:0 4px 15px ${c.accent}66; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">⚡️ 开始复习 (Start Review)</button>
    `;
} else {
    dv.el("div", "🦁 Engine Loading...", { attr: { style: "opacity:0.5; padding:20px; text-align:center;" } });
}
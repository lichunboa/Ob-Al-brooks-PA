/* 文件名: Scripts/pa-view-course.js (V2.4 - Logic Restore)
   用途: 课程地图 (Course Matrix)
   修复: 还原 ID 识别逻辑 (保留 L/M 前缀)，保持 V2.0 水晶 UI
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/Scripts/pa-config.js");
const c = cfg.colors;

if (window.paData && window.paData.course) {
    const course = window.paData.course;
    const syllabus = course.syllabus || [];
    const doneSet = course.done;
    const linkMap = course.map;

    // --- 1. 推荐逻辑 (保持原版) ---
    let next = null;
    let recommendationType = "New";

    // 优先找没学过的
    for (let s of syllabus) {
        let sid = s.id.replace(/[A-Z]/g, ""); // 辅助判断
        if (!doneSet.has(s.id) && !doneSet.has(sid)) {
            next = s;
            break;
        }
    }
    // 如果都学完了，随机推荐一节 (二刷)
    if (!next && syllabus.length > 0) {
        let randomIndex = Math.floor(Math.random() * syllabus.length);
        next = syllabus[randomIndex];
        recommendationType = "Review";
    }

    // --- 2. 渲染网格 (UI: Crystal, Logic: Original) ---
    let phases = [...new Set(syllabus.map(s => s.p))];
    
    let gridHtml = phases.map(p => {
        let items = syllabus.filter(s => s.p === p).map(s => {
            // 状态判断
            let isDone = doneSet.has(s.id) || doneSet.has(s.id.replace(/[A-Z]/g, ""));
            let link = linkMap[s.id] || linkMap[s.id.replace(/[A-Z]/g, "")];
            
            // UI 样式 (V2.0 水晶风格)
            let bg = isDone ? c.live : (link ? c.demo : "rgba(255,255,255,0.05)");
            let shadow = isDone ? `0 0 8px ${c.live}66` : "none";
            
            // === 核心修复: ID 逻辑还原 (按你提供的正确版本) ===
            let short = s.id.replace(/^0/, ""); // 只去掉开头的0，保留 L01, M02
            if (short.toLowerCase().includes("bonus")) {
                short = "B" + short.replace(/[^0-9]/g, ""); // Bonus01 -> B1
            }
            // ===========================================

            let contentStyle = "width:100%; height:100%; display:flex; align-items:center; justify-content:center; text-decoration:none; font-weight:bold; font-family:monospace;";
            
            let inner = link 
                ? `<a href="${link.path}" class="internal-link" style="${contentStyle} color:${isDone?'#000':'#fff'};">${short}</a>`
                : `<div style="${contentStyle} color:rgba(255,255,255,0.2); cursor:default;">${short}</div>`;

            return `<div style="width:28px; height:28px; background:${bg}; border-radius:6px; box-shadow:${shadow}; display:flex; align-items:center; justify-content:center; font-size:0.65em;">${inner}</div>`;
        }).join("");
        
        return `<div style="margin-bottom:15px;">
            <div style="font-size:0.75em; color:${c.textSub}; margin-bottom:6px; border-bottom:1px solid ${c.border}; padding-bottom:2px;">${p}</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">${items}</div>
        </div>`;
    }).join("");

    // --- 3. 推荐卡片 (UI: Crystal) ---
    let nextHtml = "";
    if (next) {
        let link = linkMap[next.id] || linkMap[next.id.replace(/[A-Z]/g, "")];
        let prefix = recommendationType === "New" ? "🚀 继续学习" : "🔄 建议复习";
        
        let linkContent = link 
            ? `<a href="${link.path}" class="internal-link" style="color:${c.text}; font-weight:bold; text-decoration:none;">${prefix}: ${next.t}</a>`
            : `<span style="opacity:0.6">${prefix}: ${next.t}</span>`;
            
        nextHtml = `
        <div style="background:linear-gradient(90deg, ${c.demo}22, ${c.accent}22); border:1px solid ${c.demo}44; border-radius:10px; padding:12px 16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; backdrop-filter:blur(5px);">
            <div>${linkContent}</div>
            <div style="font-family:monospace; opacity:0.5; font-size:0.9em;">${next.id}</div>
        </div>`;
    }

    // --- 4. 最终渲染 ---
    const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard } });
    root.innerHTML = `
        <div style="font-weight:700; color:${c.text}; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
            <span style="color:${c.demo}">🗺️</span> 课程地图 (Course Matrix)
        </div>
        ${nextHtml}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">${gridHtml}</div>
    `;
}
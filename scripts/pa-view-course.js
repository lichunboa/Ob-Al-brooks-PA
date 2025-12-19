/* 文件名: Scripts/pa-view-course.js
   用途: 课程地图 (Course Matrix)
   状态: 100% 还原自控制台 2.0
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/Scripts/pa-config.js");

if (window.paData && window.paData.course) {
    const course = window.paData.course;
    const syllabus = course.syllabus || [];
    const doneSet = course.done;
    const linkMap = course.map;

    // 1. 智能推荐逻辑 (Engine 可能已经算过，这里再做一次 UI 层面的确认)
    let next = null;
    let recommendationType = "New";

    // 优先找没学过的
    for (let c of syllabus) {
        let simpleId = c.id.replace(/[A-Z]/g, "");
        if (!doneSet.has(c.id) && !doneSet.has(simpleId)) {
            next = c;
            break;
        }
    }
    // 如果都学完了，随机推荐一节 (二刷)
    if (!next && syllabus.length > 0) {
        let randomIndex = Math.floor(Math.random() * syllabus.length);
        next = syllabus[randomIndex];
        recommendationType = "Review";
    }

    // 2. 生成方块矩阵
    let gridHtml = "";
    // 提取所有章节 (Phase)
    const phases = [...new Set(syllabus.map(s => s.p))];

    phases.forEach(p => {
        let items = syllabus.filter(s => s.p === p);
        let dots = "";
        for (let c of items) {
            // 状态判断
            let isDone = doneSet.has(c.id) || doneSet.has(c.id.replace(/[A-Z]/g, ""));
            let linkObj = linkMap[c.id] || linkMap[c.id.replace(/[A-Z]/g, "")];
            
            // 颜色逻辑
            let color = isDone ? cfg.colors.live : (linkObj ? cfg.colors.demo : "rgba(255,255,255,0.1)");
            
            // 缩写逻辑 (01->1, Bonus01->B1)
            let shortId = c.id.replace(/^0/, "");
            if (shortId.toLowerCase().includes("bonus")) shortId = "B" + shortId.replace(/[^0-9]/g, "");

            let contentStyle = "display:flex; width:100%; height:100%; align-items:center; justify-content:center; text-decoration:none; font-size:0.6em; font-weight:bold; letter-spacing:-0.5px;";
            let content = `<div style="${contentStyle} color:rgba(255,255,255,0.3);">${shortId}</div>`;
            
            if (linkObj) {
                // 如果有笔记链接
                content = `<a href="${linkObj.path}" class="internal-link" style="${contentStyle} color:${isDone ? '#000' : '#fff'};">${shortId}</a>`;
            }

            dots += `<div style="width:26px; height:26px; background:${color}; border-radius:5px; flex-shrink:0;" title="${c.id}: ${c.t}">${content}</div>`;
        }
        
        gridHtml += `
        <div style="margin-bottom:12px;">
            <div style="font-size:0.75em; opacity:0.6; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05);">${p}</div>
            <div style="display:flex; flex-wrap:wrap; gap:5px;">${dots}</div>
        </div>`;
    });

    // 3. 推荐卡片 UI
    let nextHtml = "";
    if (next) {
        let linkObj = linkMap[next.id] || linkMap[next.id.replace(/[A-Z]/g, "")];
        let prefix = recommendationType === "New" ? "🚀 继续学习" : "🔄 建议复习";
        let linkStr = linkObj 
            ? `<a href="${linkObj.path}" class="internal-link" style="color:white; font-weight:bold; text-decoration:none;">${prefix}: ${next.t}</a>`
            : `<span style="opacity:0.6">${prefix}: ${next.t} (笔记未创建)</span>`;

        nextHtml = `
        <div style="background:rgba(59, 130, 246, 0.15); border:1px solid ${cfg.colors.demo}; border-radius:8px; padding:12px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            <div>${linkStr}</div>
            <div style="font-size:0.9em; opacity:0.8; font-family:monospace;">${next.id}</div>
        </div>`;
    }

    // 4. 渲染容器
    const root = dv.el("div", "", { attr: { style: cfg.colors.cardBg } });
    root.innerHTML = `
    <div style="font-weight:700; opacity:0.7; margin-bottom:10px;">🗺️ 课程地图 (Course Matrix)</div>
    ${nextHtml}
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
        ${gridHtml}
    </div>
    `;
} else {
    dv.paragraph("⚠️ 课程数据未加载，请检查 Engine 或 PA_Syllabus_Data.md");
}
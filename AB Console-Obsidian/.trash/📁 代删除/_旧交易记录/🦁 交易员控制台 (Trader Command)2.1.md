```dataviewjs
// 加载引擎
await dv.view("Scripts/pa-core");
// 加载记忆库 UI
await dv.view("Scripts/pa-view-memory");
// 2. 导出数据按钮 (优化版: 按需导出)
const btnExport = dv.el("button", "📥 导出 JSON (App)", { attr: { style: "margin-bottom: 20px;"} });
btnExport.onclick = async () => {
    const exportData = JSON.stringify(window.paData, null, 2);
    await app.vault.adapter.write("pa-db-export.json", exportData);
    new Notice("✅ 数据已导出到根目录: pa-db-export.json");
};
```


> [!COLUMN|2]
> 
> > [!success] 🧠 知识与记忆 (Fusion Input)
> >```dataviewjs
> >// === 模块: 🧠 记忆库 (UI V14.3 Smooth) ===
> >const cfg = {
> >    card: "background:rgba(30,30,30,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:18px; margin-bottom:20px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); animation: fadein 0.5s;",
> >    purple: "#8B5CF6", blue: "#3B82F6", green: "#10B981", red: "#EF4444", orange: "#F59E0B",
> >    tagBg: "rgba(255,255,255,0.05)", tagBorder: "1px solid rgba(255,255,255,0.1)"
> >};
> >
> >// 添加简单的淡入动画样式
> >const style = document.createElement('style');
> >style.innerHTML = `@keyframes fadein { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }`;
> >document.head.appendChild(style);
> >
> >if (window.paData && window.paData.sr) {
> >    const sr = window.paData.sr;
> >    const course = window.paData.course;
> >
> >    let masteryColor = sr.score < 80 ? (sr.score < 60 ? cfg.red : cfg.orange) : cfg.green;
> >    const pTotal = Math.max(sr.total, 1);
> >    const cnt = sr.cnt || { cloze:0, sNorm:0, sRev:0, mNorm:0, mRev:0 };
> >    
> >    // --- 来源数据 ---
> >    const safeFileList = sr.fileList || []; 
> >    const safeFolders = sr.folders || {};
> >    const topFolderNames = Object.entries(safeFolders).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
> >
> >    const folderHtml = topFolderNames.map(fName => {
> >        const filesInFolder = safeFileList
> >            .filter(f => f.folder === fName)
> >            .sort((a, b) => b.count - a.count)
> >            .slice(0, 5)
> >            .map(f => `
> >                <div style="display:flex; justify-content:space-between; font-size:0.85em; padding:4px 8px; border-top:1px solid rgba(255,255,255,0.03);">
> >                    <a href="${f.path}" class="internal-link" style="text-decoration:none; color:rgba(255,255,255,0.7); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;">
> >                        📄 ${f.name.replace('.md','')}
> >                    </a>
> >                    <span style="opacity:0.5;">${f.count}</span>
> >                </div>
> >            `).join("");
> >        return `<details style="background:${cfg.tagBg}; border:${cfg.tagBorder}; border-radius:6px; margin-bottom:6px; overflow:hidden; transition: all 0.2s;"><summary style="padding:6px 10px; cursor:pointer; font-size:0.75em; color:#ccc; outline:none; font-weight:bold; display:flex; justify-content:space-between; align-items:center;"><span>📂 ${fName}</span><span style="background:rgba(255,255,255,0.1); padding:0 6px; border-radius:10px; color:#fff; font-size:0.9em;">${safeFolders[fName]}</span></summary><div style="background:rgba(0,0,0,0.15); padding:4px 0;">${filesInFolder}</div></details>`;
> >    }).join("");
> >
> >    // --- 图表 ---
> >    const days = []; const loadCounts = [];
> >    for(let i=1; i<=7; i++) { let d = moment().add(i, 'days').format("YYYY-MM-DD"); days.push(`+${i}`); loadCounts.push(sr.load[d] || 0); }
> >    const maxLoad = Math.max(...loadCounts, 3);
> >    const chartHtml = loadCounts.map((val, i) => {
> >        let h = Math.max(4, (val / maxLoad) * 40); if (h > 40) h = 40;
> >        let color = val > 0 ? cfg.blue : "rgba(255,255,255,0.1)";
> >        return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:3px;"><div style="width:8px; height:${h}px; background:${color}; border-radius:2px; opacity:${val>0?1:0.3}"></div><div style="font-size:0.5em; opacity:0.3;">${days[i]}</div></div>`;
> >    }).join("");
> >
> >    // --- 推荐逻辑 ---
> >    let recHtml = "";
> >    if (sr.due > 0 && sr.focusFile) {
> >        let f = sr.focusFile;
> >        let easeColor = f.avgEase < 230 ? cfg.red : cfg.green;
> >        recHtml = `
> >        <div style="font-size:0.65em; color:${cfg.red}; margin-bottom:4px; font-weight:bold; opacity:0.9;">🔥 FOCUS REVIEW</div>
> >        <a href="${f.path}" class="internal-link" style="text-decoration:none; color:#fff; font-size:0.9em; font-weight:bold; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${f.name.replace('.md','')}</a>
> >        <div style="font-size:0.7em; margin-top:4px; display:flex; justify-content:space-between; opacity:0.8;"><span>Due: <b style="color:${cfg.red}">${f.due}</b></span><span style="color:${easeColor}">Ease: ${f.avgEase}</span></div>`;
> >    } else {
> >        let rec = course.hybridRec; 
> >        if (rec) {
> >            if (rec.type === "New") {
> >                let item = rec.data;
> >                recHtml = `
> >                <div style="font-size:0.65em; color:${cfg.blue}; margin-bottom:4px; font-weight:bold; opacity:0.8;">🚀 NEXT: NEW TOPIC</div>
> >                <div style="color:#fff; font-size:0.9em; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.t}">${item.id} ${item.t}</div>
> >                <div style="font-size:0.7em; opacity:0.5; margin-top:2px;">(来自课程大纲)</div>`;
> >            } else if (rec.type === "Quiz") {
> >                let q = rec.data;
> >                recHtml = `
> >                <div style="font-size:0.65em; color:${cfg.orange}; margin-bottom:6px; font-weight:bold; letter-spacing:0.5px;">🎲 DAILY QUIZ</div>
> >                <div style="background:rgba(255,255,255,0.05); border-left:3px solid ${cfg.orange}; padding:8px; border-radius:4px; margin-bottom:8px;">
> >                    <div style="font-size:0.9em; font-style:italic; opacity:0.9; margin-bottom:4px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">"${q.q}"</div>
> >                    <div style="font-size:0.7em; opacity:0.5; text-align:right;">— ${q.file.replace('.md','')}</div>
> >                </div>
> >                <a href="${q.path}" class="internal-link" style="display:block; text-align:center; background:rgba(245, 158, 11, 0.2); color:${cfg.orange}; padding:4px; border-radius:4px; text-decoration:none; font-size:0.75em; font-weight:bold;">👉 去复习</a>`;
> >            }
> >        } else {
> >            recHtml = `<div style="font-size:0.8em; opacity:0.5;">暂无推荐内容</div>`;
> >        }
> >    }
> >
> >    const cmdId = "obsidian-spaced-repetition:srs-review-flashcards";
> >    const root = dv.el("div", "", { attr: { style: cfg.card } });
> >
> >    root.innerHTML = `
> >    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
> >        <div style="display:flex; align-items:center; gap:10px;"><div style="font-weight:800; color:${cfg.purple}; font-size:1.1em;">🧠 记忆库 <span style="font-size:0.7em; color:rgba(255,255,255,0.4); font-weight:normal;">(Total: ${sr.total})</span></div><div style="font-size:0.75em; background:${sr.status.includes('积压')?cfg.red:cfg.green}; color:#000; padding:2px 8px; border-radius:4px; font-weight:bold;">${sr.status.split(' ')[1] || sr.status}</div></div>
> >        <div style="text-align:right;"><div style="font-size:0.7em; opacity:0.6; text-transform:uppercase; letter-spacing:1px;">Due Today</div><div style="font-size:1.4em; font-weight:800; color:${sr.due>0?cfg.red:'#fff'}; line-height:1.1;">${sr.due}</div></div>
> >    </div>
> >    <div style="display:flex; height:6px; width:100%; border-radius:3px; overflow:hidden; margin-bottom:15px; background:rgba(255,255,255,0.05);">
> >        <div style="width:${(sr.cnt.sNorm/pTotal)*100}%; background:${cfg.blue}; opacity:0.8;"></div>
> >        <div style="width:${(sr.cnt.sRev*2/pTotal)*100}%; background:${cfg.blue};"></div>
> >        <div style="width:${(sr.cnt.mNorm/pTotal)*100}%; background:${cfg.green}; opacity:0.8;"></div>
> >        <div style="width:${(sr.cnt.mRev*2/pTotal)*100}%; background:${cfg.green};"></div>
> >        <div style="width:${(sr.cnt.cloze/pTotal)*100}%; background:${cfg.purple};"></div>
> >    </div>
> >    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:1px; background:rgba(255,255,255,0.05); border-radius:8px; overflow:hidden; margin-bottom:15px;">
> >        <div style="background:rgba(30,30,30,0.4); padding:8px; text-align:center;"><div style="color:${cfg.blue}; font-size:0.75em; font-weight:bold;">单行</div><div style="font-size:1.1em; font-weight:bold; color:#fff;">${sr.cnt.sNorm + sr.cnt.sRev*2}</div><div style="font-size:0.6em; opacity:0.5;">(含互换: ${sr.cnt.sRev})</div></div>
> >        <div style="background:rgba(30,30,30,0.4); padding:8px; text-align:center;"><div style="color:${cfg.green}; font-size:0.75em; font-weight:bold;">多行</div><div style="font-size:1.1em; font-weight:bold; color:#fff;">${sr.cnt.mNorm + sr.cnt.mRev*2}</div><div style="font-size:0.6em; opacity:0.5;">(含互换: ${sr.cnt.mRev})</div></div>
> >        <div style="background:rgba(30,30,30,0.4); padding:8px; text-align:center; position:relative;"><div style="color:${cfg.purple}; font-size:0.75em; font-weight:bold;">填空</div><div style="font-size:1.1em; font-weight:bold; color:#fff;">${sr.cnt.cloze}</div><div style="position:absolute; top:4px; right:4px; font-size:0.6em; color:${masteryColor};">${sr.score}%</div></div>
> >    </div>
> >    <div style="display:grid; grid-template-columns: 1fr 1.3fr; gap:10px; margin-bottom:15px;">
> >        <div style="background:rgba(0,0,0,0.2); border-radius:8px; padding:10px 5px 5px 5px; display:flex; align-items:flex-end;"><div style="display:flex; align-items:flex-end; height:45px; width:100%; justify-content:space-around;">${chartHtml}</div></div>
> >        <div style="background:${sr.due>0 ? 'rgba(239,68,68,0.1)' : (recHtml.includes('QUIZ')?'rgba(245,158,11,0.1)':'rgba(59,130,246,0.1)')}; border:1px solid ${sr.due>0 ? 'rgba(239,68,68,0.2)' : (recHtml.includes('QUIZ')?'rgba(245,158,11,0.2)':'rgba(59,130,246,0.2)')}; border-radius:8px; padding:10px; display:flex; flex-direction:column; justify-content:center;">${recHtml}</div>
> >    </div>
> >    ${(folderHtml) ? `<div style="margin-bottom:15px;">${folderHtml}</div>` : ''}
> >    <button onclick="app.commands.executeCommandById('${cmdId}')" style="width:100%; background:linear-gradient(to right, ${cfg.purple}, #7C3AED); color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:0.9em; box-shadow: 0 2px 6px rgba(139, 92, 246, 0.3);">⚡️ 开始复习 (Start Review)</button>
> >    `;
> >} else {
> >    dv.el("div", "🦁 Engine Loading...", { attr: { style: "opacity:0.5; font-size:0.8em; padding:10px; text-align:center;" } });
> >}
> >```
> >```dataviewjs
> >// === 模块: 🗺️ 课程矩阵 (Large & Smart) ===
> >const cfg = { 
> >    blue: "#3B82F6", green: "#10B981", 
> >    empty: "rgba(255,255,255,0.1)", 
> >    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; margin-bottom:20px;" 
> >};
> >
> >// 1. 读取大纲
> >let syllabus = [];
> >const file = app.vault.getFiles().find(f => f.name === "PA_Syllabus_Data.md");
> >if (file) {
> >    const content = await app.vault.read(file);
> >    const start = content.indexOf("[");
> >    const end = content.lastIndexOf("]");
> >    if (start !== -1 && end !== -1) {
> >        try { syllabus = JSON.parse(content.substring(start, end + 1)); } catch (e) {}
> >    }
> >}
> >
> >// 2. 进度匹配
> >const studiedMap = new Set();
> >const noteLinkMap = new Map();
> >const notes = dv.pages("#PA/Course").where(p => p.module_id);
> >for (let p of notes) {
> >    let ids = Array.isArray(p.module_id) ? p.module_id : [p.module_id];
> >    for (let rawId of ids) {
> >        if(!rawId) continue;
> >        let idStr = rawId.toString();
> >        noteLinkMap.set(idStr, p.file.link);
> >        if (p.studied) {
> >            studiedMap.add(idStr);
> >            studiedMap.add(idStr.replace(/[A-Z]/g, "")); 
> >        }
> >    }
> >}
> >
> >// 3. 智能推荐逻辑
> >let next = null; 
> >let recommendationType = "New"; // New or Review
> >
> >// 优先找没学过的
> >for (let c of syllabus) {
> >    let simpleId = c.id.replace(/[A-Z]/g, "");
> >    if (!studiedMap.has(c.id) && !studiedMap.has(simpleId)) {
> >        next = c;
> >        break;
> >    }
> >}
> >
> >// 如果都学完了，随机推荐一节进行复习 (二刷逻辑)
> >if (!next && syllabus.length > 0) {
> >    let randomIndex = Math.floor(Math.random() * syllabus.length);
> >    next = syllabus[randomIndex];
> >    recommendationType = "Review";
> >}
> >
> >// 4. 生成方块矩阵 (加大版)
> >let gridHtml = "";
> >const phases = [...new Set(syllabus.map(s => s.p))];
> >
> >phases.forEach(p => {
> >    let items = syllabus.filter(s => s.p === p);
> >    let dots = "";
> >    for (let c of items) {
> >        let isDone = studiedMap.has(c.id) || studiedMap.has(c.id.replace(/[A-Z]/g,""));
> >        let linkObj = noteLinkMap.get(c.id) || noteLinkMap.get(c.id.replace(/[A-Z]/g,""));
> >        let color = isDone ? cfg.green : (linkObj ? cfg.blue : cfg.empty);
> >        
> >        // 🔧 修复逻辑：智能缩写
> >        let shortId = c.id.replace(/^0/, ""); // 去掉开头的0 (01 -> 1)
> >        if (shortId.toLowerCase().includes("bonus")) {
> >            shortId = "B" + shortId.replace(/[^0-9]/g, ""); // Bonus01 -> B1
> >        }
> >        
> >        let contentStyle = "display:flex; width:100%; height:100%; align-items:center; justify-content:center; text-decoration:none; font-size:0.6em; font-weight:bold; letter-spacing:-0.5px;";
> >        
> >        let content = `<div style="${contentStyle} color:rgba(255,255,255,0.3);">${shortId}</div>`;
> >        if (linkObj) content = `<a href="${linkObj.path}" class="internal-link" style="${contentStyle} color:${isDone?'#000':'#fff'};">${shortId}</a>`;
> >        
> >        // 增加 title 提示完整名称
> >        dots += `<div style="width:26px; height:26px; background:${color}; border-radius:5px; flex-shrink:0;" title="${c.id}: ${c.t}">${content}</div>`;
> >    }
> >    gridHtml += `
> >    <div style="margin-bottom:12px;">
> >        <div style="font-size:0.75em; opacity:0.6; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05);">${p}</div>
> >        <div style="display:flex; flex-wrap:wrap; gap:5px;">${dots}</div>
> >    </div>`;
> >});
> >
> >// 5. 推荐卡片
> >let nextHtml = "";
> >if (next) {
> >    let linkObj = noteLinkMap.get(next.id) || noteLinkMap.get(next.id.replace(/[A-Z]/g,""));
> >    let prefix = recommendationType === "New" ? "🚀 继续学习" : "🔄 建议复习";
> >    let linkStr = linkObj ? `<a href="${linkObj.path}" class="internal-link" style="color:white; font-weight:bold; text-decoration:none;">${prefix}: ${next.t}</a>` : `<span style="opacity:0.6">${prefix}: ${next.t} (笔记未创建)</span>`;
> >    
> >    nextHtml = `
> >    <div style="background:rgba(59, 130, 246, 0.15); border:1px solid ${cfg.blue}; border-radius:8px; padding:12px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
> >        <div>${linkStr}</div>
> >        <div style="font-size:0.9em; opacity:0.8; font-family:monospace;">${next.id}</div>
> >    </div>`;
> >}
> >
> >const root = dv.el("div", "", { attr: { style: cfg.card } });
> >root.innerHTML = `
> ><div style="font-weight:700; opacity:0.7; margin-bottom:10px;">🗺️ 课程地图 (Course Matrix)</div>
> >${nextHtml}
> ><div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
> >    ${gridHtml}
> ></div>
> >`;
> >```
> 
> > [!info] 📊 账户全景 (Fusion Output)
> > ```dataviewjs
> >// === 模块: ⚔️ 账户全景 (Trinity Command) ===
> >const cfg = {
> >    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:0; overflow:hidden; display:flex; margin-bottom:20px;",
> >    green: "#10B981", blue: "#3B82F6", orange: "#F59E0B"
> >};
> >
> >// 获取数据
> >const pages = dv.pages("#PA/Trade").where(p => !p.file.path.includes("Templates"));
> >
> >function getStats(type) {
> >    let subset = pages.where(p => {
> >        let acct = (p["账户类型/account_type"] || "").toString();
> >        if(type === "Live") return acct.includes("Live") || acct.includes("实盘");
> >        if(type === "Demo") return acct.includes("Demo") || acct.includes("模拟");
> >        if(type === "Back") return acct.includes("Back") || acct.includes("回测");
> >        return false;
> >    });
> >    let wins = 0, total = 0, pnl = 0;
> >    for (let p of subset) {
> >        let outcome = (p["结果/outcome"] || "").toString().toLowerCase();
> >        let val = Number(p["净利润/net_profit"] || p["net_profit"] || 0);
> >        if (!outcome.includes("scratch") && !outcome.includes("be") && !outcome.includes("保本")) {
> >            total++;
> >            if (outcome.includes("win") || outcome.includes("止盈") || val > 0) wins++;
> >        }
> >        pnl += val;
> >    }
> >    let wr = total > 0 ? Math.round((wins/total)*100) : 0;
> >    return { pnl, wr, count: subset.length };
> >}
> >
> >const live = getStats("Live");
> >const demo = getStats("Demo");
> >const back = getStats("Back");
> >
> >// HTML 构造
> >const root = dv.el("div", "", { attr: { style: cfg.card } });
> >root.innerHTML = `
> ><div style="flex:2; padding:20px; background:linear-gradient(145deg, rgba(16,185,129,0.1), transparent); border-right:1px solid rgba(255,255,255,0.1);">
> >    <div style="display:flex; justify-content:space-between; align-items:center;">
> >        <div style="color:${cfg.green}; font-weight:800; font-size:1.1em;">🟢 LIVE ACCOUNT</div>
> >        <div style="font-size:0.8em; opacity:0.5;">${live.count} Trades</div>
> >    </div>
> >    <div style="margin-top:15px;">
> >        <div style="font-size:2.5em; font-weight:900; color:${live.pnl>=0?cfg.green:'#EF4444'}">${live.pnl>0?'+':''}${live.pnl}<span style="font-size:0.5em; opacity:0.5">$</span></div>
> >        <div style="display:flex; gap:15px; margin-top:5px; font-size:0.9em; opacity:0.8;">
> >            <div>Win Rate: <b>${live.wr}%</b></div>
> >        </div>
> >    </div>
> ></div>
> >
> ><div style="flex:1; display:flex; flex-direction:column;">
> >    <div style="flex:1; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
> >        <div>
> >            <div style="color:${cfg.blue}; font-weight:bold; font-size:0.9em;">🔵 Demo</div>
> >            <div style="font-size:0.7em; opacity:0.5;">${demo.count} Trades</div>
> >        </div>
> >        <div style="text-align:right;">
> >            <div style="font-weight:bold;">${demo.pnl>0?'+':''}${demo.pnl}$</div>
> >            <div style="font-size:0.7em; opacity:0.6;">${demo.wr}% WR</div>
> >        </div>
> >    </div>
> >    <div style="flex:1; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
> >        <div>
> >            <div style="color:${cfg.orange}; font-weight:bold; font-size:0.9em;">🟠 Backtest</div>
> >            <div style="font-size:0.7em; opacity:0.5;">${back.count} Trades</div>
> >        </div>
> >        <div style="text-align:right;">
> >            <div style="font-weight:bold;">${back.pnl>0?'+':''}${back.pnl}$</div>
> >            <div style="font-size:0.7em; opacity:0.6;">${back.wr}% WR</div>
> >        </div>
> >    </div>
> ></div>
> >`;
> > ```
> > ```dataviewjs
> > // === 模块: 📅 迷你热力图 (Compact Heatmap) ===
> >const cfg = {
> >    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; margin-bottom:20px;",
> >    green: "#10B981", red: "#EF4444", empty: "rgba(255,255,255,0.05)"
> >};
> >
> >const today = new Date();
> >const year = today.getFullYear();
> >const month = today.getMonth();
> >const daysInMonth = new Date(year, month + 1, 0).getDate();
> >
> >// 只获取实盘
> >const trades = dv.pages("#PA/Trade").where(p => {
> >    let d = new Date(p.date || p.file.day);
> >    let acct = (p["账户类型/account_type"] || "").toString();
> >    return d.getMonth() === month && (acct.includes("Live") || acct.includes("实盘"));
> >});
> >
> >let dailyMap = {};
> >for (let t of trades) {
> >    let day = new Date(t.date || t.file.day).getDate();
> >    let pnl = Number(t["净利润/net_profit"] || t["net_profit"] || 0);
> >    if (!dailyMap[day]) dailyMap[day] = 0;
> >    dailyMap[day] += pnl;
> >}
> >
> >// 渲染网格 (Flexbox 自动换行，不强制 7列，适应宽度)
> >let grid = "";
> >for (let d = 1; d <= daysInMonth; d++) {
> >    let pnl = dailyMap[d];
> >    let bg = cfg.empty;
> >    let txt = `<div style="font-size:0.6em; opacity:0.3;">${d}</div>`;
> >    
> >    if (pnl !== undefined) {
> >        bg = pnl > 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)";
> >        let color = pnl > 0 ? cfg.green : cfg.red;
> >        txt = `
> >        <div style="font-size:0.6em; opacity:0.5;">${d}</div>
> >        <div style="font-size:0.7em; font-weight:bold; color:${color};">${pnl}</div>`;
> >    }
> >    
> >    grid += `<div style="width:32px; height:32px; background:${bg}; border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.05);">${txt}</div>`;
> >}
> >
> >const root = dv.el("div", "", { attr: { style: cfg.card } });
> >root.innerHTML = `
> ><div style="font-weight:700; opacity:0.7; margin-bottom:10px;">📅 本月实盘 (This Month)</div>
> ><div style="display:flex; flex-wrap:wrap; gap:4px;">${grid}</div>
> >`;
> > ```
> 
> > [!info] 📊 账户全景 (Fusion Output)
> > ```dataviewjs
> >// === 模块: ⚔️ 账户全景 (Trinity Command) ===
> >const cfg = {
> >    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:0; overflow:hidden; display:flex; margin-bottom:20px;",
> >    green: "#10B981", blue: "#3B82F6", orange: "#F59E0B"
> >};
> >
> >// 获取数据
> >const pages = dv.pages("#PA/Trade").where(p => !p.file.path.includes("Templates"));
> >
> >function getStats(type) {
> >    let subset = pages.where(p => {
> >        let acct = (p["账户类型/account_type"] || "").toString();
> >        if(type === "Live") return acct.includes("Live") || acct.includes("实盘");
> >        if(type === "Demo") return acct.includes("Demo") || acct.includes("模拟");
> >        if(type === "Back") return acct.includes("Back") || acct.includes("回测");
> >        return false;
> >    });
> >    let wins = 0, total = 0, pnl = 0;
> >    for (let p of subset) {
> >        let outcome = (p["结果/outcome"] || "").toString().toLowerCase();
> >        let val = Number(p["净利润/net_profit"] || p["net_profit"] || 0);
> >        if (!outcome.includes("scratch") && !outcome.includes("be") && !outcome.includes("保本")) {
> >            total++;
> >            if (outcome.includes("win") || outcome.includes("止盈") || val > 0) wins++;
> >        }
> >        pnl += val;
> >    }
> >    let wr = total > 0 ? Math.round((wins/total)*100) : 0;
> >    return { pnl, wr, count: subset.length };
> >}
> >
> >const live = getStats("Live");
> >const demo = getStats("Demo");
> >const back = getStats("Back");
> >
> >// HTML 构造
> >const root = dv.el("div", "", { attr: { style: cfg.card } });
> >root.innerHTML = `
> ><div style="flex:2; padding:20px; background:linear-gradient(145deg, rgba(16,185,129,0.1), transparent); border-right:1px solid rgba(255,255,255,0.1);">
> >    <div style="display:flex; justify-content:space-between; align-items:center;">
> >        <div style="color:${cfg.green}; font-weight:800; font-size:1.1em;">🟢 LIVE ACCOUNT</div>
> >        <div style="font-size:0.8em; opacity:0.5;">${live.count} Trades</div>
> >    </div>
> >    <div style="margin-top:15px;">
> >        <div style="font-size:2.5em; font-weight:900; color:${live.pnl>=0?cfg.green:'#EF4444'}">${live.pnl>0?'+':''}${live.pnl}<span style="font-size:0.5em; opacity:0.5">$</span></div>
> >        <div style="display:flex; gap:15px; margin-top:5px; font-size:0.9em; opacity:0.8;">
> >            <div>Win Rate: <b>${live.wr}%</b></div>
> >        </div>
> >    </div>
> ></div>
> >
> ><div style="flex:1; display:flex; flex-direction:column;">
> >    <div style="flex:1; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
> >        <div>
> >            <div style="color:${cfg.blue}; font-weight:bold; font-size:0.9em;">🔵 Demo</div>
> >            <div style="font-size:0.7em; opacity:0.5;">${demo.count} Trades</div>
> >        </div>
> >        <div style="text-align:right;">
> >            <div style="font-weight:bold;">${demo.pnl>0?'+':''}${demo.pnl}$</div>
> >            <div style="font-size:0.7em; opacity:0.6;">${demo.wr}% WR</div>
> >        </div>
> >    </div>
> >    <div style="flex:1; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
> >        <div>
> >            <div style="color:${cfg.orange}; font-weight:bold; font-size:0.9em;">🟠 Backtest</div>
> >            <div style="font-size:0.7em; opacity:0.5;">${back.count} Trades</div>
> >        </div>
> >        <div style="text-align:right;">
> >            <div style="font-weight:bold;">${back.pnl>0?'+':''}${back.pnl}$</div>
> >            <div style="font-size:0.7em; opacity:0.6;">${back.wr}% WR</div>
> >        </div>
> >    </div>
> ></div>
> >`;
> > ```
> > ```dataviewjs
> > // === 模块: 📅 迷你热力图 (Compact Heatmap) ===
> >const cfg = {
> >    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; margin-bottom:20px;",
> >    green: "#10B981", red: "#EF4444", empty: "rgba(255,255,255,0.05)"
> >};
> >
> >const today = new Date();
> >const year = today.getFullYear();
> >const month = today.getMonth();
> >const daysInMonth = new Date(year, month + 1, 0).getDate();
> >
> >// 只获取实盘
> >const trades = dv.pages("#PA/Trade").where(p => {
> >    let d = new Date(p.date || p.file.day);
> >    let acct = (p["账户类型/account_type"] || "").toString();
> >    return d.getMonth() === month && (acct.includes("Live") || acct.includes("实盘"));
> >});
> >
> >let dailyMap = {};
> >for (let t of trades) {
> >    let day = new Date(t.date || t.file.day).getDate();
> >    let pnl = Number(t["净利润/net_profit"] || t["net_profit"] || 0);
> >    if (!dailyMap[day]) dailyMap[day] = 0;
> >    dailyMap[day] += pnl;
> >}
> >
> >// 渲染网格 (Flexbox 自动换行，不强制 7列，适应宽度)
> >let grid = "";
> >for (let d = 1; d <= daysInMonth; d++) {
> >    let pnl = dailyMap[d];
> >    let bg = cfg.empty;
> >    let txt = `<div style="font-size:0.6em; opacity:0.3;">${d}</div>`;
> >    
> >    if (pnl !== undefined) {
> >        bg = pnl > 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)";
> >        let color = pnl > 0 ? cfg.green : cfg.red;
> >        txt = `
> >        <div style="font-size:0.6em; opacity:0.5;">${d}</div>
> >        <div style="font-size:0.7em; font-weight:bold; color:${color};">${pnl}</div>`;
> >    }
> >    
> >    grid += `<div style="width:32px; height:32px; background:${bg}; border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.05);">${txt}</div>`;
> >}
> >
> >const root = dv.el("div", "", { attr: { style: cfg.card } });
> >root.innerHTML = `
> ><div style="font-weight:700; opacity:0.7; margin-bottom:10px;">📅 本月实盘 (This Month)</div>
> ><div style="display:flex; flex-wrap:wrap; gap:4px;">${grid}</div>
> >`;
> > ```


---

> [!COLUMN|2]
> 
> >[!abstract] 📉 策略实验室 (Common Lab)
> >```dataviewjs
> >// === 模块: 🧬 综合策略实验室 (Trinity Lab) ===
> >const cfg = { 
> >    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:20px; margin-bottom:20px;",
> >    live: "#10B981", demo: "#3B82F6", back: "#F59E0B", gray: "#444"
> >};
> >
> >const pages = dv.pages("#PA/Trade").where(p => !p.file.path.includes("Templates"));
> >const sortedTrades = pages.sort(p => p.date || p.file.day, "asc");
> >
> >// --- 1. 数据清洗与分离 ---
> >let curves = { live: [0], demo: [0], back: [0] }; // 起始点为0
> >let cum = { live: 0, demo: 0, back: 0 };
> >
> >for (let t of sortedTrades) {
> >    // 兼容多种 Key 写法
> >    let pnl = Number(t["净利润/net_profit"] || t["net_profit"] || t["profit"] || 0);
> >    let acct = (t["账户类型/account_type"] || t["account_type"] || "").toString().toLowerCase();
> >    
> >    if (acct.includes("live") || acct.includes("实盘")) {
> >        cum.live += pnl; curves.live.push(cum.live);
> >    } else if (acct.includes("demo") || acct.includes("模拟")) {
> >        cum.demo += pnl; curves.demo.push(cum.demo);
> >    } else if (acct.includes("back") || acct.includes("回测")) {
> >        cum.back += pnl; curves.back.push(cum.back);
> >    }
> >}
> >
> >// --- 2. 绘制资金曲线 (SVG) ---
> >const width = 400, height = 150;
> >const allValues = [...curves.live, ...curves.demo, ...curves.back];
> >const maxVal = Math.max(...allValues, 100); // 避免由0导致的错误
> >const minVal = Math.min(...allValues, -100);
> >const range = maxVal - minVal;
> >
> >function getPoints(data) {
> >    if (data.length < 2) return "";
> >    return data.map((val, i) => {
> >        let x = (i / (data.length - 1)) * width;
> >        let y = height - ((val - minVal) / range) * height;
> >        return `${x},${y}`;
> >    }).join(" ");
> >}
> >
> >const ptsLive = getPoints(curves.live);
> >const ptsDemo = getPoints(curves.demo);
> >const ptsBack = getPoints(curves.back);
> >const zeroY = height - ((0 - minVal) / range) * height;
> >
> >// --- 3. 策略表现分布 ---
> >let stratStats = {};
> >for (let p of pages) {
> >    let setup = (p["设置类别/setup_category"] || "Unknown").toString().split("(")[0].trim();
> >    if (!stratStats[setup]) stratStats[setup] = { win: 0, total: 0 };
> >    let res = (p["结果/outcome"] || "").toString();
> >    stratStats[setup].total++;
> >    if (res.includes("Win") || res.includes("止盈")) stratStats[setup].win++;
> >}
> >// 排序取前5
> >let topStrats = Object.keys(stratStats)
> >    .map(k => ({ name: k, ...stratStats[k], wr: Math.round(stratStats[k].win/stratStats[k].total*100) }))
> >    .sort((a,b) => b.total - a.total).slice(0, 5);
> >
> >// --- 渲染 ---
> >const root = dv.el("div", "", { attr: { style: cfg.card } });
> >
> >root.innerHTML = `
> ><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
> >    <div style="font-weight:700; font-size:1.1em;">🧬 资金增长曲线 (Capital Growth)</div>
> >    <div style="font-size:0.8em; display:flex; gap:12px;">
> >        <span style="color:${cfg.live}">● 实盘 $${cum.live}</span>
> >        <span style="color:${cfg.demo}">● 模拟 $${cum.demo}</span>
> >        <span style="color:${cfg.back}">● 回测 $${cum.back}</span>
> >    </div>
> ></div>
> >
> ><svg viewBox="0 0 ${width} ${height}" style="width:100%; height:150px; background:rgba(0,0,0,0.2); border-radius:8px; overflow:visible;">
> >    <line x1="0" y1="${zeroY}" x2="${width}" y2="${zeroY}" stroke="rgba(255,255,255,0.1)" stroke-dasharray="4" />
> >    
> >    <polyline points="${ptsBack}" fill="none" stroke="${cfg.back}" stroke-width="1.5" opacity="0.6" stroke-dasharray="2" />
> >    <polyline points="${ptsDemo}" fill="none" stroke="${cfg.demo}" stroke-width="1.5" opacity="0.8" />
> >    <polyline points="${ptsLive}" fill="none" stroke="${cfg.live}" stroke-width="2.5" />
> >    
> >    ${curves.live.length > 1 ? `<circle cx="${ptsLive.split(' ').pop().split(',')[0]}" cy="${ptsLive.split(' ').pop().split(',')[1]}" r="3" fill="${cfg.live}" />` : ''}
> ></svg>
> >
> ><div style="margin-top:20px; display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
> >    <div>
> >        <div style="font-size:0.8em; opacity:0.6; margin-bottom:8px;">📊 热门策略表现 (Top Setups)</div>
> >        <div style="display:flex; flex-direction:column; gap:6px;">
> >            ${topStrats.map(s => `
> >                <div style="display:flex; justify-content:space-between; font-size:0.85em; background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:4px;">
> >                    <span>${s.name}</span>
> >                    <span><span style="color:${s.wr>50?cfg.live:cfg.back}">${s.wr}%</span> <span style="opacity:0.4">(${s.total})</span></span>
> >                </div>
> >            `).join("")}
> >        </div>
> >    </div>
> >    <div>
> >         <div style="font-size:0.8em; opacity:0.6; margin-bottom:8px;">💡 系统建议</div>
> >         <div style="font-size:0.8em; opacity:0.8; line-height:1.5;">
> >            当前表现最好的策略是 <b>${topStrats[0]?.name || "无"}</b>。<br>
> >            建议在 <b>${cum.live < 0 ? '回测' : '实盘'}</b> 中继续保持。
> >         </div>
> >    </div>
> ></div>
> >`;
> >```
> >```dataviewjs
> >// === 模块: 📘 策略匹配引擎 (Configurable & Chinese) ===
> >const cfg = {
> >    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; margin-bottom:20px;",
> >    blue: "#3B82F6"
> >};
> >
> >// ⚙️ 配置：请确保这个文件夹名称和你库里的一样
> >const strategyFolder = "策略库Strategies"; 
> >
> >// 1. 获取策略库
> >const strategies = dv.pages(`"${strategyFolder}"`);
> >
> >// 2. 简单的分类展示
> >let html = "";
> >
> >// 关键词映射 (中英文兼容)
> >// 我们寻找笔记属性中包含这些关键词的笔记
> >let contextKeywords = {
> >    "多头趋势": ["Bull Trend", "多头", "Bull"],
> >    "空头趋势": ["Bear Trend", "空头", "Bear"],
> >    "交易区间": ["Trading Range", "区间", "Range"]
> >};
> >
> >Object.keys(contextKeywords).forEach(ctxName => {
> >    let keywords = contextKeywords[ctxName];
> >    
> >    let matches = strategies.where(p => {
> >        // 读取属性，支持中文key和英文key
> >        let val = (p["trend_context/趋势环境"] || p["trend_context"] || "").toString();
> >        // 只要属性值里包含任意一个关键词，就算匹配
> >        return keywords.some(k => val.includes(k));
> >    });
> >    
> >    if (matches.length > 0) {
> >        html += `<div style="margin-bottom:10px;">
> >            <div style="font-size:0.85em; opacity:0.7; font-weight:bold; margin-bottom:4px;">${ctxName}</div>
> >            <div style="display:flex; gap:6px; flex-wrap:wrap;">`;
> >        for (let s of matches) {
> >            html += `<a href="${s.file.path}" class="internal-link" style="background:rgba(59,130,246,0.15); color:${cfg.blue}; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:0.8em; border:1px solid rgba(59,130,246,0.3);">${s.file.name}</a>`;
> >        }
> >        html += `</div></div>`;
> >    }
> >});
> >
> >const root = dv.el("div", "", { attr: { style: cfg.card } });
> >root.innerHTML = `
> ><div style="font-weight:700; opacity:0.7; margin-bottom:12px;">📘 策略剧本 (Playbook)</div>
> >${html || `<div style='opacity:0.5; font-size:0.8em;'>暂无策略笔记。<br>1. 请确认文件夹名为: <b>${strategyFolder}</b><br>2. 笔记需包含属性 <b>trend_context/趋势环境</b></div>`}
> >`;
> >```
> >```dataviewjs
> >// === 模块: 📈 综合趋势与心态 (Multi-Trend & Mind) ===
> >const cfg = {
> >    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:14px; margin-bottom:20px;",
> >    green: "#10B981", blue: "#3B82F6", orange: "#F59E0B", red: "#EF4444"
> >};
> >// 1. 获取最近 30 笔交易 (包含所有账户)
> >const trades = dv.pages("#PA/Trade")
> >    .where(p => !p.file.path.includes("Templates"))
> >    .sort(p => p.date || p.file.day, "desc")
> >    .limit(30).array().reverse();
> >
> >// 2. 生成多色柱状图
> >let bars = "";
> >if (trades.length > 0) {
> >    // 找出最大值用于归一化高度
> >    let maxVal = Math.max(...trades.map(n => Math.abs(Number(n["实际R值/R_realized"]||n["R_realized"]||n["盈利点数/profit points"]||n["profit points/盈利点数"]||0)))); 
> >    if (maxVal === 0) maxVal = 1;
> >
> >    bars = `<div style="display:flex; align-items:flex-end; gap:4px; height:60px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">`;
> >    
> >    for (let n of trades) {
> >        let v = Number(n["实际R值/R_realized"]||n["R_realized"]||n["盈利点数/profit points"]||n["profit points/盈利点数"]||0);
> >        let h = Math.round((Math.abs(v) / maxVal) * 50); 
> >        if (h < 4) h = 4;
> >        
> >        // 颜色逻辑：先看账户类型，再看盈亏
> >        let acct = (n["账户类型/account_type"] || "").toString();
> >        let baseColor = cfg.green; // 默认
> >        if (acct.includes("Demo")) baseColor = cfg.blue;
> >        if (acct.includes("Back")) baseColor = cfg.orange;
> >        
> >        // 如果亏损，降低透明度或变红? 通常 R图亏损就是红色，赚钱用账户色
> >        let color = v >= 0 ? baseColor : cfg.red;
> >        
> >        let title = `${n.file.name}\n${acct}\nR: ${v}`;
> >        bars += `<div style="width:6px; height:${h}px; background:${color}; border-radius:2px; opacity:${v>=0?1:0.6};" title="${title}"></div>`;
> >    }
> >    bars += `</div>`;
> >} else {
> >    bars = `<div style="opacity:0.5; font-size:0.8em;">暂无交易数据</div>`;
> >}
> >
> >// 3. 心态监控 (只看 Live)
> >const recentLive = trades.filter(p => (p["账户类型/account_type"]||"").toString().includes("Live"));
> >let tilt = 0, fomo = 0;
> >// 取最近 7 笔 Live 交易
> >for(let p of recentLive.slice(-7)) {
> >    let err = (p["管理错误/management_error"] || "").toString();
> >    if(err.includes("Tilt") || err.includes("上头")) tilt++;
> >    if(err.includes("FOMO") || err.includes("追单")) fomo++;
> >}
> >let mindStatus = (tilt+fomo) === 0 ? "🛡️ 状态极佳" : (tilt+fomo < 3 ? "⚠️ 有点起伏" : "🔥 极度危险");
> >let mindColor = (tilt+fomo) === 0 ? cfg.green : (tilt+fomo < 3 ? cfg.orange : cfg.red);
> >
> >const root = dv.el("div", "", { attr: { style: cfg.card + " display:flex; gap:20px;" } });
> >root.innerHTML = `
> ><div style="flex:2;">
> >    <div style="font-weight:700; opacity:0.7; margin-bottom:10px;">📈 综合趋势 (R-Multiples)</div>
> >    <div style="display:flex; gap:10px; font-size:0.6em; margin-bottom:4px; opacity:0.6;">
> >        <span style="color:${cfg.green}">● Live</span>
> >        <span style="color:${cfg.blue}">● Demo</span>
> >        <span style="color:${cfg.orange}">● Back</span>
> >    </div>
> >    ${bars}
> ></div>
> ><div style="flex:1; border-left:1px solid rgba(255,255,255,0.1); padding-left:20px; display:flex; flex-direction:column; justify-content:center;">
> >    <div style="font-weight:700; opacity:0.7; margin-bottom:5px;">🧠 实盘心态</div>
> >    <div style="font-size:1.4em; font-weight:800; color:${mindColor};">${mindStatus}</div>
> >    <div style="font-size:0.7em; opacity:0.6; margin-top:4px;">
> >        Recent Errors:<br>
> >        FOMO: ${fomo} | Tilt: ${tilt}
> >    </div>
> ></div>
> >`;
> >```
> >```dataviewjs
> >// === 模块: 市场周期盈亏矩阵 (Market Cycle PnL) ===
> >const cfg = { 
> >    card: "background:rgba(35,35,35,0.5); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; margin-bottom:20px;",
> >    green: "#10B981", red: "#EF4444", gray: "#444"
> >};
> >
> >const pages = dv.pages("#PA/Trade").where(p => !p.file.path.includes("Templates"));
> >let cycleStats = {};
> >
> >for (let p of pages) {
> >    // 获取实盘数据
> >    let acct = (p["账户类型/account_type"] || "").toString();
> >    if (!acct.includes("Live") && !acct.includes("实盘")) continue;
> >
> >    let cycleRaw = p["市场周期/market_cycle"] || p["market_cycle"] || "Unknown";
> >    let cycle = Array.isArray(cycleRaw) ? cycleRaw[0] : cycleRaw.toString();
> >    // 简化名称 (比如 "Strong Trend / 强趋势" -> "强趋势")
> >    if(cycle.includes("/")) cycle = cycle.split("/")[1].trim(); 
> >    else if(cycle.includes("(")) cycle = cycle.split("(")[0].trim();
> >
> >    if (!cycleStats[cycle]) cycleStats[cycle] = 0;
> >    let pnl = Number(p["净利润/net_profit"] || p["net_profit"] || 0);
> >    cycleStats[cycle] += pnl;
> >}
> >
> >let sortedCycles = Object.keys(cycleStats)
> >    .map(k => ({ name: k, pnl: cycleStats[k] }))
> >    .sort((a, b) => b.pnl - a.pnl);
> >
> >const root = dv.el("div", "", { attr: { style: cfg.card } });
> >root.innerHTML = `<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🌪️ 不同市场环境表现 (Live PnL)</div>`;
> >
> >let html = `<div style="display:flex; flex-wrap:wrap; gap:8px;">`;
> >for (let c of sortedCycles) {
> >    let color = c.pnl > 0 ? cfg.green : (c.pnl < 0 ? cfg.red : cfg.gray);
> >    let bg = c.pnl > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";
> >    let border = c.pnl > 0 ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)";
> >    
> >    html += `
> >    <div style="background:${bg}; border:${border}; border-radius:6px; padding:8px 12px; flex:1; min-width:100px; text-align:center;">
> >    <div style="font-size:0.8em; opacity:0.8; margin-bottom:4px;">${c.name}</div>
> >    <div style="font-weight:800; color:${color}; font-size:1.1em;">${c.pnl > 0 ? "+" : ""}${c.pnl}</div>
> >    </div>`;
> >}
> >html += `</div>`;
> >root.innerHTML += html;
> >```
> > ```dataviewjs
> > // === 模块: 错误的代价 (Tuition Fee Calculator) ===
> >const cfg = {
> >    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; margin-bottom:20px;",
> >    red: "#EF4444", yellow: "#F59E0B", green: "#10B981"
> >};
> >
> >// 1. 获取所有实盘交易
> >const trades = dv.pages("#PA/Trade")
> >    .where(p => {
> >        let acct = (p["账户类型/account_type"] || "").toString();
> >        return (acct.includes("Live") || acct.includes("实盘")) && !p.file.path.includes("Templates");
> >    });
> >
> >let errorStats = {};
> >let totalTuition = 0; // 总学费
> >
> >for (let t of trades) {
> >    // 获取错误标签
> >    let rawErr = t["管理错误/management_error"] || t["management_error"];
> >    if (!rawErr) continue;
> >    
> >    // 清洗数据 (去除 "None" 和 "Perfect")
> >    let errStr = rawErr.toString();
> >    if (errStr.includes("None") || errStr.includes("Perfect") || errStr.includes("完美")) continue;
> >    
> >    // 提取核心错误词 (比如 "FOMO")
> >    let errKey = errStr.split("(")[1] ? errStr.split("(")[1].replace(")","") : errStr;
> >    errKey = errKey.trim();
> >
> >    // 统计亏损 (只统计亏的钱，赚的钱不算错误的代价)
> >    let pnl = Number(t["净利润/net_profit"] || t["net_profit"] || 0);
> >    
> >    if (pnl < 0) {
> >        if (!errorStats[errKey]) errorStats[errKey] = 0;
> >        errorStats[errKey] += Math.abs(pnl); // 转为正数方便展示
> >        totalTuition += Math.abs(pnl);
> >    }
> >}
> >
> >// 排序
> >let sortedErrors = Object.keys(errorStats)
> >    .map(k => ({ name: k, cost: errorStats[k] }))
> >    .sort((a, b) => b.cost - a.cost);
> >
> >// 渲染
> >const root = dv.el("div", "", { attr: { style: cfg.card } });
> >root.innerHTML = `<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">💸 错误的代价 (学费统计)</div>`;
> >
> >if (totalTuition === 0) {
> >    root.innerHTML += `<div style="color:${cfg.green}; font-weight:bold;">🎉 完美！近期实盘没有因纪律问题亏损。</div>`;
> >} else {
> >    root.innerHTML += `
> >    <div style="font-size:0.9em; margin-bottom:10px; opacity:0.8;">
> >        因执行错误 (FOMO/顶单等) 共计亏损: <span style="color:${cfg.red}; font-weight:800; font-size:1.2em;">$${totalTuition}</span>
> >    </div>
> >    <div style="display:flex; flex-direction:column; gap:8px;">
> >        ${sortedErrors.map(e => {
> >            let percent = Math.round((e.cost / totalTuition) * 100);
> >            return `
> >            <div style="display:flex; align-items:center; font-size:0.85em;">
> >                <div style="width:80px; opacity:0.9;">${e.name}</div>
> >                <div style="flex:1; background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden; margin:0 10px;">
> >                    <div style="width:${percent}%; height:100%; background:${cfg.red};"></div>
> >                </div>
> >                <div style="width:60px; text-align:right; font-weight:bold; color:${cfg.red};">-$${e.cost}</div>
> >            </div>`;
> >        }).join("")}
> >    </div>`;
> >}
> > ```
> 
> > [!example] 🖼️ 综合画廊 (Common Gallery)
> >```dataviewjs
> >// === 模块: 🖼️ 综合画廊 (Simple & Clean) ===
> >const cfg = {
> >    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; margin-bottom:20px;",
> >    green: "#10B981", blue: "#3B82F6", orange: "#F59E0B"
> >};
> >
> >const trades = dv.pages("#PA/Trade")
> >    .where(p => !p.file.path.includes("Templates"))
> >    .sort(p => p.date || p.file.day, "desc")
> >    .limit(20);
> >
> >// ... (renderCard 函数保持不变，直接复制之前的) ...
> >function renderCard(n) {
> >    let rawCover = n["封面/cover"] || n["cover"];
> >    if (!rawCover) return "";
> >    let src = "";
> >    if (rawCover.path) src = app.vault.adapter.getResourcePath(rawCover.path);
> >    else if (typeof rawCover === 'string') {
> >        let path = rawCover.replace("![[", "").replace("]]", "").replace("[[", "");
> >        let file = app.metadataCache.getFirstLinkpathDest(path, n.file.path);
> >        if (file) src = app.vault.adapter.getResourcePath(file.path);
> >    }
> >    if (!src) return "";
> >    let acct = (n["账户类型/account_type"] || "").toString();
> >    let badgeColor = acct.includes("Live") ? cfg.green : (acct.includes("Back") ? cfg.orange : cfg.blue);
> >    let badgeText = acct.includes("Live") ? "LIVE" : (acct.includes("Back") ? "BACK" : "DEMO");
> >    let pnl = Number(n["净利润/net_profit"] || n["net_profit"] || 0);
> >    let pnlTxt = pnl > 0 ? `+${pnl}` : `${pnl}`;
> >    let pnlColor = pnl >= 0 ? cfg.green : "#EF4444";
> >    return `<div style="position:relative; aspect-ratio:16/9; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); margin-bottom:8px;">
> >        <img src="${src}" style="width:100%; height:100%; object-fit:cover;">
> >        <div style="position:absolute; top:5px; right:5px; background:${badgeColor}; color:black; font-size:0.6em; font-weight:800; padding:2px 6px; border-radius:4px;">${badgeText}</div>
> >        <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent, rgba(0,0,0,0.9)); padding:15px 8px 5px 8px; display:flex; justify-content:space-between; align-items:flex-end;">
> >            <a href="${n.file.path}" class="internal-link" style="color:white; text-decoration:none; font-size:0.75em; font-weight:bold;">${n.file.name}</a>
> >            <div style="color:${pnlColor}; font-weight:800; font-size:0.9em;">${pnlTxt}</div>
> >        </div>
> >    </div>`;
> >}
> >
> >let imgs = "";
> >let count = 0;
> >for (let i = 0; i < trades.length; i++) {
> >    let card = renderCard(trades[i]);
> >    if (card) { imgs += card; count++; }
> >    if (count >= 4) break; 
> >}
> >
> >const root = dv.el("div", "", { attr: { style: cfg.card } });
> >root.innerHTML = `
> ><div style="font-weight:700; opacity:0.7; margin-bottom:10px;">🖼️ 最新复盘 (Charts)</div>
> ><div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">${imgs}</div>
> ><div style="text-align:center; margin-top:12px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.05);">
> >    <a href="obsidian://search?query=tag:#PA/Trade" style="color:${cfg.blue}; text-decoration:none; font-size:0.8em;">📂 查看所有图表</a>
> ></div>
> >`;
> >```
---
```dataviewjs
// === 模块: 🚀 快捷指令台 (Quick Actions) ===
const cfg = {
    card: "background:rgba(35,35,35,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px;",
    green: "#10B981", blue: "#3B82F6"
};

const root = dv.el("div", "", { attr: { style: cfg.card } });

// 按钮样式
const btn = (color, text, cmd) => `
<button onclick="app.commands.executeCommandById('${cmd}')" style="
    background:${color}; color:white; border:none; padding:8px 16px; 
    border-radius:6px; cursor:pointer; font-weight:bold; margin-right:10px;
    box-shadow:0 2px 4px rgba(0,0,0,0.2);
">
    ${text}
</button>
`;

root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🚀 快速行动 (Quick Actions)</div>
<div style="display:flex; align-items:center;">
    ${btn(cfg.green, "+ 新建实盘 (Live)", "quickadd:choice:New Live Trade")}
    ${btn(cfg.blue, "+ 新建模拟 (Demo)", "quickadd:choice:New Demo Trade")}
</div>
<div style="margin-top:10px; font-size:0.8em; opacity:0.6;">
    *点击按钮将自动套用模版并创建文件
</div>
`;
```
# ✅ 每日行动 (Actions)

> [!COLUMN]
> > [!failure] 🔥 必须解决 (Inbox & Urgent)
> > *这里的任务是交易系统的“路障”，必须优先清除。*
> > 
> > **❓ 疑难杂症 (Questions)**
> > *(复盘时遇到的盲点，每周五前必须搞懂)*
> > ```tasks
> > not done
> > tag includes #task/question
> > path does not include Templates
> > hide backlink
> > short mode
> > ```
> > 
> > **🚨 紧急事项 (Urgent)**
> > ```tasks
> > not done
> > tag includes #task/urgent
> > path does not include Templates
> > hide backlink
> > short mode
> > ```
>
> > [!example] 📚 进修与验证 (Growth)
> > *交易系统的迭代区域。*
> > 
> > **📖 待学习/阅读 (Study)**
> > ```tasks
> > not done
> > (tag includes #task/study) OR (tag includes #task/read) OR (tag includes #task/watch)
> > path does not include Templates
> > limit 5
> > hide backlink
> > short mode
> > ```
> > 
> > **🔬 待验证想法 (Verify)**
> > *(例如：验证 MTR 的胜率是否真的有40%)*
> > ```tasks
> > not done
> > tag includes #task/verify
> > path does not include Templates
> > hide backlink
> > short mode
> > ```

> [!COLUMN]
	> > [!NOTE] 📅 每日例行 (Routine)
> > **📝 手动打卡 (Checklist)**
> > - [ ] ☀️ **盘前**：阅读新闻，标记关键位 (S/R Levels) 🔁 every day
> > - [ ] 🧘 **盘中**：每小时检查一次情绪 (FOMO Check) 🔁 every day
> > - [ ] 🌙 **盘后**：填写当日 `复盘日记` 🔁 every day
> > 
> > **🧹 杂项待办 (To-Do)**
> > ```tasks
> > not done
> > tag includes #task/todo
> > path does not include Templates
> > hide backlink
> > short mode
> > limit 5
> > ```
>
> > [!quote] 🛠️ 系统维护 (Admin)
> > **🖨️ 待打印 (Print Queue)**
> > *(攒够 10 张去打印店)*
> > ```tasks
> > not done
> > tag includes #task/print
> > path does not include Templates
> > hide backlink
> > short mode
> > ```
> > 
> > **📂 待整理 (Organize)**
> > *(笔记乱了放这里)*
> > ```tasks
> > not done
> > tag includes #task/organize
> > path does not include Templates
> > hide backlink
> > short mode
> > ```

/* 文件名: Scripts/pa-view-inspector.js
   用途: 全景数据巡检仪 (Ultimate Fusion)
   包含: 健康度评分 + 缺失值检测 + 维度分布 + 每日一题诊断
*/

const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/Scripts/pa-config.js");
const c = cfg.colors;

const style = document.createElement('style');
style.innerHTML = `
    .insp-container { display: flex; flex-direction: column; gap: 15px; }
    .insp-row-flex { display: flex; gap: 15px; flex-wrap: wrap; }
    .insp-card { flex: 1; min-width: 280px; background: rgba(30,30,30,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 15px; }
    .insp-title { font-weight: bold; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px; }
    .insp-item { display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 6px; align-items: center; }
    .insp-bar-bg { background: rgba(255,255,255,0.1); height: 4px; border-radius: 2px; overflow: hidden; margin-top: 4px; }
    .insp-bar-fill { height: 100%; border-radius: 2px; }
    .insp-tag { padding: 1px 5px; border-radius: 3px; font-size: 0.75em; font-weight: bold; }
    .insp-table { width: 100%; border-collapse: collapse; font-size: 0.8em; margin-top: 10px; }
    .insp-table th { text-align: left; opacity: 0.5; padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .insp-table td { padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .txt-red { color: ${c.loss}; } .txt-green { color: ${c.live}; } .txt-dim { opacity: 0.5; }
`;
document.head.appendChild(style);

if (window.paData) {
    const D = window.paData;
    const trades = D.trades; // 倒序
    const sr = D.sr;

    // --- 1. 健康度体检逻辑 (Health Check) ---
    let missing = { ticker:0, tf:0, setup:0, logic:0 };
    trades.forEach(t => {
        if(!t.ticker || t.ticker==="Unknown") missing.ticker++;
        if(!t.tf || t.tf==="Unknown") missing.tf++;
        if(!t.setup || t.setup==="Unknown") missing.setup++;
        // 逻辑自检: 有盈亏但R值为0
        if(t.pnl !== 0 && t.r === 0) missing.logic++;
    });
    
    let totalIssues = Object.values(missing).reduce((a,b)=>a+b, 0);
    let healthScore = Math.max(0, 100 - Math.ceil((totalIssues / Math.max(trades.length,1)) * 20));
    let healthColor = healthScore > 90 ? c.live : (healthScore > 60 ? c.back : c.loss);

    // --- 2. 维度分布统计 (Distributions) ---
    function getDist(key) {
        let dist = {};
        trades.forEach(t => {
            let val = (t[key] || "Unknown").toString().split("(")[0].trim();
            if(val) dist[val] = (dist[val] || 0) + 1;
        });
        return Object.entries(dist).sort((a,b)=>b[1]-a[1]).slice(0, 5); // Top 5
    }
    const distTicker = getDist("ticker");
    const distSetup = getDist("setup");

    // --- 3. 执行质量统计 ---
    const distExec = getDist("error"); 
    const execColorFn = (name) => {
        if(name.includes("完美") || name.includes("Perfect")) return c.live;
        if(name.includes("主动") || name.includes("Valid")) return c.back; // 黄色
        if(name.includes("恐慌") || name.includes("Panic")) return c.loss;
        return "gray";
    };

    // --- 4. 辅助渲染函数 ---
    const renderMiniBar = (data, colorFn) => {
        let total = trades.length; // 用总数做分母
        return data.map(([k,v]) => {
            let pct = Math.round(v/total*100);
            let col = typeof colorFn === 'function' ? colorFn(k) : colorFn;
            return `<div style="margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; font-size:0.75em;">
                    <span style="opacity:0.8">${k}</span><span style="opacity:0.5">${v} (${pct}%)</span>
                </div>
                <div class="insp-bar-bg"><div class="insp-bar-fill" style="width:${pct}%; background:${col};"></div></div>
            </div>`;
        }).join("");
    };

    // --- 5. 主界面渲染 ---
    const root = dv.el("div", "");
    root.innerHTML = `
    <div class="insp-container">
        
        <div class="insp-row-flex">
            <div class="insp-card" style="border-left: 3px solid ${healthColor};">
                <div class="insp-title" style="color:${healthColor}">
                    <span>❤️ 系统健康度: ${healthScore}</span>
                    <span style="font-size:0.8em; opacity:0.6;">${trades.length} 交易</span>
                </div>
                <div class="insp-item"><span>缺失品种 (Ticker)</span> <span class="${missing.ticker>0?'txt-red':'txt-dim'}">${missing.ticker}</span></div>
                <div class="insp-item"><span>缺失周期 (Timeframe)</span> <span class="${missing.tf>0?'txt-red':'txt-dim'}">${missing.tf}</span></div>
                <div class="insp-item"><span>缺失策略 (Setup)</span> <span class="${missing.setup>0?'txt-red':'txt-dim'}">${missing.setup}</span></div>
                <div class="insp-item"><span>逻辑异常 (R=0)</span> <span class="${missing.logic>0?'txt-red':'txt-dim'}">${missing.logic}</span></div>
            </div>

            <div class="insp-card">
                <div class="insp-title" style="color:${c.purple}">
                    <span>🧠 神经系统诊断</span>
                    <span class="insp-tag" style="background:${D.isCached?c.live:c.back}; color:black;">${D.isCached?"⚡️":"🐢"}</span>
                </div>
                <div class="insp-item"><span>加载耗时</span> <span>${D.loadTime}</span></div>
                <div class="insp-item"><span>每日一题池</span> <span class="${sr.quizPool.length>0?'txt-green':'txt-red'}">${sr.quizPool.length} 题</span></div>
                <div class="insp-item"><span>文件夹识别</span> <span class="${Object.keys(sr.folders).length>0?'txt-green':'txt-red'}">${Object.keys(sr.folders).length>0?'✅ 正常':'❌ 失败'}</span></div>
                <div class="insp-item"><span>大纲加载</span> <span class="${D.course.syllabus.length>0?'txt-green':'txt-red'}">${D.course.syllabus.length} 课</span></div>
            </div>
        </div>

        <div class="insp-row-flex">
            <div class="insp-card">
                <div class="insp-title" style="color:${c.demo}">品种分布 (Ticker)</div>
                ${renderMiniBar(distTicker, c.demo)}
            </div>
            <div class="insp-card">
                <div class="insp-title" style="color:${c.live}">策略分布 (Setup)</div>
                ${renderMiniBar(distSetup, c.live)}
            </div>
            <div class="insp-card">
                <div class="insp-title" style="color:${c.back}">执行质量 (Execution)</div>
                ${renderMiniBar(distExec, execColorFn)}
            </div>
        </div>

        <div class="insp-card">
            <div class="insp-title" style="border:none;">
                <span>📄 原始数据明细 (Raw Data)</span>
                <span style="font-size:0.8em; opacity:0.5; font-weight:normal;">Top 15 Recent</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="insp-table">
                    <thead><tr><th>Date</th><th>Ticker</th><th>TF</th><th>Setup</th><th>Result</th><th>Execution</th></tr></thead>
                    <tbody>
                        ${trades.slice(0, 15).map(t => {
                            let resTxt = t.pnl>0 ? "Win" : (t.pnl<0 ? "Loss" : "Scratch");
                            let resCol = t.pnl>0 ? c.live : (t.pnl<0 ? c.loss : "gray");
                            // 优先显示新字段，兼容旧字段
                            let execTxt = (t.error || "-").split("(")[0];
                            let execCol = execColorFn(execTxt);
                            
                            // 检查缺失项
                            let tkDisp = t.ticker && t.ticker!=="Unknown" ? `<b>${t.ticker}</b>` : `<span class="txt-red">Unknown</span>`;
                            let tfDisp = t.tf && t.tf!=="Unknown" ? t.tf : `<span class="txt-red">-</span>`;

                            return `<tr>
                                <td style="opacity:0.6">${t.date.slice(5)}</td>
                                <td>${tkDisp}</td>
                                <td>${tfDisp}</td>
                                <td>${(t.setup||"-").slice(0,8)}</td>
                                <td style="color:${resCol}; font-weight:bold;">${resTxt}</td>
                                <td style="color:${execCol}">${execTxt}</td>
                            </tr>`;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
} else {
    dv.paragraph("⚠️ Engine not loaded.");
}
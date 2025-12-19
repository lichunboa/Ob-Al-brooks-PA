var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};
var c = cfg.colors || {};

// 注入水晶样式 CSS
const style = document.createElement('style');
style.innerHTML = `
    .insp-container { display: flex; flex-direction: column; gap: 20px; }
    .insp-row { display: flex; gap: 20px; flex-wrap: wrap; }
    .insp-card { flex: 1; min-width: 280px; ${cfg.styles.glassCard} margin-bottom:0 !important; }
    .insp-head { display:flex; justify-content:space-between; margin-bottom:15px; border-bottom:1px solid ${c.border}; padding-bottom:10px; }
    .insp-title { font-weight:700; color:${c.text}; }
    .insp-item { display:flex; justify-content:space-between; font-size:0.85em; margin-bottom:8px; color:${c.textSub}; }
    .insp-val { color:${c.text}; font-weight:600; }
    .insp-bar-bg { background:rgba(255,255,255,0.05); height:4px; border-radius:2px; overflow:hidden; margin-top:5px; }
    .insp-bar { height:100%; border-radius:2px; }
    .insp-table { width:100%; border-collapse:collapse; font-size:0.85em; }
    .insp-table th { text-align:left; color:${c.textSub}; padding:8px; border-bottom:1px solid ${c.border}; font-weight:normal; }
    .insp-table td { padding:8px; border-bottom:1px solid ${c.border}; color:${c.text}; }
    .tag-err { color:${c.loss}; } .tag-ok { color:${c.live}; }
`;
document.head.appendChild(style);

if (window.paData) {
    const D = window.paData;
    const trades = D.trades; 
    
    // 健康度计算
    let missing = { ticker:0, tf:0, setup:0, logic:0 };
    trades.forEach(t => {
        if(!t.ticker || t.ticker==="Unknown") missing.ticker++;
        if(!t.tf || t.tf==="Unknown") missing.tf++;
        if(t.pnl !== 0 && t.r === 0) missing.logic++;
    });
    let score = Math.max(0, 100 - Math.ceil((Object.values(missing).reduce((a,b)=>a+b,0) / Math.max(trades.length,1)) * 20));
    let hColor = score > 90 ? c.live : (score > 60 ? c.back : c.loss);

    // 渲染函数
    const renderBar = (data, col) => data.map(([k,v]) => {
        let pct = Math.round(v/trades.length*100);
        return `<div style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; font-size:0.8em; color:${c.textSub};"><span>${k}</span><span>${pct}%</span></div><div class="insp-bar-bg"><div class="insp-bar" style="width:${pct}%; background:${col}"></div></div></div>`;
    }).join("");

    function getDist(k) { 
        let d={}; trades.forEach(t=>{let v=(t[k]||"Unknown").split("(")[0].trim(); if(v)d[v]=(d[v]||0)+1;}); 
        return Object.entries(d).sort((a,b)=>b[1]-a[1]).slice(0,5); 
    }

    const root = dv.el("div", "");
    root.innerHTML = `
    <div class="insp-container">
        <div class="insp-row">
            <div class="insp-card" style="border-left:3px solid ${hColor};">
                <div class="insp-head"><span class="insp-title" style="color:${hColor}">❤️ 健康度: ${score}</span><span style="font-size:0.8em; opacity:0.6;">${trades.length} Trades</span></div>
                <div class="insp-item"><span>Ticker Missing</span><span class="insp-val ${missing.ticker>0?'tag-err':''}">${missing.ticker}</span></div>
                <div class="insp-item"><span>TF Missing</span><span class="insp-val ${missing.tf>0?'tag-err':''}">${missing.tf}</span></div>
                <div class="insp-item"><span>Logic Errors</span><span class="insp-val ${missing.logic>0?'tag-err':''}">${missing.logic}</span></div>
            </div>
            <div class="insp-card">
                <div class="insp-head"><span class="insp-title" style="color:${c.accent}">🧠 系统状态</span></div>
                <div class="insp-item"><span>Engine Load</span><span class="insp-val">${D.loadTime}</span></div>
                <div class="insp-item"><span>Cache Mode</span><span class="insp-val">${D.isCached?"⚡️ On":"🐢 Off"}</span></div>
                <div class="insp-item"><span>Syllabus</span><span class="insp-val">${D.course.syllabus.length} Items</span></div>
            </div>
        </div>
        <div class="insp-row">
            <div class="insp-card"><div class="insp-head"><span class="insp-title">品种 (Ticker)</span></div>${renderBar(getDist("ticker"), c.demo)}</div>
            <div class="insp-card"><div class="insp-head"><span class="insp-title">策略 (Setup)</span></div>${renderBar(getDist("setup"), c.live)}</div>
        </div>
        <div class="insp-card">
            <div class="insp-head" style="border:none;"><span class="insp-title">📄 数据明细 (Raw Data)</span></div>
            <div style="overflow-x:auto;">
                <table class="insp-table">
                    <thead><tr><th>Date</th><th>Ticker</th><th>TF</th><th>Setup</th><th>Result</th></tr></thead>
                    <tbody>
                        ${trades.slice(0, 10).map(t => `<tr>
                            <td style="opacity:0.6">${t.date.slice(5)}</td>
                            <td>${t.ticker}</td>
                            <td>${t.tf}</td>
                            <td>${(t.setup||"-").slice(0,10)}</td>
                            <td style="color:${t.pnl>0?c.live:(t.pnl<0?c.loss:'gray')}; font-weight:bold;">${t.pnl>0?"WIN":(t.pnl<0?"LOSS":"BE")}</td>
                        </tr>`).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}
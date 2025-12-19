/* 文件名: Scripts/pa-view-strategy.js (V2.2 - Strict Restore)
   用途: 策略实验室 (资金曲线 + 策略排行 + 建议)
   修复: 找回回测数据，还原中文，保持水晶质感
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/Scripts/pa-config.js");

if (window.paData) {
    const trades = window.paData.tradesAsc; // 正序数据
    const c = cfg.colors;

    // --- 1. 数据清洗 ---
    let curves = { live: [0], demo: [0], back: [0] };
    let cum = { live: 0, demo: 0, back: 0 };
    let stratStats = {};

    for (let t of trades) {
        let pnl = t.pnl;
        let acct = t.type.toLowerCase();
        
        if (acct === "live") {
            cum.live += pnl; curves.live.push(cum.live);
        } else if (acct === "demo") {
            cum.demo += pnl; curves.demo.push(cum.demo);
        } else if (acct === "backtest") {
            cum.back += pnl; curves.back.push(cum.back);
        }

        let setup = (t.setup || "Unknown").split("(")[0].trim();
        if (!stratStats[setup]) stratStats[setup] = { win: 0, total: 0 };
        stratStats[setup].total++;
        if (t.pnl > 0) stratStats[setup].win++;
    }

    // --- 2. 绘图 (SVG) ---
    const width = 400, height = 150;
    const allValues = [...curves.live, ...curves.demo, ...curves.back];
    const maxVal = Math.max(...allValues, 100); 
    const minVal = Math.min(...allValues, -100);
    const range = maxVal - minVal;

    function getPoints(data) {
        if (data.length < 2) return "";
        return data.map((val, i) => {
            let x = (i / (data.length - 1)) * width;
            let y = height - ((val - minVal) / range) * height;
            return `${x},${y}`;
        }).join(" ");
    }

    const ptsLive = getPoints(curves.live);
    const ptsDemo = getPoints(curves.demo);
    const ptsBack = getPoints(curves.back);
    const zeroY = height - ((0 - minVal) / range) * height;

    // --- 3. 排行 ---
    let topStrats = Object.keys(stratStats)
        .map(k => ({ 
            name: k, 
            wr: Math.round((stratStats[k].win / stratStats[k].total) * 100),
            total: stratStats[k].total 
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    // --- 4. 渲染 ---
    const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard } });
    root.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <div style="font-weight:700; color:${c.text};"><span style="color:${c.accent}">🧬</span> 资金增长曲线 (Capital Growth)</div>
        <div style="font-size:0.75em; display:flex; gap:10px; font-family:monospace;">
            <span style="color:${c.live}">● 实盘 $${cum.live.toFixed(0)}</span>
            <span style="color:${c.demo}">● 模拟 $${cum.demo.toFixed(0)}</span>
            <span style="color:${c.back}">● 回测 $${cum.back.toFixed(0)}</span>
        </div>
    </div>
    
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:150px; background:rgba(0,0,0,0.1); border-radius:8px; border:1px solid ${c.border};">
        <defs>
            <linearGradient id="gradLive" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:${c.live};stop-opacity:0.2" />
                <stop offset="100%" style="stop-color:${c.live};stop-opacity:0" />
            </linearGradient>
        </defs>
        
        <line x1="0" y1="${zeroY}" x2="${width}" y2="${zeroY}" stroke="rgba(255,255,255,0.15)" stroke-dasharray="4" />
        
        <polyline points="${ptsBack}" fill="none" stroke="${c.back}" stroke-width="1.5" opacity="0.6" stroke-dasharray="3" />
        <polyline points="${ptsDemo}" fill="none" stroke="${c.demo}" stroke-width="1.5" opacity="0.7" />
        <polyline points="${ptsLive}" fill="none" stroke="${c.live}" stroke-width="2.5" filter="drop-shadow(0 0 4px ${c.live}66)" />
        
        ${curves.live.length > 1 ? `<circle cx="${ptsLive.split(' ').pop().split(',')[0]}" cy="${ptsLive.split(' ').pop().split(',')[1]}" r="3" fill="${c.live}" />` : ''}
    </svg>

    <div style="margin-top:20px; display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
        <div>
            <div style="font-size:0.75em; color:${c.textSub}; margin-bottom:8px; text-transform:uppercase;">📊 热门策略表现</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                ${topStrats.map(s => `
                    <div style="display:flex; justify-content:space-between; font-size:0.85em; background:rgba(255,255,255,0.03); padding:6px 10px; border-radius:6px; border:1px solid ${c.border};">
                        <span style="color:${c.text}">${s.name}</span>
                        <span><span style="color:${s.wr>50?c.live:c.back}; font-weight:bold;">${s.wr}%</span> <span style="opacity:0.4; font-size:0.9em;">/ ${s.total}</span></span>
                    </div>
                `).join("")}
            </div>
        </div>
        
        <div style="background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; border:1px solid ${c.border};">
             <div style="font-size:0.75em; color:${c.textSub}; margin-bottom:8px; text-transform:uppercase;">💡 系统建议 (AI Insight)</div>
             <div style="font-size:0.85em; color:${c.text}; line-height:1.6; opacity:0.9;">
                当前表现最佳的策略是 <b style="color:${c.accent}">${topStrats[0]?.name || "暂无"}</b>。<br>
                实盘累计盈亏 <b style="color:${cum.live>=0?c.live:c.loss}">$${cum.live}</b>。${cum.live < 0 ? "处于回撤期，建议降低仓位或回归模拟。" : "状态良好，请继续保持一致性执行。"}
             </div>
        </div>
    </div>`;
}
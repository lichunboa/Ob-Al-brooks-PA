/* 文件名: Scripts/pa-view-strategy.js
   用途: 策略实验室 (资金曲线 + 策略排行 + 建议)
   修复: 1:1 还原 2.0 版本逻辑
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/Scripts/pa-config.js");

if (window.paData) {
    // 必须使用正序排列的数据来画图
    const trades = window.paData.tradesAsc; 
    const c = cfg.colors;

    // --- 1. 数据清洗与分离 ---
    let curves = { live: [0], demo: [0], back: [0] };
    let cum = { live: 0, demo: 0, back: 0 };
    let stratStats = {};

    for (let t of trades) {
        let pnl = t.pnl;
        let acct = t.type.toLowerCase();
        
        // 累计盈亏曲线
        if (acct === "live") {
            cum.live += pnl; curves.live.push(cum.live);
        } else if (acct === "demo") {
            cum.demo += pnl; curves.demo.push(cum.demo);
        } else if (acct === "backtest") {
            cum.back += pnl; curves.back.push(cum.back);
        }

        // 策略表现统计
        let setup = (t.setup || "Unknown").split("(")[0].trim();
        if (!stratStats[setup]) stratStats[setup] = { win: 0, total: 0 };
        stratStats[setup].total++;
        if (t.pnl > 0) stratStats[setup].win++;
    }

    // --- 2. 绘制资金曲线 (SVG) ---
    const width = 400, height = 150;
    const allValues = [...curves.live, ...curves.demo, ...curves.back];
    // 动态计算 Y 轴范围 (避免 0 线居中问题)
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

    // --- 3. 策略排行 ---
    let topStrats = Object.keys(stratStats)
        .map(k => ({ 
            name: k, 
            wr: Math.round((stratStats[k].win / stratStats[k].total) * 100),
            total: stratStats[k].total 
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    // --- 4. 渲染 ---
    const root = dv.el("div", "", { attr: { style: c.cardBg } });
    root.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <div style="font-weight:700; font-size:1.1em;">🧬 资金增长曲线 (Capital Growth)</div>
        <div style="font-size:0.8em; display:flex; gap:12px;">
            <span style="color:${c.live}">● 实盘 $${cum.live.toFixed(0)}</span>
            <span style="color:${c.demo}">● 模拟 $${cum.demo.toFixed(0)}</span>
            <span style="color:${c.back}">● 回测 $${cum.back.toFixed(0)}</span>
        </div>
    </div>
    
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:150px; background:rgba(0,0,0,0.2); border-radius:8px; overflow:visible;">
        <line x1="0" y1="${zeroY}" x2="${width}" y2="${zeroY}" stroke="rgba(255,255,255,0.1)" stroke-dasharray="4" />
        
        <polyline points="${ptsBack}" fill="none" stroke="${c.back}" stroke-width="1.5" opacity="0.6" stroke-dasharray="2" />
        <polyline points="${ptsDemo}" fill="none" stroke="${c.demo}" stroke-width="1.5" opacity="0.8" />
        <polyline points="${ptsLive}" fill="none" stroke="${c.live}" stroke-width="2.5" />
        
        ${curves.live.length > 1 ? `<circle cx="${ptsLive.split(' ').pop().split(',')[0]}" cy="${ptsLive.split(' ').pop().split(',')[1]}" r="3" fill="${c.live}" />` : ''}
    </svg>

    <div style="margin-top:20px; display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
        <div>
            <div style="font-size:0.8em; opacity:0.6; margin-bottom:8px;">📊 热门策略表现 (Top Setups)</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                ${topStrats.map(s => `
                    <div style="display:flex; justify-content:space-between; font-size:0.85em; background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:4px;">
                        <span>${s.name}</span>
                        <span><span style="color:${s.wr>50?c.live:c.back}">${s.wr}%</span> <span style="opacity:0.4">(${s.total})</span></span>
                    </div>
                `).join("")}
            </div>
        </div>
        <div>
             <div style="font-size:0.8em; opacity:0.6; margin-bottom:8px;">💡 系统建议</div>
             <div style="font-size:0.8em; opacity:0.8; line-height:1.5;">
                当前表现最好的策略是 <b style="color:${c.demo}">${topStrats[0]?.name || "无"}</b>。<br>
                建议在 <b style="color:${cum.live < 0 ? c.back : c.live}">${cum.live < 0 ? '回测' : '实盘'}</b> 中继续保持执行。
             </div>
        </div>
    </div>
    `;
}
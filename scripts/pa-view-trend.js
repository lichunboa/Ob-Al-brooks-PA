/* 文件名: Scripts/pa-view-trend.js (V2.2 - Strict Restore)
   用途: 综合趋势与心态监控
*/
var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};
var c = cfg.colors || {};

if (typeof dv === 'undefined') return;
if (!window.paData) { dv.el("div", "🦁 Engine Loading...", { attr: { style: "opacity:0.5; padding:20px; text-align:center;" } }); return; }

const trades = window.paData.trades.slice(0, 30);

let bars = "";
if (trades.length > 0) {
    let maxVal = Math.max(...trades.map(t => Math.abs(t.r || 0))) || 1;
    bars = `<div style="display:flex; align-items:flex-end; gap:4px; height:60px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">`;
    for (let t of trades) {
        let r = t.r || 0;
        let h = Math.round((Math.abs(r) / maxVal) * 50); if (h < 4) h = 4;
        let color = c.loss; 
        if (r >= 0) {
            if (t.type === "Live") color = c.live;
            else if (t.type === "Demo") color = c.demo;
            else color = c.back;
        }
        let title = `${t.name}\n${t.type}\nR: ${r.toFixed(2)}`;
        bars += `<div style="flex:1; height:${h}px; background:${color}; border-radius:2px; opacity:${r>=0?1:0.7}; min-width:3px;" title="${title}"></div>`;
    }
    bars += `</div>`;
} else {
    bars = `<div style="opacity:0.5; font-size:0.8em; text-align:center; padding:20px;">暂无交易数据</div>`;
}

const recentLive = trades.filter(t => t.type === "Live").slice(0, 7);
let tilt = 0, fomo = 0;
for(let t of recentLive) {
    let err = (t.error || "").toString();
    if(err.includes("Tilt") || err.includes("上头")) tilt++;
    if(err.includes("FOMO") || err.includes("追单")) fomo++;
}

let mindStatus = (tilt+fomo) === 0 ? "🛡️ 状态极佳" : (tilt+fomo < 3 ? "⚠️ 有点起伏" : "🔥 极度危险");
let mindColor = (tilt+fomo) === 0 ? c.live : (tilt+fomo < 3 ? c.back : c.loss);
let glow = `0 0 15px ${mindColor}33`;

const root = dv.el("div", "", { attr: { style: cfg.styles.glassCard + " display:flex; gap:25px;" } });
root.innerHTML = `
    <div style="flex:2;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="font-weight:700; opacity:0.9;">📈 综合趋势 (R-Multiples)</div>
            <div style="display:flex; gap:10px; font-size:0.75em; opacity:0.7;">
                <span style="color:${c.live}">● Live</span>
                <span style="color:${c.demo}">● Demo</span>
                <span style="color:${c.back}">● Back</span>
            </div>
        </div>
        ${bars}
    </div>
    <div style="width:1px; background:rgba(255,255,255,0.1);"></div>
    <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
        <div style="font-weight:700; opacity:0.7; margin-bottom:8px; font-size:0.9em;">🧠 实盘心态监控</div>
        <div style="font-size:1.4em; font-weight:800; color:${mindColor}; text-shadow:${glow}; margin-bottom:8px;">${mindStatus}</div>
        <div style="font-size:0.75em; opacity:0.6; background:rgba(255,255,255,0.05); padding:4px 10px; border-radius:12px;">
            近7笔失误:<br>
            FOMO: <b>${fomo}</b> | Tilt: <b>${tilt}</b>
        </div>
    </div>`;
/* 文件名: Scripts/pa-view-trend.js
   用途: 综合趋势与心态 (Multi-Trend & Mind)
   修复: 还原 R 值图表的颜色逻辑 (Live=Green, Demo=Blue, Back=Orange)
*/
var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
var cfg = basePath ? require(basePath + "/Scripts/pa-config.js") : {};
var c = cfg.colors || {};

if (window.paData) {
    // 取最近 30 笔交易，倒序排列（最新的在最右边/最后）
    const trades = window.paData.trades.slice(0, 30); 

    // 1. R值柱状图
    let bars = "";
    if (trades.length > 0) {
        // 找出最大值用于归一化高度
        let maxVal = Math.max(...trades.map(t => Math.abs(t.r || 0))) || 1;
        
        bars = `<div style="display:flex; align-items:flex-end; gap:4px; height:60px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">`;
        
        for (let t of trades) {
            let r = t.r || 0;
            let h = Math.round((Math.abs(r) / maxVal) * 50); 
            if (h < 4) h = 4;
            
            // 颜色逻辑：盈利使用账户色，亏损使用红色
            let color = c.loss; // 默认亏损红
            if (r >= 0) {
                if (t.type === "Live") color = c.live;
                else if (t.type === "Demo") color = c.demo;
                else color = c.back;
            }
            
            let title = `${t.name}\n${t.type}\nR: ${r.toFixed(2)}`;
            bars += `<div style="width:6px; height:${h}px; background:${color}; border-radius:2px; opacity:${r>=0?1:0.7};" title="${title}"></div>`;
        }
        bars += `</div>`;
    } else {
        bars = `<div style="opacity:0.5; font-size:0.8em;">暂无交易数据</div>`;
    }

    // 2. 心态监控 (只看最近 7 笔 Live 交易)
    const recentLive = trades.filter(t => t.type === "Live").slice(0, 7);
    let tilt = 0, fomo = 0;
    
    for(let t of recentLive) {
        let err = (t.error || "").toString();
        if(err.includes("Tilt") || err.includes("上头")) tilt++;
        if(err.includes("FOMO") || err.includes("追单")) fomo++;
    }
    
    let mindStatus = (tilt+fomo) === 0 ? "🛡️ 状态极佳" : (tilt+fomo < 3 ? "⚠️ 有点起伏" : "🔥 极度危险");
    let mindColor = (tilt+fomo) === 0 ? c.live : (tilt+fomo < 3 ? c.back : c.loss);

    const root = dv.el("div", "", { attr: { style: c.cardBg + " display:flex; gap:20px;" } });
    root.innerHTML = `
    <div style="flex:2;">
        <div style="font-weight:700; opacity:0.7; margin-bottom:10px;">📈 综合趋势 (R-Multiples)</div>
        <div style="display:flex; gap:10px; font-size:0.6em; margin-bottom:4px; opacity:0.6;">
            <span style="color:${c.live}">● Live</span>
            <span style="color:${c.demo}">● Demo</span>
            <span style="color:${c.back}">● Back</span>
        </div>
        ${bars}
    </div>
    <div style="flex:1; border-left:1px solid rgba(255,255,255,0.1); padding-left:20px; display:flex; flex-direction:column; justify-content:center;">
        <div style="font-weight:700; opacity:0.7; margin-bottom:5px;">🧠 实盘心态</div>
        <div style="font-size:1.4em; font-weight:800; color:${mindColor};">${mindStatus}</div>
        <div style="font-size:0.7em; opacity:0.6; margin-top:4px;">
            Recent Errors:<br>
            FOMO: ${fomo} | Tilt: ${tilt}
        </div>
    </div>`;
}
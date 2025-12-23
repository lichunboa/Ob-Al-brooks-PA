/* 文件名: Scripts/pa-view-hub-analytics.js
   用途: 数据中心 (Analytics Hub) - 整合账户、策略、周期、错误分析
   版本: v5.0 (Consolidated)
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

if (window.paData) {
    const trades = window.paData.trades;
    const stats = window.paData.stats;
    const tradesAsc = window.paData.tradesAsc;

    // --- 1. 布局容器 ---
    const root = dv.el("div", "", { attr: { style: "display:flex; flex-direction:column; gap:20px;" } });

    // --- 2. 顶部：账户总览 (Mini Dashboard) ---
    // 逻辑来自 pa-view-account.js
    function getStats(type) {
        let subset = trades.filter((t) => t.type === type);
        let total = subset.length;
        let wins = subset.filter((t) => t.pnl > 0).length;
        let pnl = subset.reduce((acc, t) => acc + t.pnl, 0);
        let wr = total > 0 ? Math.round((wins / total) * 100) : 0;
        return { pnl: pnl.toFixed(2), wr, count: total };
    }
    const live = getStats("Live");
    const demo = getStats("Demo");
    const back = getStats("Backtest");

    // 热力图逻辑
    let targetMonth = moment().format("YYYY-MM");
    const lastLiveTrade = trades.filter(t => t.type === "Live").sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lastLiveTrade) targetMonth = lastLiveTrade.date.substring(0, 7);
    const daysInMonth = moment(targetMonth, "YYYY-MM").daysInMonth();
    let dailyMap = {};
    trades.filter((t) => t.type === "Live" && t.date.startsWith(targetMonth)).forEach((t) => {
        let day = parseInt(t.date.split("-")[2]);
        let val = parseFloat(t.pnl);
        if (isNaN(val)) val = 0;
        dailyMap[day] = (dailyMap[day] || 0) + val;
    });
    let gridHtml = `<div style="display: grid; grid-template-columns: repeat(31, 1fr); gap: 2px; height: 12px;">`; // 紧凑型热力条
    for (let d = 1; d <= daysInMonth; d++) {
        let pnl = dailyMap[d];
        let bg = pnl > 0 ? c.live : pnl < 0 ? c.loss : "rgba(255,255,255,0.1)";
        let op = pnl !== undefined ? 1 : 0.2;
        gridHtml += `<div style="background:${bg}; opacity:${op}; border-radius:1px;" title="${targetMonth}-${d}: ${pnl||0}"></div>`;
    }
    gridHtml += `</div>`;

    root.innerHTML = `
    <div style="${c.cardBg}; padding: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <div style="display:flex; align-items:baseline; gap:10px;">
                <div style="font-size:2.4em; font-weight:900; color:${live.pnl >= 0 ? c.live : c.loss}; line-height:1;">${live.pnl > 0 ? "+" : ""}${live.pnl}</div>
                <div style="font-size:0.9em; opacity:0.6;">Live PnL ($)</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:1.2em; font-weight:bold;">${live.wr}% <span style="font-size:0.6em; opacity:0.6;">Win Rate</span></div>
                <div style="font-size:0.8em; opacity:0.5;">${live.count} Trades</div>
            </div>
        </div>
        <div style="margin-bottom:5px; font-size:0.7em; opacity:0.5; display:flex; justify-content:space-between;">
            <span>Month Activity (${targetMonth})</span>
            <span>Demo: ${demo.pnl} | Backtest: ${back.pnl}</span>
        </div>
        ${gridHtml}
    </div>
    `;

    // --- 3. 下部：多维分析 (Tabs) ---
    // 我们使用简单的 JS 切换逻辑来实现 Tab
    const tabContainer = dv.el("div", "", { attr: { style: c.cardBg + "; padding:0; overflow:hidden; min-height: 300px;" } });
    
    // Tab Header
    const header = document.createElement("div");
    header.style.cssText = "display:flex; border-bottom:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.2);";
    const tabs = [
        { id: "curve", icon: "📈", name: "资金曲线" },
        { id: "cycle", icon: "🌪️", name: "环境分析" },
        { id: "tuition", icon: "💸", name: "错误归因" }
    ];
    
    let activeTab = "curve";

    tabs.forEach(t => {
        const btn = document.createElement("div");
        btn.innerHTML = `${t.icon} ${t.name}`;
        btn.style.cssText = `flex:1; text-align:center; padding:12px; cursor:pointer; font-size:0.9em; transition:all 0.2s; opacity:0.6; border-bottom:2px solid transparent;`;
        btn.dataset.tab = t.id;
        btn.onclick = () => switchTab(t.id);
        header.appendChild(btn);
    });
    tabContainer.appendChild(header);

    // Tab Content Area
    const contentArea = document.createElement("div");
    contentArea.style.padding = "20px";
    tabContainer.appendChild(contentArea);

    // 渲染函数
    function renderCurve() {
        // 逻辑来自 pa-view-strategy.js
        let curves = { live: [0], demo: [0], back: [0] };
        let cum = { live: 0, demo: 0, back: 0 };
        for (let t of tradesAsc) {
            let pnl = t.pnl;
            let acct = t.type.toLowerCase();
            if (acct === "live") { cum.live += pnl; curves.live.push(cum.live); }
            else if (acct === "demo") { cum.demo += pnl; curves.demo.push(cum.demo); }
            else if (acct === "backtest") { cum.back += pnl; curves.back.push(cum.back); }
        }
        const allValues = [...curves.live, ...curves.demo, ...curves.back];
        const maxVal = Math.max(...allValues, 100);
        const minVal = Math.min(...allValues, -100);
        const range = maxVal - minVal;
        const width = 600; const height = 200; // 适配 Tab 宽度

        function getPoints(data) {
            if (data.length < 2) return `0,${height} ${width},${height}`;
            let step = width / (data.length - 1);
            return data.map((v, i) => {
                let x = i * step;
                let y = height - ((v - minVal) / range) * height;
                return `${x},${y}`;
            }).join(" ");
        }

        return `
        <div style="text-align:center; margin-bottom:10px; font-size:0.8em; opacity:0.6;">全账户资金增长趋势</div>
        <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible;">
            <line x1="0" y1="${height - ((0 - minVal) / range) * height}" x2="${width}" y2="${height - ((0 - minVal) / range) * height}" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="4" />
            <polyline points="${getPoints(curves.back)}" fill="none" stroke="${c.back}" stroke-width="2" stroke-opacity="0.5" />
            <polyline points="${getPoints(curves.demo)}" fill="none" stroke="${c.demo}" stroke-width="2" stroke-opacity="0.7" />
            <polyline points="${getPoints(curves.live)}" fill="none" stroke="${c.live}" stroke-width="3" />
        </svg>
        <div style="display:flex; justify-content:center; gap:15px; margin-top:10px; font-size:0.8em;">
            <span style="color:${c.live}">● 实盘</span>
            <span style="color:${c.demo}">● 模拟</span>
            <span style="color:${c.back}">● 回测</span>
        </div>`;
    }

    function renderCycle() {
        // 逻辑来自 pa-view-cycle.js
        // 简化版：直接统计
        let cycleStats = {};
        trades.filter(t => t.type === "Live").forEach(t => {
            let cycle = (t.market_cycle || "Unknown").toString();
            if (cycle.includes("/")) cycle = cycle.split("/")[1].trim();
            cycleStats[cycle] = (cycleStats[cycle] || 0) + t.pnl;
        });
        
        let html = `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:10px;">`;
        Object.entries(cycleStats).sort((a,b) => b[1] - a[1]).forEach(([name, pnl]) => {
            let color = pnl > 0 ? c.live : pnl < 0 ? c.loss : "gray";
            let bg = pnl > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";
            html += `
            <div style="background:${bg}; border-radius:8px; padding:15px; text-align:center;">
                <div style="font-size:0.8em; opacity:0.7; margin-bottom:5px;">${name}</div>
                <div style="font-size:1.4em; font-weight:bold; color:${color};">${pnl>0?"+":""}${pnl}</div>
            </div>`;
        });
        return html + "</div>";
    }

    function renderTuition() {
        // 逻辑来自 pa-view-tuition.js
        if (stats.tuition === 0) return `<div style="text-align:center; padding:40px; color:${c.live};">🎉 完美执行！近期无纪律性亏损。</div>`;
        
        let sortedErrors = Object.entries(stats.errors).sort((a, b) => b[1] - a[1]);
        return `
        <div style="display:flex; align-items:center; justify-content:center; margin-bottom:20px;">
            <div style="font-size:3em;">💸</div>
            <div style="margin-left:15px;">
                <div style="font-size:0.9em; opacity:0.6;">总学费 (Tuition Paid)</div>
                <div style="font-size:1.8em; font-weight:bold; color:${c.loss};">-$${stats.tuition}</div>
            </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
            ${sortedErrors.map(([name, cost]) => {
                let percent = Math.round((cost / stats.tuition) * 100);
                return `<div style="display:flex; align-items:center; font-size:0.9em;">
                    <div style="width:100px; opacity:0.9;">${name}</div>
                    <div style="flex:1; background:rgba(255,255,255,0.05); height:8px; border-radius:4px; overflow:hidden; margin:0 15px;">
                        <div style="width:${percent}%; height:100%; background:${c.loss};"></div>
                    </div>
                    <div style="width:60px; text-align:right; font-weight:bold; color:${c.loss};">-$${cost}</div>
                </div>`;
            }).join("")}
        </div>`;
    }

    function switchTab(id) {
        activeTab = id;
        // Update Header Styles
        Array.from(header.children).forEach(btn => {
            if (btn.dataset.tab === id) {
                btn.style.opacity = "1";
                btn.style.borderBottom = "2px solid " + c.accent;
                btn.style.background = "rgba(255,255,255,0.05)";
            } else {
                btn.style.opacity = "0.6";
                btn.style.borderBottom = "2px solid transparent";
                btn.style.background = "transparent";
            }
        });
        // Update Content
        if (id === "curve") contentArea.innerHTML = renderCurve();
        else if (id === "cycle") contentArea.innerHTML = renderCycle();
        else if (id === "tuition") contentArea.innerHTML = renderTuition();
    }

    // Init
    switchTab("curve");
    root.appendChild(tabContainer);
}

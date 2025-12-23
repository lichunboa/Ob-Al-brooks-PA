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

    // 热力图逻辑 (还原 pa-view-account.js 的 7列日历布局)
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

    let gridHtml = `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;">`;
    for (let d = 1; d <= daysInMonth; d++) {
        let pnl = dailyMap[d];
        let hasTrade = pnl !== undefined;
        let bg = "rgba(255, 255, 255, 0.03)";
        let border = "1px solid rgba(255, 255, 255, 0.05)";
        let content = `<div style="font-size:0.65em; color:var(--text-muted); opacity:0.5;">${d}</div>`;
        
        if (hasTrade) {
            if (pnl > 0) {
                bg = "rgba(34, 197, 94, 0.15)"; border = "1px solid rgba(34, 197, 94, 0.3)";
                content += `<div style="font-size:0.7em; font-weight:bold; color:#4ade80;">+${pnl.toFixed(0)}</div>`;
            } else if (pnl < 0) {
                bg = "rgba(239, 68, 68, 0.15)"; border = "1px solid rgba(239, 68, 68, 0.3)";
                content += `<div style="font-size:0.7em; font-weight:bold; color:#f87171;">${pnl.toFixed(0)}</div>`;
            } else {
                bg = "rgba(148, 163, 184, 0.15)"; border = "1px solid rgba(148, 163, 184, 0.3)";
                content += `<div style="font-size:0.7em; font-weight:bold; color:#94a3b8;">0</div>`;
            }
        }
        gridHtml += `
            <div style="aspect-ratio: 1; background: ${bg}; border: ${border}; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s;" title="${targetMonth}-${d}: ${hasTrade ? pnl : 0}">
                ${content}
            </div>`;
    }
    gridHtml += `</div>`;

    // 辅助函数：生成迷你卡片
    function miniCard(title, stats, color, icon) {
        return `
        <div style="flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-size:0.85em; font-weight:600; color:${color}; display:flex; align-items:center; gap:6px;"><span>${icon}</span> ${title}</div>
                <div style="font-size:0.65em; opacity:0.5;">${stats.count} 笔</div>
            </div>
            <div>
                <div style="font-size:1.2em; font-weight:bold; color:${stats.pnl >= 0 ? color : c.loss};">${stats.pnl > 0 ? "+" : ""}${stats.pnl}<span style="font-size:0.6em; opacity:0.6;">$</span></div>
                <div style="font-size:0.7em; opacity:0.7; margin-top:2px;">胜率: ${stats.wr}%</div>
            </div>
        </div>`;
    }

    root.innerHTML = `
    <div style="${c.cardBg}; padding: 15px;">
        <div style="display:flex; gap:15px; margin-bottom: 15px;">
            <!-- 实盘大卡片 -->
            <div style="flex:1.5; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.02) 100%); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 10px; padding: 15px; display: flex; flex-direction: column; justify-content: center;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div style="color:${c.live}; font-weight:800; font-size:1.1em;">🟢 实盘账户</div>
                    <div style="font-size:0.75em; background:${c.live}20; color:${c.live}; padding:2px 8px; border-radius:10px;">Live</div>
                </div>
                <div style="display:flex; align-items:baseline; gap:4px;">
                    <div style="font-size:2.4em; font-weight:900; color:${live.pnl >= 0 ? c.live : c.loss}; line-height:1;">${live.pnl > 0 ? "+" : ""}${live.pnl}</div>
                    <div style="font-size:0.9em; opacity:0.6;">$</div>
                </div>
                <div style="display:flex; gap:15px; margin-top:10px; font-size:0.85em; opacity:0.8;">
                    <div>📦 ${live.count} 笔交易</div>
                    <div>🎯 ${live.wr}% 胜率</div>
                </div>
            </div>
            <!-- 模拟与回测 -->
            <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
                ${miniCard("模拟盘", demo, c.demo, "🔵")}
                ${miniCard("复盘回测", back, c.back, "🟠")}
            </div>
        </div>

        <!-- 热力图 -->
        <div style="padding-top:12px; border-top:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div style="font-size:0.85em; font-weight:600; opacity:0.9;">📅 盈亏日历 (${targetMonth})</div>
                <div style="font-size:0.65em; opacity:0.5;">仅限实盘 (Live Only)</div>
            </div>
            ${gridHtml}
        </div>
    </div>
    `;

    // --- 3. 下部：多维分析 (Consolidated Analytics) ---
    // 移除 Tab 系统，改为垂直堆叠布局

    // A. 资金曲线 (Capital Growth)
    let curves = { live: [0], demo: [0], back: [0] };
    let cum = { live: 0, demo: 0, back: 0 };
    let stratStats = {};

    for (let t of tradesAsc) {
        let pnl = t.pnl;
        let acct = t.type.toLowerCase();
        if (acct === "live") { cum.live += pnl; curves.live.push(cum.live); }
        else if (acct === "demo") { cum.demo += pnl; curves.demo.push(cum.demo); }
        else if (acct === "backtest") { cum.back += pnl; curves.back.push(cum.back); }

        // 策略统计
        let s = t.setup || "Unknown";
        if (!stratStats[s]) stratStats[s] = { win: 0, total: 0 };
        stratStats[s].total++;
        if (pnl > 0) stratStats[s].win++;
    }

    const allValues = [...curves.live, ...curves.demo, ...curves.back];
    const maxVal = Math.max(...allValues, 100);
    const minVal = Math.min(...allValues, -100);
    const range = maxVal - minVal;
    const width = 600; const height = 200;

    function getPoints(data) {
        if (data.length < 2) return `0,${height} ${width},${height}`;
        let step = width / (data.length - 1);
        return data.map((v, i) => {
            let x = i * step;
            let y = height - ((v - minVal) / range) * height;
            return `${x},${y}`;
        }).join(" ");
    }

    // 策略排行
    let topStrats = Object.keys(stratStats)
        .map((k) => ({
        name: k,
        wr: Math.round((stratStats[k].win / stratStats[k].total) * 100),
        total: stratStats[k].total,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    // B. R-Multiples & Mindset
    const recentTrades = tradesAsc.slice(-30);
    let maxR = Math.max(...recentTrades.map(t => Math.abs(t.r || 0))) || 1;
    
    let barsHtml = recentTrades.map(t => {
        let r = t.r || 0;
        let h = Math.round((Math.abs(r) / maxR) * 40);
        if (h < 3) h = 3;
        let color = c.loss;
        if (r >= 0) {
            let type = (t.type || "").toLowerCase();
            if (type === "live") color = c.live;
            else if (type === "demo") color = c.demo;
            else color = c.back;
        }
        return `<div style="width:6px; height:${h}px; background:${color}; border-radius:2px; opacity:${r>=0?1:0.6};" title="${t.name} R:${r.toFixed(2)}"></div>`;
    }).join("");

    const recentLive = tradesAsc.filter(t => (t.type||"").toLowerCase() === "live").slice(-7);
    let tilt = 0, fomo = 0;
    for (let t of recentLive) {
        let err = (t.error || "").toString();
        if (err.includes("Tilt") || err.includes("上头")) tilt++;
        if (err.includes("FOMO") || err.includes("追单")) fomo++;
    }
    let mindStatus = (tilt + fomo === 0) ? "🛡️ 状态极佳" : (tilt + fomo < 3) ? "⚠️ 有点起伏" : "🔥 极度危险";
    let mindColor = (tilt + fomo === 0) ? c.live : (tilt + fomo < 3) ? c.back : c.loss;

    // C. 环境分析 (Context)
    let cycleStats = {};
    trades.filter(t => t.type === "Live").forEach(t => {
            let cycle = t.market_cycle || "Unknown";
            // 清洗逻辑
            if (cycle.includes("/")) cycle = cycle.split("/")[1].trim();
            else if (cycle.includes("(")) cycle = cycle.split("(")[0].trim();
            
            if (!cycleStats[cycle]) cycleStats[cycle] = 0;
            cycleStats[cycle] += t.pnl;
    });
    let sortedCycles = Object.keys(cycleStats)
        .map((k) => ({ name: k, pnl: cycleStats[k] }))
        .sort((a, b) => b.pnl - a.pnl);

    let cycleHtml = `
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${sortedCycles.map(cy => {
            let color = cy.pnl > 0 ? c.live : cy.pnl < 0 ? c.loss : "gray";
            let bg = cy.pnl > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";
            return `
            <div style="background:${bg}; border-radius:6px; padding:8px 12px; flex:1; min-width:100px; text-align:center; border:1px solid ${color}33;">
                <div style="font-size:0.8em; opacity:0.8; margin-bottom:2px;">${cy.name}</div>
                <div style="font-weight:800; color:${color}; font-size:1.1em;">${cy.pnl > 0 ? "+" : ""}${cy.pnl.toFixed(1)}</div>
            </div>`;
        }).join("")}
    </div>`;

    // D. 错误归因 (Tuition)
    let tuitionHtml = "";
    if (stats.tuition === 0) {
        tuitionHtml = `<div style="text-align:center; padding:20px; color:${c.live}; opacity:0.8; font-size:0.9em;">🎉 完美执行！近期无纪律性亏损。</div>`;
    } else {
        let sortedErrors = Object.entries(stats.errors).sort((a, b) => b[1] - a[1]);
        tuitionHtml = `
        <div style="display:flex; align-items:center; margin-bottom:15px;">
            <div style="font-size:1.5em;">💸</div>
            <div style="margin-left:10px;">
                <div style="font-size:0.8em; opacity:0.6;">总学费 (Tuition)</div>
                <div style="font-size:1.2em; font-weight:bold; color:${c.loss};">-$${stats.tuition}</div>
            </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            ${sortedErrors.slice(0, 5).map(([name, cost]) => {
                let percent = Math.round((cost / stats.tuition) * 100);
                return `<div style="display:flex; align-items:center; font-size:0.85em;">
                    <div style="width:90px; opacity:0.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                    <div style="flex:1; background:rgba(255,255,255,0.05); height:6px; border-radius:3px; overflow:hidden; margin:0 10px;">
                        <div style="width:${percent}%; height:100%; background:${c.loss};"></div>
                    </div>
                    <div style="width:50px; text-align:right; font-weight:bold; color:${c.loss};">-$${cost}</div>
                </div>`;
            }).join("")}
        </div>`;
    }

    // --- 4. 最终渲染 (Final Render) ---
    const analyticsContainer = dv.el("div", "", { attr: { style: c.cardBg + "; padding:20px;" } });
    analyticsContainer.innerHTML = `
        <!-- 1. 资金曲线 -->
        <div style="text-align:center; margin-bottom:10px; font-size:0.8em; opacity:0.6;">全账户资金增长趋势</div>
        <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible; background:rgba(0,0,0,0.2); border-radius:8px;">
            <line x1="0" y1="${height - ((0 - minVal) / range) * height}" x2="${width}" y2="${height - ((0 - minVal) / range) * height}" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="4" />
            <polyline points="${getPoints(curves.back)}" fill="none" stroke="${c.back}" stroke-width="2" stroke-opacity="0.5" stroke-dasharray="2" />
            <polyline points="${getPoints(curves.demo)}" fill="none" stroke="${c.demo}" stroke-width="2" stroke-opacity="0.7" />
            <polyline points="${getPoints(curves.live)}" fill="none" stroke="${c.live}" stroke-width="3" />
        </svg>
        <div style="display:flex; justify-content:center; gap:15px; margin-top:10px; font-size:0.8em; margin-bottom:25px;">
            <span style="color:${c.live}">● 实盘 $${cum.live.toFixed(0)}</span>
            <span style="color:${c.demo}">● 模拟 $${cum.demo.toFixed(0)}</span>
            <span style="color:${c.back}">● 回测 $${cum.back.toFixed(0)}</span>
        </div>

        <!-- 2. R-Multiples & Mindset -->
        <div style="display:flex; gap:20px; margin-bottom:25px; padding-bottom:20px; border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="flex:2;">
                <div style="font-size:0.8em; opacity:0.6; margin-bottom:8px;">📈 综合趋势 (R-Multiples)</div>
                <div style="display:flex; align-items:flex-end; gap:4px; height:50px;">
                    ${barsHtml || '<div style="opacity:0.5; font-size:0.8em;">暂无数据</div>'}
                </div>
            </div>
            <div style="flex:1; border-left:1px solid rgba(255,255,255,0.1); padding-left:20px; display:flex; flex-direction:column; justify-content:center;">
                 <div style="font-size:0.8em; opacity:0.6; margin-bottom:5px;">🧠 实盘心态</div>
                 <div style="font-size:1.2em; font-weight:bold; color:${mindColor};">${mindStatus}</div>
                 <div style="font-size:0.7em; opacity:0.5; margin-top:4px;">FOMO: ${fomo} | Tilt: ${tilt}</div>
            </div>
        </div>

        <!-- 3. 详细分析网格 (Context & Tuition & Strategy) -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:25px;">
            <!-- 左列: 环境与策略 -->
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div>
                    <div style="font-size:0.8em; opacity:0.6; margin-bottom:10px;">🌪️ 环境表现</div>
                    ${cycleHtml}
                </div>
                <div>
                    <div style="font-size:0.8em; opacity:0.6; margin-bottom:8px;">📊 热门策略</div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${topStrats.map(s => `
                            <div style="display:flex; justify-content:space-between; font-size:0.85em; background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:4px;">
                                <span>${s.name}</span>
                                <span><span style="color:${s.wr > 50 ? c.live : c.back}">${s.wr}%</span> <span style="opacity:0.4">(${s.total})</span></span>
                            </div>
                        `).join("")}
                    </div>
                </div>
            </div>

            <!-- 右列: 错误与建议 -->
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div>
                    <div style="font-size:0.8em; opacity:0.6; margin-bottom:10px;">💸 错误归因</div>
                    <div style="background:rgba(255,255,255,0.02); border-radius:8px; padding:15px;">
                        ${tuitionHtml}
                    </div>
                </div>
                <div>
                     <div style="font-size:0.8em; opacity:0.6; margin-bottom:8px;">💡 系统建议</div>
                     <div style="font-size:0.8em; opacity:0.8; line-height:1.5; background:rgba(59, 130, 246, 0.1); padding:10px; border-radius:6px; border-left:3px solid ${c.demo};">
                        当前表现最好的策略是 <b style="color:${c.demo}">${topStrats[0]?.name || "无"}</b>。<br>
                        建议在 <b style="color:${cum.live < 0 ? c.back : c.live}">${cum.live < 0 ? "回测" : "实盘"}</b> 中继续保持执行。
                     </div>
                </div>
            </div>
        </div>
    `;

    root.appendChild(analyticsContainer);
}


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

    // --- 汉化与策略映射 ---
    const cycleMap = {
        "Strong Trend": "强趋势", "Weak Trend": "弱趋势", "Trading Range": "交易区间",
        "Breakout": "突破", "Channel": "通道", "Broad Channel": "宽通道", "Tight Channel": "窄通道"
    };
    // 基础映射
    let setupMap = {
        "Trend Pullback": "趋势回调", "Trend Breakout": "趋势突破", "Reversal": "反转",
        "Wedge": "楔形", "Double Top/Bottom": "双顶/底", "MTR": "主要趋势反转",
        "Final Flag": "末端旗形", "Opening Reversal": "开盘反转"
    };
    // 尝试从策略仓库读取最新策略名 (如果有)
    try {
        // 搜索 "Notes 笔记" 文件夹 (根据用户实际结构调整)
        let stratPages = dv.pages(`"Notes 笔记"`);
        if (stratPages && stratPages.length > 0) {
            stratPages.forEach(p => {
                let fName = p.file.name;
                
                // 1. 如果有别名，映射别名 -> 文件名
                if (p.aliases && p.aliases.length > 0) {
                    p.aliases.forEach(a => setupMap[a] = fName);
                }
                
                // 2. 尝试反向匹配：如果文件名包含英文关键词，则更新映射
                // 例如: 文件名 "交易主要趋势反转MTR" 包含 "MTR" -> setupMap["MTR"] = "交易主要趋势反转MTR"
                for (let key in setupMap) {
                    if (fName.toLowerCase().includes(key.toLowerCase())) {
                        setupMap[key] = fName;
                    }
                }
                
                // 3. 确保文件名本身也能被识别
                setupMap[fName] = fName;
            });
        }
    } catch (e) { console.log("策略仓库读取失败", e); }

    function trans(map, key) {
        if (!key) return "未知";
        // 精确匹配优先
        if (map[key]) return map[key];
        // 模糊匹配
        for (let k in map) {
            if (key.toLowerCase().includes(k.toLowerCase())) return map[k];
        }
        return key;
    }

    // --- 2. 数据处理 ---
    // 账户统计
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

    // 日历数据
    let targetMonth = moment().format("YYYY-MM");
    const lastLiveTrade = trades.filter(t => t.type === "Live").sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lastLiveTrade) targetMonth = lastLiveTrade.date.substring(0, 7);
    const daysInMonth = moment(targetMonth, "YYYY-MM").daysInMonth();
    
    let dailyMap = {};
    trades.filter((t) => t.date.startsWith(targetMonth)).forEach((t) => {
        let day = parseInt(t.date.split("-")[2]);
        let val = parseFloat(t.pnl);
        if (isNaN(val)) val = 0;
        
        if (!dailyMap[day]) dailyMap[day] = { total: 0, types: new Set() };
        dailyMap[day].total += val;
        dailyMap[day].types.add(t.type);
    });

    // 资金曲线数据
    let curves = { live: [0], demo: [0], back: [0] };
    let cum = { live: 0, demo: 0, back: 0 };
    let stratStats = {};

    for (let t of tradesAsc) {
        let pnl = t.pnl;
        let acct = t.type.toLowerCase();
        if (acct === "live") { cum.live += pnl; curves.live.push(cum.live); }
        else if (acct === "demo") { cum.demo += pnl; curves.demo.push(cum.demo); }
        else if (acct === "backtest") { cum.back += pnl; curves.back.push(cum.back); }

        let s = t.setup || "Unknown";
        if (!stratStats[s]) stratStats[s] = { win: 0, total: 0 };
        stratStats[s].total++;
        if (pnl > 0) stratStats[s].win++;
    }

    // 曲线坐标计算
    const allValues = [...curves.live, ...curves.demo, ...curves.back];
    const maxVal = Math.max(...allValues, 100);
    const minVal = Math.min(...allValues, -100);
    const range = maxVal - minVal;
    const width = 600; const height = 180;
    const padding = 30; // 增加内边距给坐标轴

    function getPoints(data) {
        if (data.length < 2) return `${padding},${height-padding} ${width},${height-padding}`;
        let step = (width - padding) / (data.length - 1);
        return data.map((v, i) => {
            let x = padding + i * step;
            let y = (height - padding) - ((v - minVal) / range) * (height - 2 * padding);
            return `${x},${y}`;
        }).join(" ");
    }
    
    // 获取日期范围
    const startDate = tradesAsc.length > 0 ? tradesAsc[0].date : "";
    const endDate = tradesAsc.length > 0 ? tradesAsc[tradesAsc.length-1].date : "";

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

    // --- 3. HTML 生成 ---
    
    // 日历 HTML
    let gridHtml = `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px;">`;
    for (let d = 1; d <= daysInMonth; d++) {
        let data = dailyMap[d];
        let hasTrade = data !== undefined;
        let pnl = hasTrade ? data.total : 0;
        
        let bg = "rgba(255, 255, 255, 0.03)";
        let border = "1px solid rgba(255, 255, 255, 0.05)";
        let content = `<div style="font-size:0.6em; color:var(--text-muted); opacity:0.5; margin-bottom:2px;">${d}</div>`;
        
        if (hasTrade) {
            let isWin = pnl > 0;
            let pnlColor = isWin ? "#4ade80" : "#f87171";
            if (pnl === 0) pnlColor = "#94a3b8";
            
            // 背景色根据总盈亏决定，但更淡
            bg = isWin ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)";
            border = `1px solid ${pnlColor}30`;
            
            content += `<div style="font-size:0.65em; font-weight:bold; color:${pnlColor}; line-height:1;">${pnl > 0 ? "+" : ""}${pnl.toFixed(0)}</div>`;
            
            // 底部账户类型条
            let bars = "";
            if (data.types.has("Live")) bars += `<div style="flex:1; background:${c.live}; border-radius:1px;"></div>`;
            if (data.types.has("Demo")) bars += `<div style="flex:1; background:${c.demo}; border-radius:1px;"></div>`;
            if (data.types.has("Backtest")) bars += `<div style="flex:1; background:${c.back}; border-radius:1px;"></div>`;
            
            content += `<div style="display:flex; gap:1px; height:4px; width:90%; margin-top:3px; opacity:0.9;">${bars}</div>`;
        }
        gridHtml += `
            <div style="aspect-ratio: 1; background: ${bg}; border: ${border}; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s;" title="${targetMonth}-${d}: ${hasTrade ? pnl : 0}">
                ${content}
            </div>`;
    }
    gridHtml += `</div>`;

    // 策略排行
    let topStrats = Object.keys(stratStats)
        .map((k) => ({
        name: trans(setupMap, k),
        wr: Math.round((stratStats[k].win / stratStats[k].total) * 100),
        total: stratStats[k].total,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    // R-Multiples (综合趋势) - 优化为上下柱状图
    const recentTrades = tradesAsc.slice(-30);
    let maxR = Math.max(...recentTrades.map(t => Math.abs(t.r || 0))) || 1;
    let avgR = (recentTrades.reduce((acc, t) => acc + (t.r || 0), 0) / (recentTrades.length || 1)).toFixed(2);
    
    // R图表参数
    const rHeight = 80; // 增加高度
    const rZeroY = rHeight / 2;
    const rScale = (rHeight / 2 - 5) / maxR; // 留边距

    // 柱状图参数
    const barWidth = 8;
    const barGap = 4;
    const step = barWidth + barGap;

    let barsHtml = recentTrades.map((t, i) => {
        let r = t.r || 0;
        let h = Math.abs(r) * rScale;
        if (h < 3) h = 3; // 最小高度
        
        let color = c.loss;
        if (r >= 0) {
            let type = (t.type || "").toLowerCase();
            if (type === "live") color = c.live;
            else if (type === "demo") color = c.demo;
            else color = c.back;
        }
        
        // 计算位置: 正数向上生长，负数向下生长
        let top = r >= 0 ? (rZeroY - h) : rZeroY;
        
        return `<div style="position:absolute; left:${i * step}px; top:${top}px; width:${barWidth}px; height:${h}px; background:${color}; border-radius:2px;" title="${t.date} | ${t.name} | R: ${t.r}"></div>`;
    }).join("");
    
    // R图表容器宽度
    let rWidth = Math.max(recentTrades.length * step, 200); // 最小宽度保证布局

    // 心态分析
    const recentLive = tradesAsc.filter(t => (t.type||"").toLowerCase() === "live").slice(-10);
    let tilt = 0, fomo = 0, hesitation = 0;
    for (let t of recentLive) {
        let err = (t.error || "").toString().toLowerCase();
        if (err.includes("tilt") || err.includes("上头")) tilt++;
        if (err.includes("fomo") || err.includes("追单")) fomo++;
        if (err.includes("hesitation") || err.includes("犹豫")) hesitation++;
    }
    let mindStatus = "🛡️ 状态极佳";
    let mindColor = c.live;
    if (tilt > 0 || fomo > 1) { mindStatus = "🔥 极度危险"; mindColor = c.loss; }
    else if (fomo > 0 || hesitation > 0) { mindStatus = "⚠️ 有点起伏"; mindColor = c.back; }

    // 环境分析
    let cycleStats = {};
    trades.filter(t => t.type === "Live").forEach(t => {
            let cycle = t.market_cycle || "Unknown";
            if (cycle.includes("/")) cycle = cycle.split("/")[1].trim();
            else if (cycle.includes("(")) cycle = cycle.split("(")[0].trim();
            if (!cycleStats[cycle]) cycleStats[cycle] = 0;
            cycleStats[cycle] += t.pnl;
    });
    let sortedCycles = Object.keys(cycleStats)
        .map((k) => ({ name: trans(cycleMap, k), pnl: cycleStats[k] }))
        .sort((a, b) => b.pnl - a.pnl);

    let cycleHtml = `
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${sortedCycles.map(cy => {
            let color = cy.pnl > 0 ? c.live : cy.pnl < 0 ? c.loss : "gray";
            let bg = cy.pnl > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";
            return `
            <div style="background:${bg}; border-radius:6px; padding:6px 10px; flex:1; min-width:80px; text-align:center; border:1px solid ${color}33;">
                <div style="font-size:0.75em; opacity:0.8; margin-bottom:2px;">${cy.name}</div>
                <div style="font-weight:800; color:${color}; font-size:1em;">${cy.pnl > 0 ? "+" : ""}${cy.pnl.toFixed(1)}</div>
            </div>`;
        }).join("")}
    </div>`;

    // 错误归因
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

    // 智能建议
    let suggestion = "";
    let bestStrat = topStrats[0]?.name || "无";
    let liveWr = live.wr;
    
    if (tilt > 0) {
        suggestion = `检测到 <b style="color:${c.loss}">情绪化交易 (Tilt)</b> 迹象。建议立即停止实盘，强制休息 24 小时。`;
    } else if (liveWr < 40 && live.count > 5) {
        suggestion = `实盘胜率偏低 (${liveWr}%)。建议暂停实盘，回到 <b style="color:${c.demo}">模拟盘</b> 练习 <b style="color:${c.live}">${bestStrat}</b> 策略，直到连续盈利。`;
    } else if (cum.live < 0 && cum.back > 0) {
        suggestion = `回测表现良好但实盘亏损。可能是执行力问题。建议降低仓位，专注于 <b style="color:${c.live}">${bestStrat}</b>。`;
    } else {
        suggestion = `当前状态良好。表现最好的策略是 <b style="color:${c.demo}">${bestStrat}</b>。建议继续保持一致性。`;
    }

    // --- 4. 最终渲染 ---
    root.innerHTML = `
    <div style="${c.cardBg}; padding: 20px;">
        <!-- 第一部分：账户与日历 -->
        <div style="display:flex; gap:20px; margin-bottom: 25px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:20px;">
            <!-- 左侧：账户卡片 -->
            <div style="flex:1; display:flex; flex-direction:column; gap:10px;">
                <!-- 实盘大卡片 -->
                <div style="flex:1; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.02) 100%); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 10px; padding: 15px; display: flex; flex-direction: column; justify-content: center;">
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
                <!-- 模拟与回测 (横向排列) -->
                <div style="display:flex; gap:10px;">
                    ${miniCard("模拟盘", demo, c.demo, "🔵")}
                    ${miniCard("复盘回测", back, c.back, "🟠")}
                </div>
            </div>

            <!-- 右侧：日历 (更紧凑) -->
            <div style="width: 240px; flex-shrink:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div style="font-size:0.85em; font-weight:600; opacity:0.9;">📅 盈亏日历 (${targetMonth})</div>
                    <div style="font-size:0.65em; opacity:0.5;">All Accounts</div>
                </div>
                ${gridHtml}
            </div>
        </div>

        <!-- 第二部分：资金曲线 (带坐标轴) -->
        <div style="margin-bottom:25px;">
            <div style="text-align:center; margin-bottom:10px; font-size:0.8em; opacity:0.6;">全账户资金增长趋势</div>
            <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible; background:rgba(0,0,0,0.2); border-radius:8px;">
                <!-- 坐标轴线 -->
                <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height-padding}" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
                <line x1="${padding}" y1="${height-padding}" x2="${width}" y2="${height-padding}" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
                
                <!-- 0轴 -->
                <line x1="${padding}" y1="${(height-padding) - ((0 - minVal) / range) * (height-2*padding)}" x2="${width}" y2="${(height-padding) - ((0 - minVal) / range) * (height-2*padding)}" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="4" />
                
                <!-- Y轴标签 -->
                <text x="${padding-5}" y="${padding+5}" fill="rgba(255,255,255,0.3)" font-size="10" text-anchor="end">${maxVal.toFixed(0)}</text>
                <text x="${padding-5}" y="${height-padding}" fill="rgba(255,255,255,0.3)" font-size="10" text-anchor="end">${minVal.toFixed(0)}</text>
                
                <!-- X轴标签 (日期) -->
                <text x="${padding}" y="${height-5}" fill="rgba(255,255,255,0.3)" font-size="10" text-anchor="start">${startDate}</text>
                <text x="${width}" y="${height-5}" fill="rgba(255,255,255,0.3)" font-size="10" text-anchor="end">${endDate}</text>

                <!-- 曲线 -->
                <polyline points="${getPoints(curves.back)}" fill="none" stroke="${c.back}" stroke-width="2" stroke-opacity="0.5" stroke-dasharray="2" />
                <polyline points="${getPoints(curves.demo)}" fill="none" stroke="${c.demo}" stroke-width="2" stroke-opacity="0.7" />
                <polyline points="${getPoints(curves.live)}" fill="none" stroke="${c.live}" stroke-width="3" />
            </svg>
            <div style="display:flex; justify-content:center; gap:15px; margin-top:10px; font-size:0.8em;">
                <span style="color:${c.live}">● 实盘 $${cum.live.toFixed(0)}</span>
                <span style="color:${c.demo}">● 模拟 $${cum.demo.toFixed(0)}</span>
                <span style="color:${c.back}">● 回测 $${cum.back.toFixed(0)}</span>
            </div>
        </div>

        <!-- 第三部分：R-Multiples & Mindset -->
        <div style="display:flex; gap:20px; margin-bottom:25px; padding-bottom:20px; border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="flex:2;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div style="font-size:0.8em; opacity:0.6;">📈 综合趋势 (R-Multiples)</div>
                    <div style="display:flex; gap:10px; font-size:0.65em; opacity:0.6;">
                        <span style="display:flex; align-items:center; gap:3px;"><div style="width:6px; height:6px; background:${c.live}; border-radius:50%;"></div>实盘赢</span>
                        <span style="display:flex; align-items:center; gap:3px;"><div style="width:6px; height:6px; background:${c.loss}; border-radius:50%;"></div>亏损(红)</span>
                        <span>Avg R: ${avgR}</span>
                    </div>
                </div>
                <!-- R图表容器: 使用 relative 定位 -->
                <div style="position:relative; height:${rHeight}px; width:100%; overflow-x:auto; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <!-- 0轴线 -->
                    <div style="position:absolute; left:0; right:0; top:${rZeroY}px; height:1px; background:rgba(255,255,255,0.2); border-top:1px dashed rgba(255,255,255,0.3);"></div>
                    <div style="position:absolute; left:0; top:${rZeroY-8}px; font-size:0.6em; opacity:0.3;">0R</div>
                    ${barsHtml || '<div style="opacity:0.5; font-size:0.8em; padding:20px;">暂无数据</div>'}
                </div>
            </div>
            <div style="flex:1; border-left:1px solid rgba(255,255,255,0.1); padding-left:20px; display:flex; flex-direction:column; justify-content:center;">
                 <div style="font-size:0.8em; opacity:0.6; margin-bottom:5px;">🧠 实盘心态</div>
                 <div style="font-size:1.2em; font-weight:bold; color:${mindColor};">${mindStatus}</div>
                 <div style="font-size:0.7em; opacity:0.5; margin-top:4px;">FOMO: ${fomo} | Tilt: ${tilt} | 犹豫: ${hesitation}</div>
            </div>
        </div>

        <!-- 第四部分：详细分析网格 -->
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
                        ${suggestion}
                     </div>
                </div>
            </div>
        </div>
    `;
}


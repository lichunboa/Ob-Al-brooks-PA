/* 文件名: Scripts/pa-view-account.js
   用途: 账户资金概览 + 月度热力图
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");

if (window.paData) {
  const trades = window.paData.trades; // 获取所有交易
  const c = cfg.colors;

  // 1. 统计各账户数据
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

  // 2. 热力图数据 (智能识别月份)
  // 逻辑: 如果有实盘交易，取最近一笔实盘交易的月份；否则取当前系统月份
  let targetMonth = moment().format("YYYY-MM");
  const lastLiveTrade = trades.filter(t => t.type === "Live").sort((a, b) => b.date.localeCompare(a.date))[0];
  
  if (lastLiveTrade) {
      // 提取 YYYY-MM
      targetMonth = lastLiveTrade.date.substring(0, 7);
  }
  
  const daysInMonth = moment(targetMonth, "YYYY-MM").daysInMonth();

  let dailyMap = {};
  trades
    .filter((t) => t.type === "Live" && t.date.startsWith(targetMonth))
    .forEach((t) => {
      let day = parseInt(t.date.split("-")[2]);
      // Ensure pnl is a number to prevent string concatenation
      let val = parseFloat(t.pnl);
      if (isNaN(val)) val = 0;
      dailyMap[day] = (dailyMap[day] || 0) + val;
    });

  let gridHtml = "";
  // 使用 Grid 布局优化 UI
  gridHtml += `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;">`;
  
  for (let d = 1; d <= daysInMonth; d++) {
    let pnl = dailyMap[d];
    let hasTrade = pnl !== undefined;
    
    // 样式逻辑
    let bg = "rgba(255, 255, 255, 0.03)";
    let border = "1px solid rgba(255, 255, 255, 0.05)";
    let content = `<div style="font-size:0.7em; color:var(--text-muted); opacity:0.5;">${d}</div>`;
    
    if (hasTrade) {
        if (pnl > 0) {
            bg = "rgba(34, 197, 94, 0.15)"; // Green tint
            border = "1px solid rgba(34, 197, 94, 0.3)";
            content += `<div style="font-size:0.75em; font-weight:bold; color:#4ade80;">+${pnl.toFixed(0)}</div>`;
        } else if (pnl < 0) {
            bg = "rgba(239, 68, 68, 0.15)"; // Red tint
            border = "1px solid rgba(239, 68, 68, 0.3)";
            content += `<div style="font-size:0.75em; font-weight:bold; color:#f87171;">${pnl.toFixed(0)}</div>`;
        } else {
            bg = "rgba(148, 163, 184, 0.15)"; // Gray tint
            border = "1px solid rgba(148, 163, 184, 0.3)";
            content += `<div style="font-size:0.75em; font-weight:bold; color:#94a3b8;">0</div>`;
        }
    }

    gridHtml += `
        <div style="
            aspect-ratio: 1;
            background: ${bg};
            border: ${border};
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            cursor: default;
        " title="${targetMonth}-${d} PnL: ${hasTrade ? pnl : 0}">
            ${content}
        </div>`;
  }
  gridHtml += `</div>`;

  // 3. 渲染
  const root = dv.el("div", "", { attr: { style: c.cardBg } });
  
  // 辅助函数：生成迷你卡片
  function miniCard(title, stats, color, icon) {
      return `
      <div style="
          flex: 1;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
      ">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <div style="font-size:0.9em; font-weight:600; color:${color}; display:flex; align-items:center; gap:6px;">
                  <span>${icon}</span> ${title}
              </div>
              <div style="font-size:0.7em; opacity:0.5;">${stats.count} 笔</div>
          </div>
          <div>
              <div style="font-size:1.4em; font-weight:bold; color:${stats.pnl >= 0 ? color : c.loss};">
                  ${stats.pnl > 0 ? "+" : ""}${stats.pnl}<span style="font-size:0.6em; opacity:0.6;">$</span>
              </div>
              <div style="font-size:0.75em; opacity:0.7; margin-top:2px;">
                  胜率: ${stats.wr}%
              </div>
          </div>
      </div>`;
  }

  root.innerHTML = `
    <div style="display:flex; gap:15px; margin-bottom: 20px;">
        <!-- 实盘大卡片 -->
        <div style="
            flex:1.5; 
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.02) 100%);
            border: 1px solid rgba(16, 185, 129, 0.2);
            border-radius: 10px;
            padding: 15px;
            display: flex;
            flex-direction: column;
            justify-content: center;
        ">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div style="color:${c.live}; font-weight:800; font-size:1.2em;">🟢 实盘账户</div>
                <div style="font-size:0.8em; background:${c.live}20; color:${c.live}; padding:2px 8px; border-radius:10px;">Live</div>
            </div>
            <div style="display:flex; align-items:baseline; gap:4px;">
                <div style="font-size:2.8em; font-weight:900; color:${live.pnl >= 0 ? c.live : c.loss}; line-height:1;">
                    ${live.pnl > 0 ? "+" : ""}${live.pnl}
                </div>
                <div style="font-size:1em; opacity:0.6;">$</div>
            </div>
            <div style="display:flex; gap:15px; margin-top:10px; font-size:0.9em; opacity:0.8;">
                <div>📦 ${live.count} 笔交易</div>
                <div>🎯 ${live.wr}% 胜率</div>
            </div>
        </div>

        <!-- 模拟与回测 -->
        <div style="flex:1; display:flex; flex-direction:column; gap:10px;">
            ${miniCard("模拟盘", demo, c.demo, "🔵")}
            ${miniCard("复盘回测", back, c.back, "🟠")}
        </div>
    </div>

    <!-- 热力图 -->
    <div style="padding-top:15px; border-top:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-size:0.9em; font-weight:600; opacity:0.9;">📅 盈亏日历 (${targetMonth})</div>
            <div style="font-size:0.7em; opacity:0.5;">Live Account Only</div>
        </div>
        ${gridHtml}
    </div>
    `;
}

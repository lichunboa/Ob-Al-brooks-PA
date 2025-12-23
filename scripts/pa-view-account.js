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
      dailyMap[day] = (dailyMap[day] || 0) + t.pnl;
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
  root.innerHTML = `
    <div style="display:flex; gap:20px;">
        <div style="flex:2; padding:10px; border-right:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="color:${
                  c.live
                }; font-weight:800; font-size:1.1em;">🟢 实盘账户</div>
                <div style="font-size:0.8em; opacity:0.5;">${
                  live.count
                } 笔交易</div>
            </div>
            <div style="margin-top:15px;">
                <div style="font-size:2.5em; font-weight:900; color:${
                  live.pnl >= 0 ? c.live : c.loss
                }">${live.pnl > 0 ? "+" : ""}${
    live.pnl
  }<span style="font-size:0.5em; opacity:0.5">$</span></div>
                <div style="font-size:0.9em; opacity:0.8;">胜率: <b>${
                  live.wr
                }%</b></div>
            </div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:10px;">
            <div style="display:flex; justify-content:space-between; font-size:0.9em;">
                <span style="color:${c.demo}">🔵 模拟盘</span>
                <span>${demo.pnl}$ (${demo.wr}%)</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.9em;">
                <span style="color:${c.back}">🟠 复盘回测</span>
                <span>${back.pnl}$ (${back.wr}%)</span>
            </div>
        </div>
    </div>
    <div style="margin-top:20px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-size:0.85em; font-weight:600; opacity:0.8;">📅 盈亏日历 (${targetMonth})</div>
            <div style="font-size:0.7em; opacity:0.5;">Live Account Only</div>
        </div>
        ${gridHtml}
    </div>
    `;
}

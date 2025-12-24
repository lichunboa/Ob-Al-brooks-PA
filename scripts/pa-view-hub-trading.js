/* 文件名: Scripts/pa-view-hub-trading.js
   用途: 交易中心 (Trading Hub) - 整合今日看板、快速行动、实时趋势
   版本: v5.0 (Consolidated)
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

if (window.paData) {
  const trades = window.paData.trades;
  const today = moment().format("YYYY-MM-DD");

  // --- 1. 布局容器 (Grid) ---
  // 左侧 (2/3): 今日看板
  // 右侧 (1/3): 快速行动 + 趋势指标
  const root = dv.el("div", "", {
    attr: {
      style: "display: grid; grid-template-columns: 2fr 1fr; gap: 20px;",
    },
  });

  // --- 左侧: 今日看板 (Today Dashboard) ---
  const leftCol = document.createElement("div");
  leftCol.style.cssText = `${c.cardBg}; padding: 20px; display: flex; flex-direction: column; gap: 15px;`;

  // 1.1 头部状态
  // 单一信源：直接使用 pa-core 输出的 tradesAsc
  const todayTrades = (window.paData.tradesAsc || [])
    .filter((t) => t && t.date === today)
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

  const todayPnL = todayTrades.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0);
  const todayCount = todayTrades.length;

  leftCol.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:15px;">
        <div>
            <div style="font-size:1.2em; font-weight:bold; opacity:0.9;">📅 今日交易 (${today})</div>
            <div style="font-size:0.8em; opacity:0.6;">Focus on Execution Quality</div>
        </div>
        <div style="text-align:right;">
            <div style="font-size:1.8em; font-weight:900; color:${
              todayPnL >= 0 ? c.live : c.loss
            };">${todayPnL > 0 ? "+" : ""}${todayPnL}</div>
            <div style="font-size:0.8em; opacity:0.6;">${todayCount} Trades</div>
        </div>
    </div>`;

  // 1.2 市场环境 (Context)
  const todayJournal = window.paData?.daily?.todayJournal;
  if (todayJournal && todayJournal.market_cycle) {
    leftCol.innerHTML += `
        <div style="padding: 12px; background: rgba(59, 130, 246, 0.1); border-left: 4px solid #3b82f6; border-radius: 4px;">
            <div style="font-weight:bold; color:#3b82f6; margin-bottom:4px;">🌊 市场环境: ${todayJournal.market_cycle}</div>
            <div style="font-size:0.85em; opacity:0.8;">策略建议: 顺势而为，寻找回调入场机会。</div>
        </div>`;
  } else {
    leftCol.innerHTML += `
        <div style="padding: 12px; border: 1px dashed rgba(255,255,255,0.2); border-radius: 6px; text-align: center; font-size: 0.9em; opacity: 0.6;">
            <a href="obsidian://new?file=Daily/${today}_Journal&content=Templates/每日复盘模版 (Daily Journal).md">📝 创建今日日记</a> 以激活策略推荐
        </div>`;
  }

  // 1.3 活跃交易 (Active Trade)
  const activeTrade = todayTrades.find((t) => !(t.outcome || "").toString().trim());
  if (activeTrade) {
    leftCol.innerHTML += `
        <div style="flex:1; background:rgba(255,255,255,0.03); border-radius:8px; padding:15px; border:1px solid ${
          c.accent
        };">
            <div style="color:${
              c.accent
            }; font-weight:bold; margin-bottom:10px;">⚡️ 进行中: ${
      activeTrade.link
    }</div>
            <div style="font-size:0.9em; opacity:0.8;">
                <div>方向: ${activeTrade.dir || "-"}</div>
                <div>形态: ${(Array.isArray(activeTrade.patterns) && activeTrade.patterns.length > 0)
                  ? activeTrade.patterns.map((x) => x.toString().trim()).filter(Boolean).join(", ")
                  : (activeTrade.patterns || "-")}</div>
            </div>
        </div>`;
  } else {
    leftCol.innerHTML += `
        <div style="flex:1; display:flex; align-items:center; justify-content:center; opacity:0.3; font-size:0.9em;">
            等待交易机会...
        </div>`;
  }

  root.appendChild(leftCol);

  // --- 右侧: 快速行动 & 趋势 (Right Column) ---
  const rightCol = document.createElement("div");
  rightCol.style.cssText = "display:flex; flex-direction:column; gap:20px;";

  // 2.1 快速行动 (Quick Actions)
  const actionsPanel = document.createElement("div");
  actionsPanel.style.cssText = `${c.cardBg}; padding: 15px;`;
  const btn = (color, text, cmd) =>
    `<button onclick="app.commands.executeCommandById('${cmd}')" style="width:100%; background:${color}; color:white; border:none; padding:12px; border-radius:6px; cursor:pointer; font-weight:bold; margin-bottom:8px; text-align:left; display:flex; justify-content:space-between; align-items:center;">
            <span>${text}</span> <span>+</span>
        </button>`;

  actionsPanel.innerHTML = `
        <div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🚀 快速开仓</div>
        ${btn(c.live, "🟢 实盘交易", "quickadd:choice:New Live Trade")}
        ${btn(c.demo, "🔵 模拟交易", "quickadd:choice:New Demo Trade")}
        ${btn(c.back, "🟡 回测记录", "quickadd:choice:New Backtest")}
    `;
  rightCol.appendChild(actionsPanel);

  // 2.2 实时趋势 (Trend / R-Multiples)
  const trendPanel = document.createElement("div");
  trendPanel.style.cssText = `${c.cardBg}; padding: 15px; flex:1;`;

  // 简化版 R 值图
  const recentTrades = trades.slice(0, 10); // 最近 10 笔
  let bars = `<div style="display:flex; align-items:flex-end; gap:4px; height:60px; margin-top:10px;">`;
  if (recentTrades.length > 0) {
    let maxVal = Math.max(...recentTrades.map((t) => Math.abs(t.r || 0))) || 1;
    for (let t of recentTrades) {
      let r = t.r || 0;
      let h = Math.round((Math.abs(r) / maxVal) * 50);
      if (h < 4) h = 4;
      let color = r >= 0 ? (t.type === "Live" ? c.live : c.demo) : c.loss;
      bars += `<div style="flex:1; height:${h}px; background:${color}; border-radius:2px; opacity:${
        r >= 0 ? 1 : 0.7
      };" title="R: ${r}"></div>`;
    }
  } else {
    bars += `<div style="width:100%; text-align:center; opacity:0.5; font-size:0.8em; align-self:center;">暂无数据</div>`;
  }
  bars += `</div>`;

  trendPanel.innerHTML = `
        <div style="font-weight:700; opacity:0.7; margin-bottom:5px;">📈 近期趋势 (Last 10)</div>
        ${bars}
    `;
  rightCol.appendChild(trendPanel);

  root.appendChild(rightCol);
}

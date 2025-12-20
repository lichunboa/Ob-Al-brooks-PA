/* 文件名: Scripts/pa-view-today.js
   用途: 今日交易实时监控面板
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");

// 获取今日日期
const today = moment().format("YYYY-MM-DD");

// 获取今日所有交易笔记
const todayTrades = dv
  .pages('"Daily/Trades"')
  .where((p) => p.date && p.date.toString().startsWith(today))
  .sort((p) => p.date, "desc");

const c = cfg.colors;
const root = dv.el("div", "", { attr: { style: c.cardBg } });

// 统计数据
let totalTrades = todayTrades.length;
let completedTrades = todayTrades.where((p) => p["结果/outcome"]).length;
let activeTrades = totalTrades - completedTrades;

let totalPnL = 0;
let wins = 0;
let losses = 0;
let scratches = 0;

todayTrades.forEach((trade) => {
  let outcome = trade["结果/outcome"];
  let pnl = trade["净利润/net_profit"] || 0;

  if (outcome === "Win") {
    wins++;
    totalPnL += pnl;
  } else if (outcome === "Loss") {
    losses++;
    totalPnL += pnl;
  } else if (outcome === "Scratch") {
    scratches++;
  }
});

let winRate =
  completedTrades > 0 ? Math.round((wins / completedTrades) * 100) : 0;
let avgPnL = completedTrades > 0 ? (totalPnL / completedTrades).toFixed(2) : 0;

// 最近交易列表
let recentTradesHtml = "";
if (todayTrades.length > 0) {
  todayTrades.slice(0, 5).forEach((trade) => {
    let strategy = trade["策略名称/strategy_name"] || "未指定";
    let ticker = trade["品种/ticker"] || "";
    let direction = trade["方向/direction"] || "";
    let outcome = trade["结果/outcome"] || "进行中";
    let pnl = trade["净利润/net_profit"] || 0;
    let timeframe = trade["时间周期/timeframe"] || "";
    let entry = trade["入场/entry_price"] || "";
    let stop = trade["止损/stop_loss"] || "";

    // 状态颜色
    let statusColor =
      outcome === "Win"
        ? c.live
        : outcome === "Loss"
        ? c.loss
        : outcome === "Scratch"
        ? c.back
        : "#6b7280";

    // 方向图标
    let dirIcon =
      direction === "多" || direction === "Long"
        ? "📈"
        : direction === "空" || direction === "Short"
        ? "📉"
        : "➡️";

    recentTradesHtml += `
    <a href="${trade.file.path}" class="internal-link" style="
      display:block;
      background:rgba(255,255,255,0.02);
      border:1px solid rgba(255,255,255,0.05);
      padding:8px 10px;
      border-radius:6px;
      margin-bottom:6px;
      text-decoration:none;
      transition: all 0.2s;
    " onmouseover="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(59,130,246,0.3)';" 
       onmouseout="this.style.background='rgba(255,255,255,0.02)'; this.style.borderColor='rgba(255,255,255,0.05)';">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <div style="font-size:0.85em; font-weight:600;">
          ${dirIcon} ${ticker} ${timeframe} - ${strategy}
        </div>
        <div style="font-size:0.75em; padding:2px 6px; background:${statusColor}20; color:${statusColor}; border-radius:3px;">
          ${outcome}
        </div>
      </div>
      <div style="display:flex; gap:12px; font-size:0.7em; opacity:0.6;">
        ${entry ? `<span>入场: ${entry}</span>` : ""}
        ${stop ? `<span>止损: ${stop}</span>` : ""}
        ${
          pnl !== 0
            ? `<span style="color:${
                pnl > 0 ? c.live : c.loss
              }; font-weight:600;">PnL: ${pnl > 0 ? "+" : ""}${pnl}</span>`
            : ""
        }
      </div>
    </a>`;
  });
} else {
  recentTradesHtml = `<div style="text-align:center; opacity:0.5; padding:20px; font-size:0.85em;">📭 今日暂无交易记录</div>`;
}

// 渲染
root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">📊 今日实时监控 (Today's Dashboard) - ${today}</div>

<!-- 统计卡片 -->
<div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:6px; margin-bottom:16px;">
  <div style="background:rgba(59,130,246,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:${
      c.demo
    };">${totalTrades}</div>
    <div style="font-size:0.65em; opacity:0.7;">总交易</div>
  </div>
  <div style="background:rgba(34,197,94,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:${
      c.live
    };">${wins}</div>
    <div style="font-size:0.65em; opacity:0.7;">获胜</div>
  </div>
  <div style="background:rgba(239,68,68,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:${
      c.loss
    };">${losses}</div>
    <div style="font-size:0.65em; opacity:0.7;">亏损</div>
  </div>
  <div style="background:rgba(251,191,36,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#fbbf24;">${winRate}%</div>
    <div style="font-size:0.65em; opacity:0.7;">胜率</div>
  </div>
  <div style="background:rgba(168,85,247,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:${
      totalPnL >= 0 ? c.live : c.loss
    };">${totalPnL > 0 ? "+" : ""}${totalPnL.toFixed(0)}</div>
    <div style="font-size:0.65em; opacity:0.7;">净利润</div>
  </div>
</div>

<!-- 进行中提示 -->
${
  activeTrades > 0
    ? `
<div style="background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); padding:8px 12px; border-radius:6px; margin-bottom:12px; font-size:0.8em;">
  ⚡ <strong>${activeTrades}</strong> 笔交易进行中...
</div>
`
    : ""
}

<!-- 最近交易 -->
<div style="margin-top:12px;">
  <div style="font-size:0.8em; opacity:0.6; margin-bottom:8px;">🕒 最近交易记录</div>
  ${recentTradesHtml}
</div>

<!-- 快速分析按钮 -->
<div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05);">
  <button onclick="app.commands.executeCommandById('quickadd:choice:New Chart Analysis')" style="
    width:100%;
    background:linear-gradient(135deg, rgba(59,130,246,0.2), rgba(147,51,234,0.2));
    color:${c.demo};
    border:1px solid rgba(59,130,246,0.3);
    padding:10px;
    border-radius:6px;
    cursor:pointer;
    font-weight:600;
    font-size:0.85em;
    transition: all 0.2s;
  " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(59,130,246,0.3)';" 
     onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
    📈 开始新的图表分析
  </button>
</div>
`;

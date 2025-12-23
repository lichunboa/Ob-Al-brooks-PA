/* 文件名: Scripts/pa-view-today.js
   用途: 今日交易实时监控面板 (v4.1.0 策略助手版)
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");

// 获取今日日期
const today = moment().format("YYYY-MM-DD");

// 获取今日所有交易笔记
const todayTrades = dv
  .pages('"Daily/Trades"')
  .where((p) => p.date && p.date.toString().startsWith(today))
  .sort((p) => p.file.mtime, "desc"); // 按修改时间倒序，确保最新的在最前

const c = cfg.colors;
const root = dv.el("div", "", { attr: { style: c.cardBg } });

// --- 1. 策略助手逻辑 (Strategy Assistant) ---
// 查找当前正在进行的交易 (没有结果/outcome 或 结果为空)
const activeTrade = todayTrades.find((p) => !p["结果/outcome"]);
let assistantHtml = "";

if (activeTrade) {
  const patterns = activeTrade["观察到的形态/patterns_observed"];
  const currentSignal = activeTrade["信号K/signal_bar_quality"];

  if (patterns) {
    // 查找匹配的策略卡片
    // 注意: 这里需要扫描策略库，为了性能，我们只扫描 "策略仓库" 文件夹
    const strategyPages = dv.pages('"策略仓库 (Strategy Repository)"');
    let matchedStrategy = null;

    // 简单的匹配逻辑: 策略卡片的 patterns_observed 包含 activeTrade 的 patterns 中的任意一个
    // patterns 可能是数组也可能是字符串
    const observedList = Array.isArray(patterns) ? patterns : [patterns];

    for (let s of strategyPages) {
      // 修正: 策略卡片现在使用 "观察到的形态/patterns_observed" 作为匹配键，而不是 "触发形态/trigger_patterns"
      let triggers = s["观察到的形态/patterns_observed"];
      if (!triggers) continue;
      let triggerList = Array.isArray(triggers) ? triggers : [triggers];

      // 检查是否有交集
      const hasMatch = observedList.some((obs) => triggerList.includes(obs));
      if (hasMatch) {
        matchedStrategy = s;
        break; // 找到第一个匹配的策略即可
      }
    }

    if (matchedStrategy) {
      // 提取策略建议
      const sName = matchedStrategy["策略名称/strategy_name"];
      const sEntry = matchedStrategy["入场条件/entry_criteria"] || [];
      const sRisk = matchedStrategy["风险提示/risk_alerts"] || [];
      const sStop = matchedStrategy["止损建议/stop_loss_recommendation"] || [];
      const sSignalReq =
        matchedStrategy["信号K要求/signal_bar_requirements"] || [];

      // 信号K 验证逻辑
      let signalValidationHtml = "";
      if (currentSignal) {
        // 这里可以做更复杂的验证，目前先简单显示
        // 比如: 如果策略要求 "强阳收盘" 但当前是 "十字星"，显示警告
        signalValidationHtml = `
          <div style="margin-top:8px; padding:8px; background:rgba(255,255,255,0.05); border-radius:4px; font-size:0.8em;">
            <div style="opacity:0.7; margin-bottom:4px;">🔍 信号K验证:</div>
            <div style="display:flex; justify-content:space-between;">
              <span>当前: <strong style="color:${c.accent}">${currentSignal}</strong></span>
              <!-- 这里未来可以加自动判定逻辑 -->
            </div>
          </div>
        `;
      }

      // 渲染助手面板
      assistantHtml = `
        <div style="
          background: linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.1) 100%);
          border: 1px solid rgba(59,130,246,0.3);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        ">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">
            <div style="font-weight:700; color:${c.accent};">🤖 策略助手: ${sName}</div>
            <a href="${matchedStrategy.file.path}" class="internal-link" style="font-size:0.75em; opacity:0.8; text-decoration:none;">查看详情 -></a>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <!-- 左侧: 入场检查 -->
            <div>
              <div style="font-size:0.75em; font-weight:600; color:${c.live}; margin-bottom:4px;">✅ 入场条件</div>
              <ul style="margin:0; padding-left:16px; font-size:0.75em; opacity:0.9; color:${c.text};">
                ${
                  Array.isArray(sEntry)
                    ? sEntry.map((i) => `<li>${i}</li>`).join("")
                    : `<li>${sEntry}</li>`
                }
              </ul>
            </div>

            <!-- 右侧: 风险提示 -->
            <div>
              <div style="font-size:0.75em; font-weight:600; color:${c.loss}; margin-bottom:4px;">⚠️ 风险提示</div>
              <ul style="margin:0; padding-left:16px; font-size:0.75em; opacity:0.9; color:${c.text};">
                ${
                  Array.isArray(sRisk)
                    ? sRisk.map((i) => `<li>${i}</li>`).join("")
                    : `<li>${sRisk}</li>`
                }
              </ul>
            </div>
          </div>

          ${signalValidationHtml}

          <!-- 底部: 止损建议 -->
          <div style="margin-top:10px; font-size:0.75em; opacity:0.8; border-top:1px dashed rgba(255,255,255,0.1); padding-top:8px;">
            🛡️ <strong>止损建议:</strong> ${
              Array.isArray(sStop) ? sStop.join(" | ") : sStop
            }
          </div>
        </div>
      `;
    }
  }
}

// --- 2. 统计数据逻辑 ---
let totalTrades = todayTrades.length;
let completedTrades = todayTrades.where((p) => p["结果/outcome"]).length;
let activeTradesCount = totalTrades - completedTrades;

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

// --- 3. 最近交易列表 ---
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

// --- 4. 最终渲染 ---
root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">📊 今日实时监控 (Today's Dashboard) - ${today}</div>

<!-- 策略助手 (仅在有活跃交易且匹配到策略时显示) -->
${assistantHtml}

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
  activeTradesCount > 0 && !assistantHtml
    ? `
<div style="background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); padding:8px 12px; border-radius:6px; margin-bottom:12px; font-size:0.8em;">
  ⚡ <strong>${activeTradesCount}</strong> 笔交易进行中...
</div>
`
    : ""
}

<!-- 最近交易 -->
<div style="margin-top:12px;">
  <div style="font-size:0.8em; opacity:0.6; margin-bottom:8px;">🕒 最近交易记录</div>
  ${recentTradesHtml}
</div>

<!-- 快速创建按钮 -->
<div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05);">
  <button onclick="app.commands.executeCommandById('quickadd:choice:New Live Trade')" style="
    width:100%;
    background:linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.2));
    color:${c.live};
    border:1px solid rgba(34,197,94,0.3);
    padding:10px;
    border-radius:6px;
    cursor:pointer;
    font-weight:600;
    font-size:0.85em;
    transition: all 0.2s;
  " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(34,197,94,0.3)';" 
     onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
    📝 创建新交易笔记 (图表分析 → 形态识别 → 策略匹配)
  </button>
</div>
`;

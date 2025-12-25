/* 文件名: Scripts/pa-view-today.js
   用途: 今日交易实时监控面板 (v4.1.0 策略助手版)
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");

// 获取今日日期
const today = moment().format("YYYY-MM-DD");

// 单一信源：直接使用 pa-core 输出的 tradesAsc
const todayTrades = (window.paData?.tradesAsc || [])
  .filter((t) => t && t.date === today)
  .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

const c = cfg.colors;
const root = dv.el("div", "", { attr: { style: c.cardBg } });

// 策略索引 (来自 pa-core)
const strategyIndex = window.paData?.strategyIndex;
const strategyList = strategyIndex?.list || [];
const strategyByName = strategyIndex?.byName;
const strategyLookup = strategyIndex?.lookup;
const strategyByPattern = strategyIndex?.byPattern || {};
const toArr = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v?.constructor && v.constructor.name === "Proxy") return Array.from(v);
  return [v];
};
const normStr = (v) =>
  v === undefined || v === null ? "" : v.toString().trim();
const isActiveStrategy = (statusRaw) => {
  const s = normStr(statusRaw);
  if (!s) return false;
  return s.includes("实战") || s.toLowerCase().includes("active");
};
const cycleMatches = (cycles, currentCycle) => {
  const cur = normStr(currentCycle);
  if (!cur) return false;
  return (cycles || []).some((c) => {
    const cc = normStr(c);
    return cc && (cc.includes(cur) || cur.includes(cc));
  });
};

// --- 1. 市场环境与策略推荐 (Context & Strategy) ---
// 尝试查找今日的复盘日记 (通常在 Daily 目录下)
const todayJournal = window.paData?.daily?.todayJournal;
let contextHtml = "";

if (todayJournal && todayJournal.market_cycle) {
  const currentCycle = todayJournal.market_cycle;
  const recommendedStrategies = strategyList
    .filter(
      (s) =>
        isActiveStrategy(s.statusRaw) && cycleMatches(s.marketCycles, currentCycle)
    )
    .slice(0, 6);

  contextHtml += `
    <div style="margin-bottom: 15px; padding: 10px; background: rgba(59, 130, 246, 0.05); border-radius: 8px; border-left: 3px solid #3b82f6;">
        <div style="font-weight: bold; color: #3b82f6; margin-bottom: 5px;">
            🌊 今日市场: ${currentCycle}
        </div>
        <div style="font-size: 0.9em; color: var(--text-muted);">
            ${
              recommendedStrategies.length > 0
                ? `推荐关注: ${recommendedStrategies
                    .map((p) => `<b>${p.file.link}</b>`)
                    .join(" · ")}`
                : "暂无特定策略推荐，建议观望。"
            }
        </div>
    </div>`;
} else {
  contextHtml += `
    <div style="margin-bottom: 15px; padding: 10px; border: 1px dashed var(--text-faint); border-radius: 8px; text-align: center; font-size: 0.85em; color: var(--text-muted);">
        📝 <a href="obsidian://new?file=Daily/${today}_Journal&content=Templates/每日复盘模版 (Daily Journal).md">创建今日日记</a> 并设置市场周期以获取策略推荐
    </div>`;
}

// --- 1. 策略助手逻辑 (Strategy Assistant) ---
const activeTrade = todayTrades.find((t) => !(t.outcome || "").toString().trim());
let assistantHtml = "";

if (activeTrade) {
  const patterns = activeTrade.patterns;
  const currentSignal = activeTrade.signal;
  const observedList = toArr(patterns).map(normStr).filter(Boolean);

  // 1) 优先：形态 -> 策略卡
  let matchedFilePath = null;
  let matchedItem = null;
  if (observedList.length > 0) {
    for (const obs of observedList) {
      const canonical = strategyByPattern[obs];
      if (!canonical) continue;
      const item = strategyByName?.get?.(canonical);
      if (item?.file?.path) {
        matchedFilePath = item.file.path;
        matchedItem = item;
        break;
      }
    }
  }

  if (matchedItem) {
    const sName = matchedItem.canonicalName || matchedItem.displayName || "策略";
    const sEntry = matchedItem.entryCriteria || [];
    const sRisk = matchedItem.riskAlerts || [];
    const sStop = matchedItem.stopLossRecommendation || [];

    const formatList = (list) => {
      if (!Array.isArray(list)) return list;
      return list
        .map((item) => {
          if (typeof item === "object" && item !== null) {
            return Object.entries(item)
              .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
              .join(", ");
          }
          return item;
        })
        .join(" | ");
    };

    let signalValidationHtml = "";
    if (currentSignal) {
      signalValidationHtml = `
        <div style="margin-top:8px; padding:8px; background:rgba(255,255,255,0.05); border-radius:4px; font-size:0.8em;">
          <div style="opacity:0.7; margin-bottom:4px;">🔍 信号K验证:</div>
          <div style="display:flex; justify-content:space-between;">
            <span>当前: <strong style="color:${c.accent}">${currentSignal}</strong></span>
          </div>
        </div>
      `;
    }

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
          <a href="${matchedItem.file?.path || matchedFilePath}" class="internal-link" style="font-size:0.75em; opacity:0.8; text-decoration:none;">查看详情 -></a>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div>
            <div style="font-size:0.75em; font-weight:600; color:${c.live}; margin-bottom:4px;">✅ 入场条件</div>
            <ul style="margin:0; padding-left:16px; font-size:0.75em; opacity:0.9; color:${c.text};">
              ${Array.isArray(sEntry) ? sEntry.map((i) => `<li>${i}</li>`).join("") : `<li>${sEntry}</li>`}
            </ul>
          </div>
          <div>
            <div style="font-size:0.75em; font-weight:600; color:${c.loss}; margin-bottom:4px;">⚠️ 风险提示</div>
            <ul style="margin:0; padding-left:16px; font-size:0.75em; opacity:0.9; color:${c.text};">
              ${Array.isArray(sRisk) ? sRisk.map((i) => `<li>${i}</li>`).join("") : `<li>${sRisk}</li>`}
            </ul>
          </div>
        </div>

        ${signalValidationHtml}

        <div style="margin-top:10px; font-size:0.75em; opacity:0.8; border-top:1px dashed rgba(255,255,255,0.1); padding-top:8px;">
          🛡️ <strong>止损建议:</strong> ${formatList(sStop)}
        </div>
      </div>
    `;
  }

  // 2) 回退：早期建议（不需要 patterns）
  if (!assistantHtml) {
    const marketCycle = activeTrade.market_cycle;
    const setupCategory = activeTrade.setup;

    if (marketCycle || setupCategory) {
      let suggestedStrategies = [];
      for (let s of strategyList) {
        let score = 0;
        if (marketCycle && cycleMatches(s.marketCycles, marketCycle)) score += 2;
        if (
          setupCategory &&
          (s.setupCategories || []).some((x) =>
            normStr(x).includes(normStr(setupCategory))
          )
        ) {
          score += 1;
        }
        if (score > 0) {
          suggestedStrategies.push({
            file: s.file,
            score,
            name: s.displayName || s.canonicalName,
          });
        }
      }

      suggestedStrategies.sort((a, b) => b.score - a.score);
      const topSuggestions = suggestedStrategies.slice(0, 3);

      if (topSuggestions.length > 0) {
        assistantHtml = `
          <div style="
            background: rgba(255,255,255,0.03);
            border: 1px dashed rgba(255,255,255,0.1);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px;
          ">
            <div style="font-size:0.8em; opacity:0.7; margin-bottom:8px;">💡 基于当前市场背景 (${marketCycle || "未知"}) 的策略建议:</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${topSuggestions
                .map(
                  (s) => `
                    <a href="${s.file.path}" class="internal-link" style="
                      background:rgba(59,130,246,0.1);
                      color:${c.accent};
                      padding:4px 8px;
                      border-radius:4px;
                      text-decoration:none;
                      font-size:0.75em;
                      border:1px solid rgba(59,130,246,0.2);
                    ">${s.name}</a>
                  `
                )
                .join("")}
            </div>
          </div>
        `;
      }
    }
  }
}

// --- 2. 统计数据逻辑 ---
let totalTrades = todayTrades.length;
let completedTrades = todayTrades.filter((t) => (t.outcome || "").toString().trim()).length;
let activeTradesCount = totalTrades - completedTrades;

let totalPnL = 0;
let wins = 0;
let losses = 0;
let scratches = 0;

todayTrades.forEach((trade) => {
  let outcome = trade.outcome;
  let outcomeStr = Array.isArray(outcome) ? outcome.join(" ") : (outcome || "").toString();

  let pnl = Number(trade.pnl) || 0;

  // 兼容 "Win" 和 "止盈 (Win)" 两种格式
  if (
    outcomeStr &&
    (outcomeStr === "Win" || outcomeStr.includes("Win") || outcomeStr.includes("止盈"))
  ) {
    wins++;
    totalPnL += pnl;
  } else if (
    outcomeStr &&
    (outcomeStr === "Loss" || outcomeStr.includes("Loss") || outcomeStr.includes("止损"))
  ) {
    losses++;
    totalPnL += pnl;
  } else if (
    outcomeStr &&
    (outcomeStr === "Scratch" ||
      outcomeStr.includes("Scratch") ||
      outcomeStr.includes("保本"))
  ) {
    scratches++;
    totalPnL += pnl; // 保本单也可能有微小盈亏
  }
});

let winRate =
  completedTrades > 0 ? Math.round((wins / completedTrades) * 100) : 0;

// --- 3. 最近交易列表 ---
let recentTradesHtml = "";
if (todayTrades.length > 0) {
  todayTrades.slice(0, 5).forEach((trade) => {
    let strategy = trade.strategyName || "未指定";
    let ticker = trade.ticker || "";
    let direction = trade.dir || "";
    let outcome = trade.outcome || "进行中";
    let outcomeStr = Array.isArray(outcome) ? outcome.join(" ") : (outcome || "").toString();

    let pnl = Number(trade.pnl) || 0;
    let timeframe = trade.tf || "";
    let entry = trade.entry || "";
    let stop = trade.stop || "";

    // 状态颜色
    let statusColor = "#6b7280"; // 默认灰色 (进行中)
    if (
      outcomeStr &&
      (outcomeStr === "Win" ||
        outcomeStr.includes("Win") ||
        outcomeStr.includes("止盈"))
    ) {
      statusColor = c.live;
    } else if (
      outcomeStr &&
      (outcomeStr === "Loss" ||
        outcomeStr.includes("Loss") ||
        outcomeStr.includes("止损"))
    ) {
      statusColor = c.loss;
    } else if (
      outcomeStr &&
      (outcomeStr === "Scratch" ||
        outcomeStr.includes("Scratch") ||
        outcomeStr.includes("保本"))
    ) {
      statusColor = c.back;
    }

    // 方向图标
    let dirIcon =
      direction === "多" || direction === "Long"
        ? "📈"
        : direction === "空" || direction === "Short"
        ? "📉"
        : "➡️";

    recentTradesHtml += `
    <a href="${trade.id}" class="internal-link" style="
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

<!-- 市场环境 (Context) -->
${contextHtml}

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

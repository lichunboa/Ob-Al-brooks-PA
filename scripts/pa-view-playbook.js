const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");

// 策略仓库路径
const strategyRepo = "策略仓库 (Strategy Repository)";
const strategies = dv
  .pages(`"${strategyRepo}"`)
  .where((p) => p.categories && p.categories.includes("策略"));

// 按市场周期分类
let cycleGroups = {
  "🚀 急速/突破": ["急速", "突破模式", "Spike", "Breakout"],
  "📈 趋势延续": ["趋势", "强趋势", "趋势回调", "Trend", "Pullback"],
  "🔄 交易区间": ["交易区间", "区间", "Range"],
  "🔃 反转": ["反转", "Reversal"],
};

let html = "";
let totalStrategies = strategies.length;
let activeStrategies = strategies.where(
  (p) => p["策略状态"] === "实战中"
).length;
let usageCount = 0;
strategies.forEach((s) => (usageCount += s["使用次数"] || 0));

// 顶部统计
html += `<div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-bottom:16px;">
  <div style="background:rgba(59,130,246,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:${
      cfg.colors.demo
    };">${totalStrategies}</div>
    <div style="font-size:0.7em; opacity:0.7;">总策略</div>
  </div>
  <div style="background:rgba(34,197,94,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#22c55e;">${activeStrategies}</div>
    <div style="font-size:0.7em; opacity:0.7;">实战中</div>
  </div>
  <div style="background:rgba(251,191,36,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#fbbf24;">${
      totalStrategies - activeStrategies
    }</div>
    <div style="font-size:0.7em; opacity:0.7;">学习中</div>
  </div>
  <div style="background:rgba(168,85,247,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#a855f7;">${usageCount}</div>
    <div style="font-size:0.7em; opacity:0.7;">总使用</div>
  </div>
</div>`;

// 按市场周期分组显示
Object.keys(cycleGroups).forEach((groupName) => {
  let keywords = cycleGroups[groupName];
  let matches = strategies.where((p) => {
    let cycles = p["市场周期"] || [];
    if (!Array.isArray(cycles)) cycles = [cycles];
    return keywords.some((k) => cycles.some((c) => c.toString().includes(k)));
  });

  if (matches.length > 0) {
    html += `<div style="margin-bottom:14px;">
      <div style="font-size:0.85em; opacity:0.7; font-weight:bold; margin-bottom:8px;">${groupName} (${matches.length})</div>
      <div style="display:flex; flex-direction:column; gap:8px;">`;

    for (let s of matches) {
      let strategyName = s["策略名称"] || s.file.name;
      let winRate = s["胜率"] || 0;
      let riskReward = s["盈亏比"] || "N/A";
      let status = s["策略状态"] || "学习中";
      let usageCount = s["使用次数"] || 0;
      let setupCategory = s["设置类别"] || "";
      let source = s["来源"] || "";

      // 获取市场周期
      let cycles = s["市场周期"] || [];
      if (!Array.isArray(cycles)) cycles = [cycles];
      let cycleText = cycles.slice(0, 2).join(", ");

      // 状态颜色
      let statusColor =
        status === "实战中"
          ? "#22c55e"
          : status === "验证中"
          ? "#fbbf24"
          : status === "学习中"
          ? "#3b82f6"
          : "#6b7280";

      // 胜率颜色
      let winRateColor =
        winRate >= 60
          ? "#22c55e"
          : winRate >= 50
          ? "#fbbf24"
          : winRate > 0
          ? "#ef4444"
          : "#6b7280";

      // 生成唯一ID
      let cardId = "strategy-" + strategyName.replace(/[^a-zA-Z0-9]/g, "-");

      html += `
      <div style="
        background:rgba(255,255,255,0.03);
        border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;
        overflow:hidden;
        transition: all 0.2s;
      " onmouseover="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(59,130,246,0.3)';" 
         onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.borderColor='rgba(255,255,255,0.1)';">
        
        <!-- 卡片头部 - 可点击展开 -->
        <div onclick="
          let detail = document.getElementById('${cardId}');
          let arrow = document.getElementById('${cardId}-arrow');
          if(detail.style.display === 'none') {
            detail.style.display = 'block';
            arrow.style.transform = 'rotate(90deg)';
          } else {
            detail.style.display = 'none';
            arrow.style.transform = 'rotate(0deg)';
          }
        " style="
          padding:10px 12px;
          cursor:pointer;
          display:flex;
          justify-content:space-between;
          align-items:center;
        ">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <span style="font-size:0.9em; font-weight:600; color:${
                cfg.colors.demo
              };">${strategyName}</span>
              <span style="font-size:0.65em; padding:2px 6px; background:${statusColor}20; color:${statusColor}; border-radius:3px;">● ${status}</span>
            </div>
            <div style="display:flex; gap:12px; font-size:0.7em; opacity:0.7;">
              <span>📊 R/R: <strong>${riskReward}</strong></span>
              ${
                winRate > 0
                  ? `<span>✓ 胜率: <strong style="color:${winRateColor};">${winRate}%</strong></span>`
                  : ""
              }
              ${
                usageCount > 0
                  ? `<span>🔢 使用: <strong>${usageCount}次</strong></span>`
                  : ""
              }
            </div>
          </div>
          <div id="${cardId}-arrow" style="
            font-size:0.8em; 
            opacity:0.5; 
            transition:transform 0.2s;
            transform:rotate(0deg);
          ">▶</div>
        </div>
        
        <!-- 展开详情 -->
        <div id="${cardId}" style="
          display:none;
          padding:0 12px 12px 12px;
          border-top:1px solid rgba(255,255,255,0.05);
          animation: slideDown 0.2s ease-out;
        ">
          <div style="margin-top:10px; font-size:0.75em;">
            <div style="display:grid; grid-template-columns: auto 1fr; gap:6px 12px; opacity:0.8;">
              <span style="opacity:0.6;">市场周期:</span>
              <span>${cycleText || "N/A"}</span>
              
              <span style="opacity:0.6;">设置类别:</span>
              <span>${setupCategory || "N/A"}</span>
              
              <span style="opacity:0.6;">来源:</span>
              <span>${source || "N/A"}</span>
            </div>
            
            <div style="margin-top:10px; display:flex; gap:6px;">
              <a href="${s.file.path}" class="internal-link" style="
                flex:1;
                background:rgba(59,130,246,0.15);
                color:${cfg.colors.demo};
                padding:6px 10px;
                border-radius:4px;
                text-decoration:none;
                font-size:0.75em;
                text-align:center;
                border:1px solid rgba(59,130,246,0.3);
              ">📖 查看详情</a>
            </div>
          </div>
        </div>
      </div>`;
    }
    html += `</div></div>`;
  }
});

// 快速访问链接
html += `<div style="margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.1);">
  <div style="display:flex; gap:8px; flex-wrap:wrap;">
    <a href="策略仓库 (Strategy Repository)/太妃方案" class="internal-link" style="
      background:rgba(147,51,234,0.15);
      color:#a855f7;
      padding:4px 10px;
      border-radius:4px;
      text-decoration:none;
      font-size:0.75em;
      border:1px solid rgba(147,51,234,0.3);
    ">📚 太妃方案</a>
    <a href="策略仓库 (Strategy Repository)/Al Brooks经典" class="internal-link" style="
      background:rgba(236,72,153,0.15);
      color:#ec4899;
      padding:4px 10px;
      border-radius:4px;
      text-decoration:none;
      font-size:0.75em;
      border:1px solid rgba(236,72,153,0.3);
    ">📖 Al Brooks经典</a>
  </div>
</div>`;

const root = dv.el("div", "", { attr: { style: cfg.colors.cardBg } });
root.innerHTML = `
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🗂️ 策略仓库 (Strategy Repository)</div>
${
  html ||
  `<div style='opacity:0.5; font-size:0.8em;'>暂无策略卡片。<br>请在策略仓库中创建策略卡片。</div>`
}
`;

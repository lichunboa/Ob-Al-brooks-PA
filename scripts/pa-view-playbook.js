const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");

// 策略仓库路径
const strategyRepo = "策略仓库 (Strategy Repository)";
const strategies = dv.pages(`"${strategyRepo}"`)
  .where(p => p.categories && p.categories.includes("策略"));

// 按市场周期分类
let cycleGroups = {
  "🚀 急速/突破": ["急速", "突破模式", "Spike", "Breakout"],
  "📈 趋势延续": ["趋势", "强趋势", "趋势回调", "Trend", "Pullback"],
  "🔄 交易区间": ["交易区间", "区间", "Range"],
  "🔃 反转": ["反转", "Reversal"]
};

let html = "";
let totalStrategies = strategies.length;
let activeStrategies = strategies.where(p => p["策略状态"] === "实战中").length;

// 顶部统计
html += `<div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-bottom:16px;">
  <div style="background:rgba(59,130,246,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:${cfg.colors.demo};">${totalStrategies}</div>
    <div style="font-size:0.75em; opacity:0.7;">总策略数</div>
  </div>
  <div style="background:rgba(34,197,94,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#22c55e;">${activeStrategies}</div>
    <div style="font-size:0.75em; opacity:0.7;">实战中</div>
  </div>
  <div style="background:rgba(251,191,36,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#fbbf24;">${totalStrategies - activeStrategies}</div>
    <div style="font-size:0.75em; opacity:0.7;">学习中</div>
  </div>
</div>`;

// 按市场周期分组显示
Object.keys(cycleGroups).forEach((groupName) => {
  let keywords = cycleGroups[groupName];
  let matches = strategies.where((p) => {
    let cycles = p["市场周期"] || [];
    if (!Array.isArray(cycles)) cycles = [cycles];
    return keywords.some((k) => 
      cycles.some(c => c.toString().includes(k))
    );
  });

  if (matches.length > 0) {
    html += `<div style="margin-bottom:12px;">
      <div style="font-size:0.85em; opacity:0.7; font-weight:bold; margin-bottom:6px;">${groupName} (${matches.length})</div>
      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:6px;">`;
    
    for (let s of matches) {
      let strategyName = s["策略名称"] || s.file.name;
      let winRate = s["胜率"] || 0;
      let riskReward = s["盈亏比"] || "N/A";
      let status = s["策略状态"] || "学习中";
      
      // 状态颜色
      let statusColor = status === "实战中" ? "#22c55e" : 
                        status === "验证中" ? "#fbbf24" : 
                        status === "学习中" ? "#3b82f6" : "#6b7280";
      
      // 胜率颜色
      let winRateColor = winRate >= 60 ? "#22c55e" : 
                         winRate >= 50 ? "#fbbf24" : 
                         winRate > 0 ? "#ef4444" : "#6b7280";
      
      html += `<a href="${s.file.path}" class="internal-link" style="
        background:rgba(255,255,255,0.03);
        border:1px solid rgba(255,255,255,0.1);
        padding:8px;
        border-radius:6px;
        text-decoration:none;
        display:block;
        transition: all 0.2s;
      " onmouseover="this.style.background='rgba(59,130,246,0.1)'; this.style.borderColor='rgba(59,130,246,0.3)';" 
         onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.borderColor='rgba(255,255,255,0.1)';">
        <div style="font-size:0.85em; font-weight:600; color:${cfg.colors.demo}; margin-bottom:4px;">${strategyName}</div>
        <div style="display:flex; justify-content:space-between; font-size:0.7em; opacity:0.7;">
          <span style="color:${statusColor};">● ${status}</span>
          <span>R/R: ${riskReward}</span>
        </div>
        ${winRate > 0 ? `<div style="font-size:0.65em; opacity:0.6; margin-top:2px;">胜率: <span style="color:${winRateColor};">${winRate}%</span></div>` : ''}
      </a>`;
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

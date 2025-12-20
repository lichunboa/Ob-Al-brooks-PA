---
categories:
  - 模版
  - 图表分析
tags:
  - PA/Analysis
  - PA/Chart
创建时间: "{{date:YYYY-MM-DD HH:mm}}"
品种/ticker:
  - BTC (比特币)
时间周期/timeframe: 5m
分析时间段: "{{date:HH:mm}}"
市场周期/market_cycle:
  - 急速
观察到的形态/patterns: []
推荐策略/recommended_strategies: []
---

# 📊 图表分析 - {{date:YYYY-MM-DD HH:mm}}

> [!info]- 📋 使用说明
> 1. **截图并粘贴** - 将交易软件图表截图粘贴到下方
> 2. **填写形态** - 勾选你观察到的价格行为形态
> 3. **查看推荐** - 系统会根据形态推荐对应策略
> 4. **创建交易** - 如果准备入场,点击下方按钮创建交易笔记

---

## 📸 图表截图 (Chart Screenshot)

![[粘贴图片到这里]]

---

## 🔍 市场背景分析 (Context Analysis)

### 📍 当前市场周期
- [ ] 🚀 急速/突破 (Spike/Breakout)
- [ ] 📈 强趋势 (Strong Trend)
- [ ] 📉 趋势回调 (Pullback)
- [ ] 🔄 交易区间 (Trading Range)
- [x] 🔃 可能反转 (Potential Reversal)

### 🎯 关键价位标记
```dataviewjs
const canvas = `
建议在图表上标记:
• 20EMA / 其他重要均线
• 近期高点/低点
• 支撑/阻力区域
• 缺口位置
• 通道线
`;
dv.paragraph(canvas);
```

| 类型 | 价位 | 说明 |
|------|------|------|
| 支撑位 |  | 例: 前低点、20EMA |
| 阻力位 |  | 例: 前高点、整数位 |
| 关键均线 |  | 20EMA当前值 |

---

## 🎨 形态识别 (Pattern Recognition)

### 🔥 当前观察到的形态 (勾选所有适用项)

#### 🚀 急速/突破相关
- [ ] 突破后缺口 (Breakout Gap)
- [ ] 急速上涨/下跌 (Spike Up/Down)
- [ ] 看衰突破 (Failed Breakout)

#### 📈 趋势延续
- [x] 20EMA缺口 (20 EMA Gap)
- [ ] 第一均线缺口 (First Moving Average Gap)
- [ ] 收线追进 (Trend Bar Entry)
- [ ] 强趋势通道 (Strong Trend Channel)

#### 🔄 区间相关
- [ ] 区间突破回调 (Breakout Pullback)
- [ ] 三角形区间 (Triangle)
- [ ] 宽幅震荡 (Broad Trading Range)

#### 🔃 反转形态
- [ ] 双顶/双底 (Double Top/Bottom)
- [ ] 楔形顶/底 (Wedge Top/Bottom)
- [ ] 末端旗形 (Terminal Flag)
- [ ] 头肩顶/底 (Head & Shoulders)
- [ ] 高潮式反转 (Climactic Reversal)

#### ⚡ 特殊形态
- [ ] 逆1顺1 (First Counter/First With)
- [ ] 急赴磁体 (Spike to Magnet)
- [ ] 测量移动 (Measured Move)

---

## 💡 策略推荐引擎 (Strategy Recommender)

```dataviewjs
const current = dv.current();
const patterns = current["观察到的形态/patterns"] || [];

// 形态到策略的映射
const patternToStrategy = {
  "20EMA缺口": "策略卡片_20均线缺口",
  "第一均线缺口": "策略卡片_第一均线缺口",
  "收线追进": "策略卡片_收线追进",
  "楔形顶/底": "策略卡片_楔形顶底",
  "双顶/双底": "策略卡片_双重顶底",
  "急赴磁体": "策略卡片_急赴磁体",
  "逆1顺1": "策略卡片_逆1顺1",
  "看衰突破": "策略卡片_看衰突破",
  "强趋势通道": "策略卡片_极速与通道",
  "末端旗形": "策略卡片_末端旗形",
  "区间突破回调": "策略卡片_区间突破回调"
};

if (patterns.length === 0) {
  dv.paragraph("📝 **请在上方勾选观察到的形态,系统将自动推荐对应策略**");
} else {
  dv.header(3, "🎯 根据当前形态,推荐以下策略:");
  
  let recommended = [];
  for (let pattern of patterns) {
    if (patternToStrategy[pattern]) {
      let strategyFile = "策略仓库 (Strategy Repository)/太妃方案/" + patternToStrategy[pattern];
      let strategy = dv.page(strategyFile);
      if (strategy) {
        recommended.push({
          name: strategy["策略名称"],
          pattern: pattern,
          rrRatio: strategy["盈亏比"],
          winRate: strategy["胜率"] || 0,
          path: strategyFile
        });
      }
    }
  }
  
  if (recommended.length > 0) {
    dv.table(
      ["形态", "推荐策略", "盈亏比", "胜率", "操作"],
      recommended.map(s => [
        s.pattern,
        s.name,
        s.rrRatio,
        s.winRate > 0 ? s.winRate + "%" : "N/A",
        `[[${s.path}|📖 查看策略]]`
      ])
    );
    
    dv.paragraph("---");
    dv.paragraph("**📌 下一步操作:**");
    dv.list([
      "点击上方「查看策略」了解入场条件和风险管理",
      "等待信号K出现,确认入场信号质量",
      "使用下方按钮快速创建交易笔记",
      "策略卡片中会显示建议的止损和止盈位置"
    ]);
  } else {
    dv.paragraph("⚠️ 未找到匹配的策略卡片");
  }
}
```

---

## 🎬 快速行动 (Quick Actions)

```dataviewjs
const cfg = {
  colors: {
    live: "#22c55e",
    demo: "#3b82f6",
    back: "#f59e0b"
  }
};

const btn = (color, text, cmd) =>
  `<button onclick="app.commands.executeCommandById('${cmd}')" style="background:${color}; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer; font-weight:bold; margin:4px; font-size:0.9em; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${text}</button>`;

const html = `
<div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); margin-top:12px;">
  <div style="font-size:0.9em; opacity:0.7; margin-bottom:10px;">准备入场? 创建交易笔记:</div>
  <div style="display:flex; gap:8px; flex-wrap:wrap;">
    ${btn(cfg.colors.live, "🟢 创建实盘交易", "quickadd:choice:New Live Trade")}
    ${btn(cfg.colors.demo, "🔵 创建模拟交易", "quickadd:choice:New Demo Trade")}
    ${btn(cfg.colors.back, "🟡 创建回测记录", "quickadd:choice:New Backtest")}
  </div>
</div>`;

dv.el("div", "", { attr: { style: "margin:0;" } }).innerHTML = html;
```

---

## 📝 补充说明 (Additional Notes)

### 💭 市场观察
> 在这里记录任何其他观察、疑问或想法...


### ⚠️ 风险提示
> 记录任何潜在的风险因素或需要注意的点...


---

## 🔗 相关笔记链接

- 📚 [[太妃方案]] - 查看所有策略索引
- 📊 [[每日复盘模版 (Daily Journal)]] - 今日复盘笔记
- 🎯 [[交易员控制台 (Trader Command)4.0]] - 返回控制台

---

> [!tip]+ 💡 使用提示
> - 每次看盘前先创建一个图表分析笔记
> - 客观记录观察到的形态,不要主观臆断
> - 推荐策略只是参考,最终决策取决于你的判断
> - 如果同时出现多个形态,优先选择最明显的
> - 将这个笔记链接到最终的交易笔记中,方便复盘

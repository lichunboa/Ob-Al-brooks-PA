---
封面/cover:
categories:
  - 模版
  - 交易日记
tags:
  - PA/Daily
date: 2025-12-17
账户类型/account_type:
市场周期/market_cycle:
复盘深度/review_depth:
---

# 🌅 1. 盘前准备 (Pre-Market)

### 🌍 宏观与消息 (News)
* **今日数据**: *(例如：CPI, FOMC, 或 None)*
* **隔夜市场**: *(ES/NQ 是高开还是低开？)*

### 🔭 关键点位 (Key Levels)
* **HOD (昨日高)**: 
* **LOD (昨日低)**: 
* **Magnet (磁力点)**: *(例如：未补缺口、整数关口)*

> [!CHECK] 启动检查
> - [ ] 咖啡/水准备好了吗？
> - [ ] 手机静音了吗？
> - [ ] 告诉自己：**"我只交易高胜率的架构，绝不因无聊而开仓。"**

---

# ⚔️ 2. 今日战况 (Trades Today)
*(系统会自动抓取你今天创建的所有交易单，无需手动填写)*

```dataview
TABLE direction as "方向", ticker as "品种", outcome as "结果", net_profit as "盈亏"
FROM "Daily/Trades"
WHERE file.cday = this.file.cday
SORT file.ctime ASC
```

# 🧠 3. 智能策略推荐 (Strategy Assistant)

> [!ai] 根据今日市场周期 `$= dv.current().market_cycle || "未设置"` 推荐：

```dataviewjs
const currentCycle = dv.current().market_cycle;
if (!currentCycle) {
    dv.paragraph("⚠️ **请先在上方设置 '市场周期' 以获取策略推荐。**");
} else {
    // 获取所有活跃策略
    const strategies = dv.pages('"策略仓库"')
        .where(p => p.strategy_status == "实战中 (Active)" && p.market_cycle)
        .where(p => {
            // 检查策略的市场周期是否包含当前周期
            // 处理列表或单个值的情况
            const cycles = Array.isArray(p.market_cycle) ? p.market_cycle : [p.market_cycle];
            // 模糊匹配 (例如 "强趋势" 匹配 "强趋势 (Strong Trend)")
            return cycles.some(c => c.includes(currentCycle) || currentCycle.includes(c));
        });

    if (strategies.length === 0) {
        dv.paragraph(`🚫 在 **${currentCycle}** 周期下暂无推荐的实战策略。建议观望或切换周期。`);
    } else {
        dv.table(
            ["策略名称", "入场条件 (Checklist)", "风险提示 (Risk)", "盈亏比"],
            strategies.map(p => [
                p.file.link,
                p.entry_criteria ? p.entry_criteria.slice(0, 3).join("<br>") + "..." : "无",
                p.risk_alerts ? "⚠️ " + p.risk_alerts.slice(0, 2).join("<br>") : "无",
                p.risk_reward
            ])
        );
    }
}
```

# 🌇 4. 盘后总结 (Post-Market)

### 📊 数据概览

- **总交易数**:
    
- **胜率估算**:
    
- **最大回撤单**: _(哪一笔亏得最惨？为什么？)_
    

### 🧠 心理账户 (Psychology)

- **今日心态评分 (1-10)**:
    
- **是否出现 FOMO/报复性交易?**:
    
    - 如果有，触发点是什么？:
        

### 🚀 明日计划 (Plan for Tomorrow)

- **关注重点**:
    
- **待改进的一个点**:
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

- **今日数据**: _(例如：CPI, FOMC, 或 None)_
- **隔夜市场**: _(ES/NQ 是高开还是低开？)_

### 🔭 关键点位 (Key Levels)

- **HOD (昨日高)**:
- **LOD (昨日低)**:
- **Magnet (磁力点)**: _(例如：未补缺口、整数关口)_

- [ ] 咖啡/水
- [ ] 手机静音
- [ ] 只做高胜率架构

---

# ⚔️ 2. 今日战况 (Trades Today)

（自动抓取今日交易）

TABLE direction as "方向", ticker as "品种", outcome as "结果", default(net_profit, 0) as "盈亏"
FROM "Daily/Trades" or #PA/Trade
WHERE file.cday = this.file.cday AND !contains(file.path, "Templates")
SORT file.ctime ASC

# 🌇 3. 盘后总结 (Post-Market)

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

---

# 🧠 4. 今日制卡（可选 / SR）

（需要 `#flashcards` 才会进入复习）

```text
问题 :: 答案
答案 ::: 问题
我最常犯的错误是 ==过早止盈==
```

-

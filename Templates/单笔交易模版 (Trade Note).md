---
categories:
  - 模版
  - 交易单
tags:
  - PA/Trade
date:
  "{ date }":
账户类型/account_type: 实盘 (Live)
品种/ticker:
时间周期/timeframe: 5m
市场周期/market_cycle:
方向/direction:
设置类别/setup_category:
信号K/signal_bar_quality:
  - 内包线 (ii or ioi)
  - 强阳收盘 (Strong Bull Close)
  - 强阴收盘 (Strong Bear Close)
  - 弱势/长影线 (Weak Tail)
  - 十字星 (Doji)
订单类型/order_type:
入场/entry_price:
止损/stop_loss:
目标位/take_profit:
初始风险/initial_risk:
净利润/net_profit:
结果/outcome:
封面/cover:
执行评价/execution_quality:
---
# 📸 1. 现场图表 (The Setup)
> [!TIP]- 截图规范
> 请务必标记：**入场点**、**初始止损**、**逻辑目标位**。

(在此处粘贴图片，记得在链接前加 ! 号)


---

# 🧠 2. 交易逻辑 (Logic)

| 📍 市场背景 (Context) | 🎯 进场计划 (Execution) |
| :--- | :--- |
| **结构**: ⬜ 趋势 / ⬜ 震荡 / ⬜ 突破 | **策略**: `[[ ]]` |
| **压力**: ⬜ 买方主导 / ⬜ 卖方主导 | **信号K**: ⬜ 强收盘 / ⬜ 弱引线 |
| **关键位**: (均线/前高/缺口) | **订单**: ⬜ Stop / ⬜ Limit |

> [!abstract] 🧮 风险计算器 (Auto Calc)
> ```dataviewjs
> const c = dv.current();
> const e = c["入场/entry_price"];
> const s = c["止损/stop_loss"];
> const t = c["目标位/take_profit"];
> if(e && s) {
>     let risk = Math.abs(e - s).toFixed(2);
>     let reward = t ? Math.abs(t - e).toFixed(2) : "?";
>     let r = t ? (Math.abs(t - e) / Math.abs(e - s)).toFixed(2) : "?";
>     dv.paragraph(`**🛡️ Risk: $${risk}** | **🎯 Reward: $${reward}** | **⚖️ R: ${r}R**`);
> } else { dv.paragraph("<small>请填写价格以激活计算器</small>"); }
> ```

---

# ⚔️ 3. 管理与复盘 (Review)

### 🌊 持仓心流
* **情绪**: 😌 平静 / 😨 焦虑 / 😡 上头 / 🤑 贪婪
* **处理**:
    - [ ] **Set & Forget** (硬止损/硬止盈)
    - [ ] **Trailing** (推止损)
    - [ ] **Scratch / Early Exit** (主动离场)
        * *原因*: (例如：连续3根K线重叠/动能衰竭/发现看错了)

### 🏁 最终判决
> [!summary] 💡 核心教训 (Key Lesson)
> *(一句话总结：这笔交易教会了你什么？)*
> 

> [!fail]- ⚠️ 如果失败/非受迫平仓 (Failure Analysis)
> *如果结果是 Loss 或 Panic Scratch，原因是：*
> * [ ] **看错了背景** (Context Error)
> * [ ] **进得太早/太晚** (Timing Error)
> * [ ] **心态崩了** (Psychology Error - FOMO/Fear)
> * [ ] **纯粹的概率** (Good Trade, Bad Outcome)

---
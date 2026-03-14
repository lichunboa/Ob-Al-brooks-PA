# Brooks 系统根因报告（2026-03-15）

## 1. 当前到底是“每条策略单独链路”，还是“统一 Brooks 流程”？

当前系统不是“每条策略各自一整条独立执行链”，而是：

1. **前端 detector 分开**
   - 各 detector 只负责“发现候选 setup”
   - 例如：`高1/低1`、`高2/低2`、`双重顶底`、`楔形`、`头肩`、`第二腿陷阱`、`末端旗形`

2. **中段统一走 Brooks 路由**
   - 背景识别
   - playbook 路由
   - 候选单过滤
   - 入场结构检查
   - 管理风格归类

3. **后段统一走 Brooks 管理链**
   - `premise`
   - `strength`
   - `protective / scalp / scratch`
   - `BE`
   - `partial / TP`
   - `runner trailing`
   - `re-entry / add-on`

也就是说，**“信号检测是分的，入场后的管理主链是统一的”**。

这点本身是对的，也更接近 Al Brooks。

---

## 2. 当前主链代码落点

### 2.1 背景识别 / 候选信号

- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [strategy_advanced.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py)
- [analysis.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py)

### 2.2 playbook 路由 / 过滤

- [playbook_router.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/market/playbook_router.py)
- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)

### 2.3 premise / strength / 管理

- [premise.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py)
- [strength.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py)
- [manager.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/manager.py)
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

---

## 3. 现在胜率和 PF 为什么卡住？

不是单点问题，而是 4 层叠加。

### 3.1 detector 层还没完全对齐 Brooks

当前已经继续修过：

- `末端旗形`
- `第二腿陷阱`
- `头肩顶/底MTR`

已经从“固定工程阈值”收回到了：

- late trend / TTR / wedge 压缩
- edge test / failed breakout
- major channel break / TBTL

但它们还不是全部问题，只是“明显偏差的 detector”。

### 3.2 最大真实问题是：太多单在成熟前退化成 `protective_stop_exit`

这不是 trailing 不会做，也不是 TP 不会做。

现在真正赚钱的成熟部分并不差：

- `runner_trailing`
- `tp_after_scaleout`
- `protective_scalp_exit`

真正差的是：

- 交易还没成熟成 runner
- 就提前退化到了 `protective_stop`

所以系统的瓶颈已经不是“有没有 detect 到 setup”，而是：

> 一个本来有希望的 Brooks 单，如何从试仓/second entry/failed BO/minor reversal，
> 优雅地变成 scratch、BE、小 scalp，而不是保护性止损。

### 3.3 `protective_stop` 不是一个东西，而是 4 条失败路径

当前最重要的 4 条失败路径：

- `tr_scalp_protect`
- `second_entry_profit`
- `reversal_protect`
- `breakout_protect`

单场景拆解已经说明：

#### BTC 15m 2022

`protective_stop` 最大头是：

- `reversal_protect`
- `tr_scalp_protect`

集中在：

- `头肩顶/底MTR`
- `双重顶/底`
- `低2`

#### BTC 5m 2022

`protective_stop` 最大头是：

- `tr_scalp_protect`
- `second_entry_profit`

也就是说：

- 中频窗口里，反转族退化后没有优雅处理
- 高频窗口里，TR scalp 与 second entry 的保护性管理还不够成熟

### 3.4 成本层会把薄优势继续压回去

当前回测成本口径是：

- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
- 默认 `fee_rate = 0.0004`
- PnL 里按**双边手续费**扣除：
  - 开仓一次
  - 平仓一次

也就是当前主回测里：

- **手续费是统一单边 0.04%**
- **滑点还没有完整建模**
- **不同市场没有独立成本模型**

这带来两个结论：

1. 对 Binance taker 合约来说，这个口径并不离谱；
2. 对外汇 / 指数 / 贵金属来说，这个口径显然不够准确。

### 关于杠杆

杠杆不会改善 `PF`。

杠杆只会影响：

- 资金占用
- 保证金成本
- 风险放大
- 回撤与容错

它不会把负优势策略变成正优势策略。

所以不能指望“加杠杆 + 仓位控制”把当前 `PF < 1` 的逻辑直接变成赚钱系统。

---

## 4. Claude 报告哪些有道理，哪些已经修过

参考文件：

- [Claude分析报告](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/Claude分析报告)

### 4.1 有道理的部分

Claude 说对了几件关键事：

1. `protective_stop_exit` 是最大亏损桶之一
2. `protective_scalp` 如果没有 detail，会名存实亡
3. `follow_through` 判定太粗，容易误伤正常 PB
4. `H1/L1` 不能一刀切按弱单处理，必须按上下文分级

这些判断和当前代码审计是一致的。

### 4.2 已经修过的部分

Claude 报告里最核心的 P0，其实已经不是“待做”，而是已经做了：

- `_activate_protective_scalp()` 现在已经有 family-based fallback detail
- `protective_stop` 与 `runner_trailing` 的分类混淆也已经修了

所以现在不能再把主问题简单理解成“detail 空洞没修”。

### 4.3 Claude 报告还没挖透的地方

Claude 更像指出了“入口问题”，但还没有完全指出“现在真正卡住的位置”。

当前更深的真实问题是：

1. 保护性管理虽然接起来了，但还不够 Brooks 化
2. `protective_stop` 的主来源不是一个统一原因，而是 4 条失败路径
3. 真正赚钱的 mature runner 管理其实没那么差，差的是“成熟前退化”

---

## 5. 现在频率、胜率、PF 还在我们控制中吗？

### 5.1 结论

还在控制中，但只是“可控”，不是“已经稳定可优化”。

### 5.2 当前探针结果

#### 三窗口探针

- 文件：[probe_v3](/tmp/ab_selected_management_report_probe_v3.json)

结果：

- 总交易：`605 -> 607`
- 加权胜率：`33.55% -> 33.44%`
- 平均 PF：`0.742 -> 0.749`

#### 两窗口快探针

- 文件：[probe_v4](/tmp/ab_selected_management_report_probe_v4.json)

结果：

- 总交易：`485 -> 488`
- 加权胜率：`33.61% -> 33.20%`
- 平均 PF：`0.776 -> 0.795`

### 5.3 含义

这说明：

- 频率没有崩
- PF 在继续小幅往上
- 胜率没有明显提升，甚至会小波动

所以现在的状态是：

- 我们已经能做到“不把之前优化整没”
- 但还没有做到“稳步把胜率和 PF 一起拉上去”

---

## 6. 从前往后、从里往外看，当前最根本的原因

### 6.1 背景识别层

已经明显比以前更 Brooks 化了。

问题不再主要在这里。

### 6.2 候选策略预选层

仍有部分弱 detector 需要继续收，但这已经不是系统主因。

### 6.3 入场触发层

H1/H2/L1/L2 的上下文分级还不够细。

尤其：

- `first entry`
- `second entry`
- `failed BO after breakout-follow`

这三类还需要更明确分层。

### 6.4 premise / strength 层

这里已经比之前好很多，但还没完全把：

- 正常 PB
- FT 真失败
- trend → TR 的自然退化

区分干净。

### 6.5 protective / scratch / scalp 层

这是当前最大瓶颈。

根因不是“没有 protective”，而是：

- protective 语义还不够细
- scratch / scalp / runner 的分岔点还不够明确
- 许多单本该小赢/小亏离场，却还是掉到 `protective_stop`

### 6.6 BE / trailing / partial / TP 层

这些层本身不是最差的。

甚至从统计上看，它们是当前系统里相对“会赚钱”的部分。

所以不要再把主矛头放在 trailing 或 TP 本身。

### 6.7 re-entry / add-on 层

还没成为主因。

不是当前最优先要打的地方。

### 6.8 成本层

成本不是唯一原因，但会把薄优势压回去。

如果不做分市场成本建模，后面我们会持续被这个问题干扰判断。

---

## 7. 当前最该继续做什么

### 7.1 继续打 `protective_stop` 四条失败路径

优先级：

1. `tr_scalp_protect`
2. `second_entry_profit`
3. `reversal_protect`
4. `breakout_protect`

### 7.2 把 H1/H2/L1/L2 的上下文分级做透

尤其是：

- Spike / 强 BO 后的 H1
- Tight Channel 中的 H1/H2
- Broad Channel / TR 中的 H1/H2

### 7.3 成本模型分市场

至少要分：

- Binance crypto futures
- cTrader forex
- cTrader indices / metals

否则：

- 现在的 `0.0004 单边统一费率`
- 只适合拿来近似 crypto taker
- 不适合解释外汇、指数、贵金属的真实实盘成本

---

## 8. 一句话结论

现在系统卡住，不是因为“没有信号”，也不是因为“trailing/TP 完全不会”，而是：

> 前端 detector 还剩少量边界没完全对齐 Brooks，
> 但真正把系统卡死的，是大量交易在成熟之前退化成了 `protective_stop_exit`，
> 而这背后又是 `tr_scalp_protect / second_entry_profit / reversal_protect / breakout_protect`
> 四条失败路径在持续漏损。

如果下一阶段只打一件事，就打这四条路径，而不是再广撒网。*** End Patch

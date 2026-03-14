# Brooks 突破性分析报告（2026-03-14）

## 1. 这轮到底做了什么

这轮没有继续抠出场标签，而是直接回到趋势恢复信号质量本身，把 Brooks 原文里明确更像 `endless pullback / weak follow-through / channel -> trading range` 的情形，从 `高1/低1/高2/低2/突破回调/均线缺口` 的可执行主链里剥出去。

本轮实际改动文件：

- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)

核心动作只有两类：

1. 新增 `prior_leg_context + prior_leg_overlap_ratio` 的 `endless pullback` 识别。
2. 在 live 生成层和权威回测路由层同时要求：
   - `BO + follow-through`
   - 或 `reclaimed prior close`
   - 或更明确的 `acceptance`
   否则不再把这类趋势恢复单当成可执行。

这一步的目的不是降频本身，而是把本来就不符合 Brooks 的低质量恢复单拿掉，给后面的管理链留出真正有边际的样本。

## 2. 直接依据的 Brooks 图例

### 2.1 Endless PB 里要等 BO + follow-through

来源：

- `09C Endless PB; different timeframes; countertrend`

图例：

![09C Endless PB](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学/assets/09C Endless PB; different timeframes; countertrend/image 1.png)

要点：

- 图里连续 `H1/H2/H3` 并不自动代表高质量恢复。
- 课件旁注直接写了 `Bear breakout and follow-through`。
- 这类结构里，更合理的是等 `BO + FT`，而不是把每个 `H1/H2` 都当成可执行。

### 2.2 Small Pullback Trend 和 Endless PB 不是一回事

来源：

- `14E Tight Channel (strong trend); Small pullback trend`

图例：

![14E Small Pullback vs Endless PB](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学/assets/14E Tight Channel (strong trend); Small pullback t/image 12.png)

要点：

- 这页直接展示：原本强多的结构，后来出现 `Close below MA / MAG / bull BO follow-through 不好`，所有 buy setup 都失败。
- 也就是说，`tight channel / small pullback trend` 一旦退化成更宽、更弱、更多重叠的回调，语义就变了。
- 我们之前的系统把这两种东西混得太多，这正是趋势恢复族长期 PF 上不来的根源之一。

### 2.3 弱跟进 + 早期 TR 气质，会让趋势恢复退化成 TR 管理

来源：

- `49C Day trading examples (Trade Management focus)`

图例：

![49C Worst Follow-Through](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学/assets/49C Day trading examples (Trade Management focus)/image 12.png)

要点：

- 图里明确写了 `Worst Follow-Through`、`Early TR increases chances for more TR`。
- 这说明很多看上去像趋势恢复的单，实际上在信号刚出现时就已经带着 `TR vibes`。
- 这不是 exit 问题，而是 entry quality 问题。

## 3. 回测样本

### 3.1 精选 9 窗口

输出：

- [v5 基线](/tmp/ab_selected_management_report_20260314_v5.json)
- [v6 收口后](/tmp/ab_selected_management_report_20260314_v6.json)
- [v6 零手续费](/tmp/ab_selected_management_report_20260314_v6_nofee.json)

### 3.2 扩展 8 窗口

输出：

- [扩展基线](/tmp/ab_selected_management_report_20260314_extended.json)
- [扩展 v6](/tmp/ab_selected_management_report_20260314_extended_v6.json)
- [扩展旧零手续费参考](/tmp/ab_selected_management_report_20260314_extended_nofee.json)

## 4. 结果：终于不是只涨一点点

### 4.1 精选 9 窗口

| 指标 | v5 | v6 |
| --- | --- | --- |
| 总交易数 | `3285` | `2064` |
| 加权胜率 | `26.39%` | `29.70%` |
| 整体 PF | `0.605` | `0.680` |

按周期：

| 周期 | v5 PF | v6 PF |
| --- | --- | --- |
| `5m` | `0.554` | `0.649` |
| `15m` | `0.663` | `0.719` |
| `1h` | `0.635` | `0.631` |

按家族：

| 家族 | v5 PF | v6 PF |
| --- | --- | --- |
| `趋势恢复族` | `0.595` | `0.714` |
| `MTR反转族` | `0.664` | `0.684` |
| `高潮/陷阱反转族` | `0.492` | `0.562` |
| `突破追随族` | `0.668` | `0.763` |

代表性策略：

| 策略 | v5 PF | v6 PF |
| --- | --- | --- |
| `高1` | `0.630` | `0.698` |
| `低1` | `0.529` | `0.657` |
| `高2` | `0.588` | `0.699` |
| `低2` | `0.623` | `0.750` |
| `ii突破` | `0.912` | `1.120` |

### 4.2 扩展 8 窗口

| 指标 | 扩展基线 | 扩展 v6 |
| --- | --- | --- |
| 总交易数 | `3094` | `1805` |
| 加权胜率 | `24.98%` | `28.03%` |
| 整体 PF | `0.521` | `0.597` |

按周期：

| 周期 | 基线 PF | v6 PF |
| --- | --- | --- |
| `5m` | `0.502` | `0.554` |
| `15m` | `0.546` | `0.665` |
| `1h` | `0.518` | `0.412` |

按家族：

| 家族 | 基线 PF | v6 PF |
| --- | --- | --- |
| `趋势恢复族` | `0.508` | `0.608` |
| `MTR反转族` | `0.582` | `0.611` |
| `高潮/陷阱反转族` | `0.592` | `0.588` |
| `突破追随族` | `0.214` | `0.387` |

这说明本轮不是“只对精选样本有效”。扩展窗口也同步改善了，只是力度没有精选窗口那么大。

## 5. 这轮最大的发现：手续费不是全部，但它真的很重

精选 9 窗口在 **同一套 v6 规则** 下，手续费版与零手续费版对比：

| 指标 | v6 有手续费 | v6 零手续费 |
| --- | --- | --- |
| 总交易数 | `2064` | `2064` |
| 加权胜率 | `29.70%` | `37.89%` |
| 整体 PF | `0.680` | `1.076` |

按周期：

| 周期 | 有手续费 PF | 零手续费 PF |
| --- | --- | --- |
| `5m` | `0.649` | `1.130` |
| `15m` | `0.719` | `1.037` |
| `1h` | `0.631` | `0.781` |

按家族：

| 家族 | 有手续费 PF | 零手续费 PF |
| --- | --- | --- |
| `趋势恢复族` | `0.714` | `1.144` |
| `MTR反转族` | `0.684` | `1.073` |
| `高潮/陷阱反转族` | `0.562` | `0.859` |
| `突破追随族` | `0.763` | `1.423` |

这组数据非常重要：

1. **我们终于看到“逻辑本身可以赚钱”的证据了。**
2. 但当前 crypto 这套手续费/持仓长度/出场频率组合，会把原本接近可行的优势压回 `1` 以下。
3. 所以之前一直看不到“质变”，不是因为一切都错了，而是因为：
   - 前端信号质量不够纯
   - 后端管理链还不够成熟
   - 再叠加交易成本，最终一起把系统压扁

## 6. 从前往后、从里往外：为什么 PF 还是上不来

### 6.1 信号层

这轮之前，系统最核心的问题不是“信号太少”，而是：

- `高1/低1/高2/低2/突破回调/均线缺口`
- 里面混进了太多 `endless PB / weak FT / channel -> TR`

也就是：

- 形态名字看起来像趋势恢复
- 但 Brooks 的上下文其实还不支持把它当 executable setup

这就是为什么之前会出现：

- 频率不低
- 但大量交易最后掉进 `protective_stop`

### 6.2 路由与入场层

这轮新增的 `prior_leg_context + overlap_ratio` 本质上是在补一件以前缺失的事：

- 把 `small pullback trend`
- 和 `endless pullback / broad weak recovery`

分开对待。

Brooks 的原意不是“看到 H1/H2 就做”，而是：

- 在清晰趋势恢复里做 H1/H2
- 在 endless PB 里等更强确认
- 在 weak FT / early TR 里更快承认它可能只是区间

### 6.3 管理链层

这轮之后，管理链的好坏已经很清楚：

精选 9 窗口有手续费版：

| 动作 | 交易数 | PF |
| --- | --- | --- |
| `protective_stop_exit` | `770` | `0.053` |
| `runner_trailing_exit` | `89` | `999.0` |
| `protective_scalp_exit` | `29` | `999.0` |
| `tp_after_scaleout_exit` | `120` | `205.125` |
| `breakeven_stop_exit` | `682` | `2.660` |

这说明：

1. 真正的 `runner trailing` 没问题。
2. `TP1/TP2` 没问题。
3. `protective scalp` 也没问题。
4. **真正的大坑仍然是 `protective_stop_exit`。**

换句话说：

- 会赚钱的那部分交易，系统已经越来越会了
- 但还有很多交易，在成熟之前就退化成了“差的保护性止损”

### 6.4 成本层

精选 9 窗口 `v6` 在零手续费下已经 `PF > 1`。

这意味着：

- 当前剩余差距已经不只是“逻辑完全错了”
- 更像是“逻辑边缘还不够厚，厚度不足以覆盖交易成本”

因此，下一步必须继续做两件事，而不是只做一件：

1. 继续按 Brooks 提纯信号和管理链
2. 同时把交易行为往更能覆盖成本的方向推

## 7. 当前最明确的根因

到了这一步，根因已经可以收敛成 4 条：

1. **之前最大的偏差，确实是把太多 Endless PB 当成趋势恢复。**
2. **趋势恢复族虽然已经改善，但仍然是最大交易来源，因此仍是整体 PF 的第一拖累。**
3. **`protective_stop_exit` 仍然过大，说明很多单在成熟前就开始退化。**
4. **交易成本非常重。当前很多策略在零手续费下已经接近或超过 `1`，但在真实手续费下还站不住。**

## 8. 现在离 Brooks 还差什么

当前最需要继续对齐的，不是再扩策略名，而是这几件事：

1. `first entry` 和 `second entry` 的命运仍要继续拆细  
   现在 `高2/低2` 已明显优于 `高1/低1`，这很像 Brooks，但还不够彻底。

2. `protective_stop` 还要继续压缩  
   目标是把更多交易往：
   - `breakeven_stop_exit`
   - `protective_scalp_exit`
   - `tp_after_scaleout_exit`
   这三类挪。

3. `突破追随族` 和 `均线缺口族` 的跨样本稳定性不够  
   精选窗口里 `ii突破` 已过 `1`，但扩展窗口里仍然很弱。

4. `1h` 仍未成熟  
   它现在不该是主优化对象。

## 9. 当前结论

这次终于可以下一个更硬的结论：

1. **不是之前所有优化都白做了。**
2. **这轮属于真正有层次的改善，不再只是涨几个点。**
3. **系统已经第一次明确表现出“在零手续费下，主链逻辑是可以过 `1` 的”。**
4. **现在最大的任务，不是再到处找策略，而是继续把：**
   - `趋势恢复族`
   - `protective_stop`
   - `first entry / second entry`
   - `突破追随族` 的跨样本稳定性
   这几块收紧。

如果只用一句话总结这轮：

> 这次的突破，不是已经稳定赚钱了，而是终于证明了：系统的主要问题已经从“不会识别 Brooks 交易”转成了“边际优势还不够厚，无法稳定覆盖真实成本”。  

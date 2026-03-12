# 策略覆盖审计

> 更新于 2026-03-13

本文档回答两个问题：

1. 参考 `knowledge/patrol-l1/references/S4-strategy-match.md`，当前“十几种策略”到底覆盖到哪一步了。
2. 对照 `AB Console-Obsidian` 里的主参考资料，哪些策略已经落到独立代码路由，哪些仍只是信号级别或上下文级别。

## 一、审计基线

当前审计以这两层为准：

- 结构化基线：
  - `knowledge/patrol-l1/references/S4-strategy-match.md`
- 主参考资料：
  - `AB Console-Obsidian/Categories 分类/Al brooks/AL brooks原课程大纲.md`
  - `AB Console-Obsidian/Categories 分类/Al brooks/《价格行为PPT中文笔记》`
  - `AB Console-Obsidian/Categories 分类/Al brooks/图表百科全书-文件夹版`
  - `AB Console-Obsidian/Categories 分类/Al brooks/阿布10种最佳价格行为交易模式.pdf`

说明：

- 直接从 PDF 提取全文时会受到水印和版式污染影响，所以当前覆盖审计主要依赖仓库内已经结构化的 `S4/S6` 文档，再用课程大纲核对策略家族是否一致。
- `S4` 当前列了 15 个 playbook，这是最适合拿来做“代码是否覆盖”的统一基线。

## 二、S4 的 15 个 playbook 是否已覆盖

### 已有独立 Brooks 路由的策略：15 / 15

| S4 ID | 基线名称 | 当前代码状态 | 对应代码路由 |
|---|---|---|---|
| T1 | H1/L1 after BO | 已覆盖 | `T1_FIRST_PULLBACK` |
| T2 | H2/L2 in Channel | 已覆盖 | `T2_TREND_H2` / `T2_BROAD_CHANNEL_RECOVERY` |
| T3 | EMA PB (MAG) | 已覆盖 | `T3_TREND_EMA` / `T3_BROAD_CHANNEL_EMA` |
| T4 | Wedge PB | 已覆盖 | `T4_WEDGE_PULLBACK` |
| T5 | Buy/Sell The Close | 已覆盖 | `T5_BREAKOUT_CHASE` |
| T6 | Channel 内 PB | 已覆盖 | `T6_TR_LEG_FIRST_PULLBACK` / `T6_TR_LEG_CHANNEL_RECOVERY` / `T6_TR_LEG_EMA_RECOVERY` |
| R1 | MTR 5 条件 | 已覆盖 | `R1_BROAD_CHANNEL_REVERSAL` |
| R2 | Climax Reversal | 已覆盖 | `R2_TR_EDGE_REVERSAL` |
| R3 | Channel Line BO Fade | 已覆盖 | `R3_CHANNEL_LINE_BO_FADE` |
| TR1 | BLSHS | 已覆盖 | `TR1_BLSHS` |
| TR2 | Failed BO Fade | 已覆盖 | `TR2_FAILED_BO_FADE` |
| TR3 | 2nd Leg Trap | 已覆盖 | `TR3_SECOND_LEG_TRAP` |
| TR4 | Daily TR Fade | 已覆盖 | `TR4_DAILY_TR_FADE` |
| S1 | HTF S/R Reversal | 已覆盖 | `S1_HTF_SR_REVERSAL` |
| S2 | Micro Channel | 已覆盖 | `S2_MICRO_CHANNEL_REVERSAL` |

## 三、当前结论

按 `S4` 的 15 个 playbook 来算，当前状态已经变成：

- 已具备独立 `playbook_id` 路由：15 个
- `T4 / R3 / TR4 / S1 / S2` 已补上专属 detector 标注层
- 回测侧也已补上各自独立的管理 profile / 管理模板

也就是说：

- 现在已经不是“还缺 3 个 playbook”
- 当前真正剩下的问题，是这些新补齐的 playbook 还缺更长期的统计基线与报告面板细分

## 四、当前代码里额外存在、但不在 S4 主表里的策略家族

这部分不是坏事，但要和 `S4` 的 playbook 口径分开看：

- `ii突破`
- `ioi突破`
- `iii突破`
- `HOY突破`
- `LOY突破`
- `头肩顶MTR`
- `头肩底MTR`
- `第一均线缺口`
- `急赴磁体`（当前只是上下文，不是独立可执行 setup）

这些说明当前代码并不是“策略少”，而是“策略名集合比 S4 playbook 表更细”。问题在于：

- 细粒度信号已经有了
- 但没有全部映射成 `S4` 风格的稳定 playbook 层

补充：

- `iii突破` 和 `LOY突破` 现在已经打通 live 检测、回测过滤、runner 路由和 API 策略列表。
- 但它们目前仍然归在 `T5_BREAKOUT_CHASE` 这类突破追随家族下，还不是 `S4` 意义上的独立 playbook。

## 五、与主参考资料的对应关系

从课程大纲和 `S4/S6` 当前结构化文档交叉看，当前代码已经覆盖到这些主家族：

- H1 / H2 / L1 / L2
- EMA gap / first EMA gap
- Buy/Sell The Close
- ii / ioi / iii breakout
- Double Top / Double Bottom
- Wedge
- Head and Shoulders MTR
- Failed Breakout
- Second Leg Trap
- Final Flag
- Spike / Channel / Broad Channel / Trading Range 路由
- HOY / LOY 关键位突破

所以如果只问“是不是只有几种策略”，答案是否定的。当前已经有十几种以上的可检测信号家族。

真正没收口的是：

- `S4` 的 15 个 playbook 虽然都已可路由并具备专属 detector 标注，但报告层还没有完全按这些 profile 单独汇总。

## 六、建议的补齐顺序

优先级从高到低：

1. 为 `T4 / R3 / TR4 / S1 / S2` 补齐报告标签和独立统计维度。
2. 继续把 `R1 / R2 / R3` 的失败条件与接受条件拆细，避免反转子类之间互相吃单。
3. 把 `TR4_DAILY_TR_FADE` 的开盘时段过滤做成统一配置，而不是只靠当前的早盘窗口启发式。
4. 继续细化 `iii突破 / LOY突破` 的专属统计口径，而不是长期挂在 breakout chase 家族下。

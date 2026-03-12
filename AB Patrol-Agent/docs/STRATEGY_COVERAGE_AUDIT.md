# 策略覆盖审计

> 更新于 2026-03-12

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

### 已有独立 Brooks 路由的策略：8 / 15

| S4 ID | 基线名称 | 当前代码状态 | 对应代码路由 |
|---|---|---|---|
| T1 | H1/L1 after BO | 已覆盖 | `T1_FIRST_PULLBACK` |
| T2 | H2/L2 in Channel | 已覆盖 | `T2_TREND_H2` / `T2_BROAD_CHANNEL_RECOVERY` |
| T3 | EMA PB (MAG) | 已覆盖 | `T3_TREND_EMA` / `T3_BROAD_CHANNEL_EMA` |
| T5 | Buy/Sell The Close | 已覆盖 | `T5_BREAKOUT_CHASE` |
| T6 | Channel 内 PB | 已覆盖 | `T6_TR_LEG_FIRST_PULLBACK` / `T6_TR_LEG_CHANNEL_RECOVERY` / `T6_TR_LEG_EMA_RECOVERY` |
| TR1 | BLSHS | 已覆盖 | `TR1_BLSHS` |
| TR2 | Failed BO Fade | 已覆盖 | `TR2_FAILED_BO_FADE` |
| TR3 | 2nd Leg Trap | 已覆盖 | `TR3_SECOND_LEG_TRAP` |

### 有信号或近似路由，但还没落成独立 playbook 的策略：4 / 15

| S4 ID | 基线名称 | 当前状态 | 现状说明 |
|---|---|---|---|
| T4 | Wedge PB | 部分覆盖 | 有 `楔形顶/底` 信号，但主要被归进 reversal 家族，没有独立 `T4_*` 路由 |
| R1 | MTR 5 条件 | 部分覆盖 | 有 `R1_BROAD_CHANNEL_REVERSAL` 和 `头肩MTR` / DT / DB / Wedge，但 MTR 五条件没有独立成一条清晰 playbook |
| R2 | Climax Reversal | 部分覆盖 | 有 `R2_TR_EDGE_REVERSAL`，但它覆盖的是更宽泛的 TR edge reversal，高潮反转没有单独隔离 |
| R3 | Channel Line BO Fade | 部分覆盖 | 语义大概率被吸收到 `R1/R2`，当前没有独立的 `R3_*` 路由 |

### 基线里有，但当前还没有独立实现的策略：3 / 15

| S4 ID | 基线名称 | 当前状态 | 现状说明 |
|---|---|---|---|
| TR4 | Daily TR Fade | 缺失 | 没有独立 `playbook_id`，也没有专门的日线 TR fade 路由 |
| S1 | HTF S/R Reversal | 缺失 | 有 higher timeframe 背景、HOY/LOY、关键位证据，但没有独立 S1 playbook |
| S2 | Micro Channel | 缺失 | 有 ii/ioi/iii 与 micro gap 语义，但没有独立 Micro Channel playbook |

## 三、当前结论

按 `S4` 的 15 个 playbook 来算，当前状态是：

- 已明确独立覆盖：8 个
- 部分覆盖 / 被合并吸收：4 个
- 还缺独立实现：3 个

也就是说：

- 代码里已经不止“十几种信号”，但**还不是“十五个 S4 playbook 全部独立落地”**。
- 当前更像是“信号种类很多，独立 playbook 路由还差最后一层收口”。

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

- `S4` 的 15 个 playbook 还没有一一变成稳定、清晰、互不重叠的独立路由层。

## 六、建议的补齐顺序

优先级从高到低：

1. 把 `T4_WEDGE_PB` 从当前 reversal 大类里拆出来，单独建顺势楔形回调路由。
2. 把 `R1 / R2 / R3` 的语义拆清，不要继续让 `R1_BROAD_CHANNEL_REVERSAL` / `R2_TR_EDGE_REVERSAL` 吃掉太多反转子类型。
3. 补 `TR4_DAILY_TR_FADE`，因为它是 `S4` 里唯一当前完全缺位的 TR 子类。
4. 把 `S1_HTF_SR_REVERSAL` 从现在的 higher timeframe 背景证据里提升成独立 playbook。
5. 决定 `S2_MICRO_CHANNEL` 是用 `ii/ioi/iii` 演化出来，还是单独做 Micro Channel 检测与路由。

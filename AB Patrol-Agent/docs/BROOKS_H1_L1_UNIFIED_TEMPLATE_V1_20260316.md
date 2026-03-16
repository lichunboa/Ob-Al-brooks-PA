# 高1/低1统一模板 v1

更新时间：2026-03-16

## 1. 目的

这份文档只做一件事：把 `高1/低1` 固定为 **同一个 Brooks 模板**，后续代码只能按这份模板实现，不再把：

- 背景
- 信号K线
- 入场触发
- 止损
- 目标位
- 持仓管理

混在一个大函数里一起猜着改。

这份模板的定位是：

1. `高1/低1` 理论上是一回事，只是多空镜像  
2. `高1/低1` 是趋势恢复族里最基础的一层  
3. 后续 `高2/低2`、`突破回调`、`20均线缺口/第一均线缺口/MAG` 都要复用这套模板的公共模块

## 2. 资料优先级

本模板只按下面顺序取证：

1. `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版`
2. `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/AL brooks原课程大纲.md`
3. `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为`

说明：

- `LLM可读版` 已经是课程 PDF、百科页图、Ali 实战材料的主入口。
- 太妃资料只用于补充 `EMA20 缺口 / 首次回调序列` 的细节，不替代 Brooks 原文。

## 3. 课程大纲对应知识点

和 `高1/低1` 直接相关的章节：

- `08A-08D`：信号K线、入场K线、第二个信号、反趋势需要更强信号
- `09A-09C`：回调定义、条形计数、无休止回调
- `10A-11D`：买卖压力、通道、缺口、移动平均线缺口
- `12A-18F`：市场周期、Always In、趋势/通道/交易区间、小回调趋势、TTR
- `19A-20B`：支撑阻力、前高前低、50%回调、测量走势
- `30A-30E`：交易方程、概率、40-60 规则、TR 顶底概率
- `31A-31D`：波段与剥头皮、把波段转成 scalp
- `32A-32C`：订单类型，止损单对大多数交易者更好
- `33A-33G`：保护性止损、趋势尊重主要回调、前提变化退出、保本止损
- `34A-34B`：实际风险决定利润目标
- `35A-35C`：加仓
- `36A`：交易管理发生在入场之后

## 4. 直接证据页

### 4.1 H1/H2 原文页

- 文本页：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- 图页：
  - ![H1/H2 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)

关键原句：

- `the first time the high of a bar is at or above the high of the prior bar, the pullback is a High 1 bull flag`
- `If it triggers, but there is then one more leg down, that creates a High 2 bull flag`
- `Choose one entry and rely on stop`
- `May be several High 1 PBs before market weakens enough to form High 2 or 3 PBs`

### 4.2 L1/L2 原文页

- 文本页：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0004.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0004.md)
- 图页：
  - ![L1/L2 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0004.jpg)

关键原句：

- `Low 1 and Low 2 in Bear Trend or TR`
- `a one legged pullback (small rally) is a Low 1 sell setup`
- `If it triggers, but there is then one more leg in the pullback, it creates a Low 2 bear flag`
- `They often scalp these setups, but when the trend is still strong, they can swing part or all of their position`

### 4.3 进阶课页：在旗形上方用 stop 入场

- 文本页：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0276.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0276.md)
- 图页：
  - ![H1/H2 stop 入场页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-0276.jpg)

关键原句：

- `Buy above PB bar`
- `PB is ending, trend is resuming`
- `High 1, High 2, and H3 (Wedge) Bull Flags`
- `Choose one entry and rely on stop`

### 4.4 太妃补充：20 均线缺口

- 文本页：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md)

这份资料对 `高1/低1` 的补充价值在于：

- `20 gap` 里的同侧 `HL1/LH1` 实际就是趋势恢复第一信号
- `20-30` 根 EMA 同侧偏离，只应作为 gap 子流程的背景过滤，不应强行灌进所有 `H1/L1`

## 5. 高1/低1统一模板

### 5.1 模板原则

`高1/低1` 只有 **一个模板**：

- 多头是 `BUY` 镜像
- 空头是 `SELL` 镜像

不能做成：

- 两套理论
- 两套完全独立的阈值系统
- 一个大函数里塞一堆未验证的硬过滤

### 5.2 模板字段

后续代码和文档必须统一按这 14 项描述：

1. 背景
2. 关键位置
3. setup 前提
4. signal bar 类型
5. entry trigger
6. 触发失效
7. 初始止损类型
8. 实际风险
9. 仓位与杠杆
10. 第一目标
11. partial / scalp / swing
12. BE 条件
13. 提前离场
14. re-entry / add-on

## 6. 各字段具体规格

### 6.1 背景

允许出现 `H1/L1` 的背景：

1. 趋势中的第一次回调
2. 交易区间中的趋势腿回调
3. spike / tight channel 中第一次明确 pullback
4. EMA20 附近的首次趋势恢复

不允许：

1. 已经明显演化成 `H2/L2`
2. 已经是 `楔形/双顶双底/MTR`
3. 已经更像 `endless pullback`
4. 背景已经退化成 `TTR/LOM`，而信号却仍按强趋势 continuation 做

### 6.2 关键位置

`H1/L1` 必须至少识别这些位置：

1. `EMA20`
2. 最近一次回调起点
3. prior high / prior low
4. 最近 breakout point
5. 通道线 / 趋势线
6. 区间边缘 / 区间中轴

位置不是硬 veto 列表，而是用于：

- 判断 signal bar 是否发生在合理区
- 判断第一目标该放哪里
- 判断失败后是否更像转成 TR

### 6.3 setup 前提

`H1/L1` 的定义：

- 一段 pullback 已经形成
- 第一次恢复尝试出现
- 价格尝试突破前一根 bar 的 high/low

它不是：

- 任意一根趋势棒
- 任意 `EMA touch`
- 任意 breakout follow-through

### 6.4 signal bar 类型

不能再只用一个 `signal_bar_quality` 分数表达。至少要拆成：

1. 趋势棒型 signal bar  
   - close 靠近高/低
   - 实体占优
2. 反转棒型 signal bar  
   - 尾巴明显
   - 位置关键
3. inside / ii / ioi 子形态 signal bar
4. micro double top / micro double bottom 上下文 signal bar
5. EMA 附近恢复型 signal bar

signal bar 必须记录的原子特征：

- bull / bear
- close 靠近 high / low 程度
- 顺势尾巴 / 逆势尾巴比例
- 是否为 inside/outside
- 是否在关键位置形成

### 6.5 entry trigger

统一规则：

- `BUY`: 在 signal bar 高点上方一个最小波动单位触发
- `SELL`: 在 signal bar 低点下方一个最小波动单位触发

也就是：

- `entry_type = STOP`
- `entry_trigger = signal_bar_extreme ± 1 tick/pip/min_increment`

注意：

- `price` 是信号参考价
- `entry_trigger` 是订单真正触发价
- 风险、收益、仓位必须按 `entry_trigger` 算，不是按 `close`

### 6.6 触发失效

必须单独记录：

1. 若若干根内未触发，setup 失效
2. 若触发前先破坏 signal bar 另一侧，setup 失效
3. 若触发前已进入明显 `H2/L2`、`楔形`、`TR` 语义，原 `H1/L1` 失效

### 6.7 初始止损类型

`H1/L1` 不只一种止损，必须分型：

1. `signal_bar_stop`
   - 放在 signal bar 另一侧之外
   - 适合强信号、强背景
2. `swing_stop`
   - 放在最近 swing low / swing high 外
   - 适合更宽的 pullback
3. `major_hl_lh_stop`
   - 放在主要 HL/LH 外
   - 适合更偏波段持有

原文支持：

- `Protective Stops: Beyond Signal Bar`
- `Reasonable stop is always obvious`

### 6.8 实际风险

必须区分：

- `nominal risk`：看起来的 signal bar 距离
- `actual risk`：`entry_trigger` 到 `stop_loss` 的真实距离

后续目标、仓位、是否值得交易，都要按 `actual risk`。

### 6.9 仓位与杠杆

模板只规定原则，不在 detector 里直接决定仓位大小：

1. 杠杆不改变 setup 质量
2. 仓位按 `actual risk` 反推
3. 若正确止损过大，就应该缩小仓位，而不是篡改止损

### 6.10 第一目标

不能再固定 `2R/3R`。

`H1/L1` 的第一目标层级应按背景选：

1. 回调前最近高/低点
2. prior highest close / lowest close
3. breakout point 回测位
4. `L1 = L2 / H1 = H2` 这类 measured move
5. 区间腿的对称目标

离场可以略早于目标：

- 允许 `target_buffer`，避免刚好碰位却出不掉

### 6.11 partial / scalp / swing

`H1/L1` 默认不能机械当成纯 swing。

更符合 Brooks 的处理：

1. first entry 默认允许更偏 `scalp or partial`
2. 趋势仍强时，才保留 `swing part`
3. `H2/L2` 往往比 `H1/L1` 更适合留 runner

### 6.12 BE 条件

`H1/L1` 的保本，不应太晚，也不能一触即移。

合理条件通常包括：

1. 已经实现第一小目标
2. 已经出现明确二段走势预期
3. 已经脱离危险位并站稳 prior close / EMA 一侧

### 6.13 提前离场

出现这些情况时，要允许提前离场或降级成 scalp：

1. follow-through 明显不足
2. 回到区间内部
3. 强反向 signal bar 出现在关键位置
4. 明显演化成 `endless pullback`
5. 本应是 continuation，结果出现 `major channel break`

### 6.14 re-entry / add-on

`H1/L1` 失败后常见演化：

1. 失败 -> 形成 `H2/L2`
2. 失败 -> 形成 `楔形`
3. 失败 -> 退化成 TR

所以：

- `re-entry` 可以有，但应交给后续 `H2/L2` 或其他模板
- `add-on` 不应在 first entry 阶段默认开启

## 7. 目前代码最容易犯错的地方

### 7.1 不该再混的东西

下面这些不能再在同一轮里一起改：

1. signal bar 过滤
2. `STOP` 触发语义
3. `price` 参考价
4. `stop_loss` 类型
5. `target` 类型

因为这会导致：

- 频率变化
- 胜率变化
- PF 变化

全部混在一起，根本分不清是谁带坏了结果。

### 7.2 这轮明确不要灌进 H1/L1 的东西

下面这些先不要强塞进 `H1/L1` 基础模板：

1. `20-30 根 EMA 同侧`  
   - 这是 gap 子流程背景，不是所有 H1/L1 必选条件
2. `wrong_side EMA closes` 的过严硬阈值
3. `pullback_bars` 的僵硬上限
4. `wick_ratio` 的镜像硬阈值
5. `depth_ratio` 的统一硬阈值

这些可以后面作为“质量过滤器”单独验证，但不能和模板基础骨架捆绑。

## 8. 后续代码改造顺序

只按这个顺序改，不允许跳步：

### 第一步：统一 STOP 语义

只做：

- `entry_type = STOP`
- `entry_trigger = signal bar 外一跳`
- `price` 与 `entry_trigger` 分离

不改：

- signal bar 过滤
- 目标位
- 管理层

### 第二步：信号K线类型学

只做：

- 记录 signal bar 原子特征
- 不再靠单一分数

### 第三步：止损类型模块

只做：

- `signal_bar_stop`
- `swing_stop`
- `major_hl_lh_stop`

### 第四步：目标位层级

只做：

- 最近高低点
- highest/lowest close
- measured move
- 提前一跳离场缓冲

### 第五步：管理层

只做：

- first entry 偏 scalp/partial
- 趋势强时留部分 runner
- 提前离场与 BE 条件

## 9. 这份模板的直接产出

后续至少要产出 3 份对应物：

1. `H1/L1` 代码实现文档
2. `H1/L1` 回测验证报告
3. `H1/L1` 知识点-代码映射表

这样以后 `H2/L2`、`突破回调`、`20 gap` 都可以按同样模板复制。

## 10. 当前结论

这轮的结论固定为：

- `高1/低1` 理论上是一套模板，不拆成两套理论
- 但实现上必须分层，不能再把一堆硬阈值塞进一个函数
- 先把模板写死，再改代码
- `20均线缺口 / 第一均线缺口 / MAG` 属于相关但不同模板族，不能混进 `H1/L1` 的基础模板里

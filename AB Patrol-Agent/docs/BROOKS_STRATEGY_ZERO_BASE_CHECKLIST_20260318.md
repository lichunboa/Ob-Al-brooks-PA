# Brooks 策略归零分析通用检查清单

更新日期：2026-03-18

## 1. 文档目的

这份文档不是某一轮回测的临时复盘，而是把这几天在 `H1/L1` 和 `20-gap` 上真正踩出来的经验，整理成一套以后所有策略族都能复用的长期检查清单。

适用对象：

- `H1/L1`
- `H2/L2`
- `突破回调`
- `20均线缺口 / 第一均线缺口 / MAG`
- 后续其他 Brooks 策略族

核心原则：

1. 先归零，再优化。
2. 先查链路，再调阈值。
3. 先证明理论支持，再保留代码。
4. 先固定验证口径，再谈“是否变好”。
5. 禁止围着单一窗口、单一品种、单一周期做特调。

---

## 2. 先说已经被验证过的核心经验

### 2.1 `H1/L1` 真正打出来的经验

`H1/L1` 最重要的经验不是某一个 magic number，而是下面几条：

1. **多周期角色必须先统一**
   - 必须先统一 `结构周期 / 主背景周期 / 锚定周期`
   - 如果实时链和回测链的多周期角色不一致，后面所有优化都会变形

2. **`STOP` 触发必须是真触发**
   - 不允许“名义上是 STOP，实际上还是 close confirmation”
   - `entry_trigger` 和 `actual risk` 必须围绕真实触发价计算

3. **signal bar 不能只看总分**
   - 要先拆 `trend_bar / reversal_bar / inside_bar / recovery_bar`
   - 再在类型内看 `close_position / body_ratio / tail_ratio`

4. **目标必须分层**
   - 不能再用单一 `2R / 3R`
   - 必须分 `rescue / close-test / swing / stretch`

5. **first-entry 和 second-entry 不能混管**
   - 弱 `first-entry` 很多时候只该期待 `BE / rescue / close-test`
   - 不是一律按 continuation swing 去扛

6. **弱 setup 必须前置分流**
   - `no_trade`
   - `scalp_only`
   - `fade_candidate`
   - `swing`

7. **成本门槛必须前置**
   - 如果第一目标覆盖不了手续费、滑点、buffer
   - 就不能先立项成 continuation，再靠管理补救

8. **工程标签可以保留，但不能变成第二套理论**
   - `strong / medium / weak`
   - `scalp_only / no_trade / fade_candidate`
   - `rescue / close-test / swing`
   - 这些只能当 Brooks 语义标签，不能长成品种/周期特调

### 2.2 `20-gap` 真正打出来的经验

`20-gap` 这轮最重要的经验，不是“某个参数要改多少”，而是：

1. **同名 setup 不能在 detector 和 runner 里变成两种东西**
   - detector 说是 `20-gap continuation`
   - runner 又把它改写成 `close-test/scalp`
   - 这会直接把策略语义打坏

2. **模板自己的目标层级不能被通用路由覆盖**
   - `close-test / rescue / trend_extreme`
   - 必须优先尊重策略模板自己的目标语义

3. **`valid_previous_entry` 这类字段必须真正透传**
   - 不能 detector 写了，后面又被通用链覆盖回 `False`

4. **先补审计链，再谈优化**
   - 如果没有逐笔的：
     - `MFE / MAE`
     - `max_positive_r / max_negative_r`
     - `setup_mode / expected_objective`
     - `setup_disposition / management_template`
   - 就是在盲调

5. **不要把所有弱单都当成 detector 问题**
   - 很多时候 detector 已经放出频率了
   - 真正卡住的是：
     - 预路由分流
     - 目标层级
     - 弱 setup 入场质量

6. **要警惕“统一收目标”这类看似有效、其实不稳的改动**
   - 单场景变好不代表通用
   - 必须看 `fixed / random / stress`

7. **真正的突破点通常是链路 bug 或语义错位**
   - 不是“再加一条阈值”
   - 常见突破口：
     - 字段被覆盖
     - 目标被覆盖
     - 同名 setup 被重新解释
     - 审计链缺字段导致误判

---

## 3. 通用归零分析流程

后面所有策略优化，统一按下面顺序走，不要跳步骤。

### 第 0.5 步：先确认当前是不是“干净基线 + 单一新改动”

这是这轮 `20-gap` 新补出来的一条硬规则。

必须先确认：

1. 当前工作区是不是混着多个未收口实验
2. 当前回测是不是只对应一条新改动
3. `runner / report / diagnostics` 是否同时存在多轮残留
4. 版本对照表里的结论，是否真的来自同一份代码

如果这一步没做，后面很容易出现：

- `F1` 变好，但 `R1` 异常变差
- 表面看是某条新规则生效
- 实际上是旧实验残留一起影响了结果

要求：

- 每轮正式验证前，必须先看 `git diff --stat`
- 对关键文件至少看一遍 `git diff`
- 需要时把“当前基线”和“新实验”拆成两步提交或两段 patch

### 第 0 步：先写清楚交易员视角下这个策略到底是什么

必须先回答：

1. 这个策略在 Brooks / 课程 / 太妃语境里，**到底是什么 setup**？
2. 它是：
   - continuation
   - reversal
   - test
   - rescue
   - scalp
   - swing
3. 交易员在做这笔单时，真正期待的是什么？
4. 哪些情况应该直接不做？
5. 哪些情况应该降级成 scalp？

如果这一步没写清楚，后面所有代码检查都会越调越偏。

### 第 1 步：把执行链完整摊开

每个策略都必须完整列出这 16 个环节：

1. 多周期角色
2. 背景判定
3. 位置判定
4. setup 前提
5. variant / setup_mode 分桶
6. signal bar 类型学
7. entry trigger
8. 失效前拦截
9. 初始止损
10. actual risk
11. 成本门槛
12. 目标层级
13. 弱 setup 分流
14. 管理模板
15. 出场与保护
16. 审计导出链

要求：

- 每一步都要有对应代码位置
- 每一步都要能回答“当前到底怎么做”
- 每一步都要能回答“理论上应该怎么做”

### 第 2 步：先查有没有链路 bug，再查参数

优先检查这些高价值问题：

1. detector 写入的字段，后面有没有被覆盖
2. 模板自己的目标层级，后面有没有被通用目标覆盖
3. 同一个 setup，在 detector / runner / exchange 里有没有被定义成不同东西
4. 审计链有没有缺字段，导致以为某条件没生效
5. 实时链和回测链的同一字段语义是否一致
6. 当前回测是否是在“干净基线 + 单一新改动”上跑出来的

如果这里有 bug，继续调参数基本都在浪费时间。

### 第 3 步：把频率、胜率、PF 分开看

不要只盯总 PF。

必须拆成三类问题：

1. **卡频率**
   - detector 根本没放出来
   - route 过早拦掉
   - 成本门槛过严
   - 同名 setup 被误降级

2. **卡胜率**
   - 入场质量差
   - signal bar 质量差
   - 弱背景误当强 continuation
   - 方向或位置错

3. **卡 PF**
   - 目标过远吃不到
   - 目标过近不够覆盖成本
   - 该 scalp 的被当 swing
   - 该 no-trade 的被做了

### 第 4 步：强制做逐笔审计

每个卡住的策略，至少要导出这些字段：

- `setup_mode`
- `setup_mode_reason`
- `expected_objective`
- `setup_disposition`
- `setup_disposition_reason`
- `management_template`
- `management_style`
- `valid_previous_entry`
- `signal_bar_type`
- `signal_bar_tail_ratio`
- `signal_bar_close_position`
- `signal_bar_quality`
- `first_target_distance_r`
- `close_test_target_distance_r`
- `rescue_target_distance_r`
- `mfe_r`
- `mae_r`
- `max_positive_r`
- `max_negative_r`

没有这组字段，就不允许继续细调。

### 第 5 步：先找“统一坏簇”，不要直接加全局规则

典型坏簇长这样：

- `broad_range + close-test + scalp_only`
- `weak trend + continuation`
- `first-entry + no valid previous entry`
- `signal_bar=trend_bar 但结构错半区`

必须先把坏簇定义清楚，再加规则。

不允许直接写：

- “所有区间都不做”
- “所有 20-gap 都收近目标”
- “所有 5m 都更严格”

### 第 6 步：每次只改一层

每一回合只能改：

- detector
或
- route / disposition
或
- target layer
或
- management
或
- 审计链

禁止一回合同时改：

- detector + target + management

因为这样根本无法知道到底哪一层生效了。

### 第 7 步：固定验证口径

统一使用：

- `fixed`
- `random`
- `stress5m`

必要时加：

- `stress15m`
- `stress1h`

必须同时记录：

- 交易数
- 日频
- 胜率
- PF

不能只说“感觉变好了”。

---

## 4. 长期检查清单

以后每个策略族都按下面清单一项一项过。

### A. 理论对齐清单

1. 这个策略的定义，是否能在 Brooks / 太妃资料里直接找到？
2. 当前代码实现的 setup 名称，是否和理论里的 setup 语义一致？
3. 当前策略是 continuation、test、rescue、reversal 还是 mixed？
4. 当前 detector 是否把不同语义混成一个 setup 名字？
5. 当前是否存在“代码叫 A，实际行为像 B”的情况？

### B. 多周期角色清单

1. 结构周期是否合理？
2. 主背景周期是否合理？
3. 锚定周期是否合理？
4. 实时链和回测链是否一致？
5. 是否存在某个周期独有的一套理论分支？

### C. 候选生成清单

1. detector 是否根本没放出频率？
2. 候选到正式信号的漏斗在哪里掉量？
3. `variant / setup_mode` 分桶是否合理？
4. 是不是把大多数 continuation 都打成了 test？
5. 有没有“剩余桶”式定义，导致策略只是别人筛完后的残余？

### D. signal bar 清单

1. 当前主胜率簇是什么类型的 signal bar？
2. 当前主亏损簇是什么类型的 signal bar？
3. `trend_bar / reversal_bar / inside_bar / recovery_bar` 是否真的分开了？
4. `tail_ratio / close_position / quality` 是在区分胜负，还是只是看起来重要？
5. 有没有某类弱 bar 被系统性放进去？

### E. 入场方式清单

1. 这个策略理论上应该 `STOP` 还是 `LIMIT`？
2. 当前代码实际入场方式是什么？
3. 是否存在“理论是回踩 limit，代码却用 stop 追价”的错位？
4. 是否存在“理论是 stop trigger，代码却又偷偷要求收盘确认”的错位？
5. entry trigger、entry price、original entry price 是否都能在审计里看到？

### F. 止损清单

1. 当前止损是：
   - `signal_bar_stop`
   - `swing_stop`
   - `major structure stop`
   - 还是混合？
2. 当前止损是否与策略模板语义一致？
3. 是否存在为了追求频率，把止损挤得过近？
4. 是否存在止损远到实际只剩很差的 `actual risk`？

### G. 成本与目标清单

1. 第一目标是否覆盖成本？
2. 模板自己的目标层级是否被通用链覆盖？
3. 是否强行用前高/前低，而忽略 close-test / rescue / highest-close / lowest-close？
4. 是目标过远，还是目标过近？
5. `first_target_distance_r` 是否真的能区分可交易和不可交易？

### H. 弱 setup 分流清单

1. 当前弱单应该：
   - `no_trade`
   - `scalp_only`
   - `fade_candidate`
   - `continuation`
   - `test`
2. 是否把弱单一律塞进 swing？
3. 是否把几乎所有单都先压成 `test/scalp`？
4. 是否存在“同名 setup 在后面被偷偷降级成另一种东西”？

### I. 持仓管理清单

1. 当前管理模板是否真正读到了 detector 写入的字段？
2. 弱 setup 是否已经正确降成 scalp？
3. scalp 目标是否过近或过远？
4. 亏损单有无足够 `MFE`？
5. 如果亏损单没有 `MFE`，问题在 entry，不在目标
6. 如果亏损单有 `MFE` 但没吃到，问题才在目标/退出

### J. 审计清单

1. 当前报表能不能看出：
   - `setup_mode`
   - `expected_objective`
   - `management_template`
   - `entry_type`
   - `MFE/MAE`
2. 是否有关键字段在 detector 有、成交单没有？
3. 是否有关键字段在成交单有、报表没导出？

---

## 5. 频率、胜率、PF 的常见阻塞点

### 5.1 卡频率的常见原因

1. detector 太严
2. setup 被错误打进 `test`
3. 成本门槛过严
4. 同名 setup 被后续链误降级
5. signal bar 硬 veto 过多
6. 候选到正式信号的收束逻辑错
7. entry_type 与策略语义错位，导致本来能成交的 setup 根本进不来

### 5.2 卡胜率的常见原因

1. 弱背景误当强 continuation
2. 弱 signal bar 被放进来
3. 结构位置不对
4. 第一次回踩和重复测试没分开
5. 该 limit 的用了 stop
6. 该 no-trade 的被硬做

### 5.3 卡 PF 的常见原因

1. 目标太远，根本吃不到
2. 目标太近，覆盖不了成本
3. 该 scalp 的被当 swing
4. 该 close-test 的被当 continuation
5. 该 continuation 的又被过度降级成 scalp
6. 亏损单本来给过 `0.3R~0.5R`，但管理没吃到
7. 亏损单根本不给正向 excursion，说明问题在 entry 质量

---

## 6. 每次卡住时，强制找的“突破口”

以后每个策略用完清单后，必须再强制问一遍：

### 6.1 有没有链路 bug？

- 字段被覆盖了吗？
- 目标被覆盖了吗？
- setup 名字和行为对得上吗？
- 审计链漏字段了吗？

### 6.2 有没有“同名不同物”？

- detector 说 continuation
- runner 却按 scalp
- management 又按 test

这种情况一旦存在，参数调优几乎一定会转进牛角尖。

### 6.3 有没有“默认工程行为”在悄悄改策略？

比如：

- 默认 `STOP`
- 默认通用 target
- 默认通用 protective
- 默认通用路由

这些默认值经常才是真正的 blocker。

### 6.4 有没有把问题看成了“目标位问题”，其实是“入场质量问题”？

判断方法：

- 亏损单有没有 `MFE`
- 有没有到过 `0.2R / 0.3R / 0.5R`

如果没有，问题在 entry。  
如果有但没吃到，问题在 target / exit。

### 6.5 有没有把问题看成了“背景问题”，其实是“语义分桶问题”？

常见错法：

- 把 5m 不好归因成“5m 噪音大”
- 把 15m 变差归因成“15m 不是 Brooks 周期”

真正该先查的是：

- 多周期角色有没有统一
- setup 是否被错误分桶
- 同名 setup 是否被后续链改写

---

## 7. 后续策略统一执行方式

以后每个新策略族统一按下面流程执行：

1. 先写“交易员视角定义”
2. 再写“16 步执行链”
3. 再跑 `fixed / random / stress`
4. 再做逐笔审计
5. 再找坏簇
6. 每次只改一层
7. 每次都保留：
   - 交易数
   - 日频
   - 胜率
   - PF
8. 每次都强制问：
   - 有没有链路 bug
   - 有没有同名不同物
   - 有没有默认工程行为悄悄改策略

---

## 8. 当前对 20-gap 的直接提醒

按当前归零进度，`20-gap` 现在最该优先怀疑的，不再是“目标位略微收一点”这种末端问题，而是：

1. 弱 `broad_range + close-test` 的入场质量
2. detector 与 runner 是否还存在 setup 语义错位
3. 审计链是否已经足够解释：
   - 为什么有些单几乎不给正向 excursion
   - 为什么有些单明明给过 `0.3R+`，却还是亏损

也就是说：

- 先查清楚“亏在 entry 还是亏在 exit”
- 再决定下一刀改 detector、entry 还是 management

这套方法，以后也适用于其他策略族。

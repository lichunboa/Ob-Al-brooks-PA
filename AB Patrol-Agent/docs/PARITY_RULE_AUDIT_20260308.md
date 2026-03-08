# AB Patrol-Agent Parity Rule Audit

更新时间：2026-03-08

## 目标

本审计只回答一个问题：

`AB Patrol-Agent` 现在距离原 `Claude CLI + patrol-l1 skill/S 文件` 还有多远，哪些地方会直接影响“该开的单没开 / 不该开的单开了 / 持仓管理不一致”。

---

## 审计基准

权威来源：

- 原始 skill：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/.claude/skills/patrol-l1/SKILL.md`
- 原始 S 文件：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/.claude/skills/patrol-l1/references`
- 运行副本：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1`
- 当前 runtime：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py`
- 当前交易闸门：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_trade.py`
- 执行服务：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/execution-service/src/executor.py`
- 历史成交样本：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Daily/Trades`
- Al Brooks 课程大纲：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/AL brooks原课程大纲.md`

---

## 审计维度

### 1. 知识源一致性

原规则：

- `SKILL.md` 是总流程。
- `S0-S7` 是可路由的操作与知识分层。
- 不允许 runtime 自己发明一套和原 S 文件无关的“简化规则”。

当前状态：

- `运行知识源 = 原始副本`，不再走 `runtime-brief`。
- 当前已确认直接读取：
  - `SKILL.md`
  - `S3b-key-levels.md`
  - `S5-evaluation.md`
  - `S6-common.md`
  - `S6-reversal.md`

评估：

- 状态：`部分通过`
- 结论：知识来源回正了，但“每轮加载哪些章节/哪些 S 文件”仍需继续和原状态路由一一对齐。

风险：

- 如果状态路由不精确，模型即使读的是原文，也可能读错模块。

---

### 2. K 线数据量与读盘方式

原规则：

- `S1-reading.md` 明确要求：
  - 浏览 80 根
  - 精读 20 根
- `SKILL.md` 明确要求每周期约 100+ 根可用 bar。

当前状态：

- 已恢复：
  - `per_timeframe_bars_available = 150`
  - `browse_structure_bars = 80`
  - `close_read_bars = 20`
- `patrol_ab_context.py` 现已明确区分：
  - `browse 80` 用于整体方向/状态
  - `close read 20` 用于信号和执行端

评估：

- 状态：`通过`

风险：

- 仍需确认每个 fast lane / Phase B 分支都在使用同一组读盘窗口，而不是部分分支偷看近几根。

---

### 3. Step 0 / Step 1 / Step 2 / Step 3 / Step 4 / Step 5 主流程

原规则：

- Step 0 首轮初始化
- Step 0b 加载缓存
- Step 1 全局数据 + Daily 偏置
- Step 2 持仓管理优先
- Step 3 扫描新机会（Phase A / Scalp 快速通道 / Phase B）
- Step 4 输出 + 写缓存 + cycle
- Step 5 智能动态定时器

当前状态：

- Step 0/0b/1/3/4/5 都有对应实现。
- Step 2 代码已接入，但缺少真实新仓位的 live 验证。

评估：

- 状态：`部分通过`

高风险点：

- Step 2 持仓管理没有经过新架构下真实成交仓位验证。

---

### 4. Scalp 快速通道

原规则：

- `SKILL.md` 有独立 `Scalp 快速通道`
- `S6-common` 里明确：
  - `h2_l2_trigger` 只是触发
  - 不是自动入场
  - 进入 `Scalp 快速通道` 或 `Phase B`

当前状态：

- runtime 已有 `SCALP_FAST`
- 已能在 live cycle 里产出 `OPEN_ORDER` 候选
- 动作层已接受更接近 `S7` 的原生表达：
  - `ADD_ON`
  - `TP1_REDUCE / TP2_REDUCE`
  - `TRAIL_STOP`
  - `CANCEL_PENDING_ENTRY`

评估：

- 状态：`部分通过`

高风险点：

- 目前需要继续核：
  - fast lane 是否真的遵守原 3 项自检
  - 是否在位置不佳但信号触发时依然会被正确拦下

---

### 5. Phase B 深分析覆盖范围

原规则：

- `Phase B` 针对有事件的品种做深分析
- 不应只看一个最高分标的，漏掉第二、第三个真正临界机会

当前状态：

- 已从只看 top1 修正到允许多个事件品种进入分析

评估：

- 状态：`基本通过`

风险：

- 还要继续检查：
  - event_score 是否会误压低一些真实机会
  - full refresh 和 normal scan 的深分析覆盖是否一致

---

### 6. 策略路由（S4）

原规则：

- `S4-strategy-match.md` 定义 15 类 playbook
- 关键分流：
  - BO / TC / TR / reversal
  - Scalp vs Swing
  - Stop vs Limit

当前状态：

- 已接入：
  - `S6-common`
  - `S6-reversal`
  - 以及 BO / Channel / TR 路由基础
- 已改成单主 `S6` 路由，不再在一轮里加载多个互相冲突的 `S6-*`
- 当前最常触发的是：
  - `SCALP_FAST`
  - `PASS-WAIT`
  - `ENTRY_READY`

评估：

- 状态：`部分通过`

高风险点：

- 还没有证明所有 `S4` playbook 都已经被底层动作类型覆盖。
- 当前执行层核心动作只有：
  - `OPEN_ORDER`
  - `CLOSE_POSITION`
  - `MODIFY_STOP_LOSS`
  - `LOG_ONLY`

未完全确认的策略动作：

- 分批止盈：已支持 `PARTIAL_CLOSE`
- 加仓：已支持 `ADD_ON / SCALE_IN -> OPEN_ORDER`
- 撤挂单：已支持 `CANCEL_PENDING_ENTRY -> CANCEL_ALL_ORDERS`
- 限价单复杂管理：已有基础
- 移动 TP：仍缺独立底层接口

---

### 7. Trader's Equation / S5 评估

原规则：

- `S5-evaluation.md` 明确写的是：
  - `P × R > (1-P)`
- 不是统一 `1.2`。
- 课程大纲也强调：
  - 30A-30E：交易方程 / 概率 / 40-60 规则
  - 31B：波段交易意味着回报是风险的 2 倍
  - 剥头皮必须高概率，但不是统一一个魔法常数

当前状态：

- 发现当前 `patrol_trade.py` 曾经错误使用：
  - `P×R >= 1.2`
- 已修正为：
  - `P × R > (1-P)`
- 并兼容：
  - `P=56%`
  - `P=0.56`

验证：

- 对 BTC 候选单 dry-run 校验已从拒绝变成通过。

评估：

- 状态：`已修复`

风险：

- 这是当前已确认最直接导致“以前能开、现在不开”的主因之一。

---

### 8. 执行桥（patrol_trade -> execution-service -> Binance demo）

原规则：

- 满足策略条件后，应能真正下单到 Binance demo
- 订单创建、撤单、平仓必须闭环

当前状态：

- 已实际验证：
  - limit 下单成功
  - cancel 成功
  - market 成交成功
  - close 成功

评估：

- 状态：`通过`

风险：

- 自动单仍需继续验证“自然出现 -> 自动下单 -> 自动持仓管理”整条链

---

### 9. 持仓管理（S7）

原规则：

- 持仓管理优先级最高
- 要检查：
  - premise
  - strength
  - protection
  - move stop / partial / exit

当前状态：

- `S7-management.md` 已接入
- runtime 也有 `position_management`

评估：

- 状态：`未验证`

高风险点：

- 目前还没有在新架构下拿到一笔自然成交的新仓位
- 因此还没有真实证明：
  - `OPEN_ORDER -> 持仓产生 -> S7 接手 -> 管理动作执行`

---

### 10. 定时器 / 轮询逻辑（Step 5）

原规则：

- 原 skill 明确是智能动态间隔
- 有：
  - `2 / 4 / 8 / 12 分钟`
  - `pre_signal`
  - `TR edge`
  - `fresh BC/SC`
  - anti-stale
  - pre_signal 超时

当前状态：

- 当前已基本回到分钟级 bucket
- 不再是几十秒乱刷
- 当前常见是：
  - `120s`
  - `240s`
  - `480s`

评估：

- 状态：`部分通过`

高风险点：

- 还不是原 Step 5 的全量条件复刻
- 目前 bucket 收敛是合理的，但细分触发因子还需继续补齐

---

### 11. 预信号 / housekeeping / anti-stale

原规则：

- 新建 `pre_signal` 立即推送
- `pre_signal` 按周期过期
- 每 6 轮 housekeeping 汇报
- quiet loop / stale symbol 要触发刷新

当前状态：

- `pre_signal push` 已接回
- `housekeeping` 已接回
- `anti-stale` / `quiet loop threshold` 已接回

评估：

- 状态：`基本通过`

风险：

- 仍需继续检查：
  - `pre_signal` 的延长/失效时点是否和旧逻辑完全一致

---

### 12. 可观测性 / 复盘能力

原规则：

- 交易日志、cycle、图表、状态应能复盘
- 用户需要能看到为什么下单 / 为什么不下单

当前状态：

- 有：
  - cycle dump
  - execution log
  - TG 推送
  - Web 看板
  - Query Service

评估：

- 状态：`通过`

风险：

- TG 文案之前过于技术化，当前已开始改善，但还需继续面向交易员视图整理。

---

## 当前最关键的 5 个高风险漏洞

1. `S5` 交易方程曾被错误实现成固定 `1.2` 门槛
   影响：直接错杀本该允许的候选单
   状态：`已修`

2. `S7-management` 还没有在新架构下经过真实新仓位验证
   影响：开仓后可能接不上正确管理
   状态：`未完成`

3. `Step 5` 的动态扫描规则还不是完整复刻
   影响：扫描节奏可能偏快或偏保守
   状态：`未完成`

4. `S4` 的全部 playbook 还没有逐条验证到底层动作是否都支持
   影响：某些策略可能“能识别、不能执行”
   状态：`未完成`

5. 新架构下还没有拿到第一笔自然自动成交仓位
   影响：无法证明整条闭环已经恢复到原 Claude 水平
   状态：`未完成`

---

## 修复顺序（严格按优先级）

### P0

1. 继续盯第一笔自然 `OPEN_ORDER`
2. 一旦成交，立即验证：
   - 是否真正进 Binance demo
   - 是否生成持仓
   - `S7-management` 是否接手

### P1

3. 把 `Step 5` 动态扫描规则逐条对齐原 `SKILL.md`
4. 逐条核 `S4` playbook 和底层动作支持矩阵

### P2

5. 审 `pre_signal` 失效/续期是否与旧逻辑完全一致
6. 审 TG/Web 的交易员视图是否能直接支持复盘和调策略

---

## 当前结论

截至本审计：

- `知识源` 已回到原 skill/S 文件
- `执行桥` 已通
- `交易方程硬门槛错误` 已修
- 但离“与原 Claude 巡逻系统无限接近”还差最后两块：
  - `S7-management` 的真实成交验证
  - `Step 5 + S4` 的逐条 parity 补齐

因此当前状态可定义为：

- 架构：可用
- 逻辑：接近
- 闭环：未最终证明

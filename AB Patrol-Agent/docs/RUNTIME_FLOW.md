# AB Patrol-Agent 运行流程

## 1. 一轮巡逻如何开始

1. `ab-patrol-loop` 读取 `runtime_state.json`
2. 拉取执行侧快照：
   - 余额
   - 持仓
   - 挂单
   - `can_trade`
   - bot summary
3. 读取 `market_state_l1.json`
4. 判断这轮属于哪种 phase：
   - `BOOTSTRAP`
   - `SCAN`
   - `PRE_SIGNAL`
   - `ENTRY_READY`
   - `MANAGE`
   - 其他状态

## 2. 这轮会读取哪些知识

运行时不会“固定只读摘要”，而是按当前状态路由：

- 有持仓：优先带 `S7-management.md`
- 有 `pre_signal / entry_ready`：优先带 `S4 / S5 / S6-*`
- 全刷新：会带 `S0 / S1 / S2 / S3 / S3b`
- 不同市场状态会路由到不同 `S6-*`

读取优先级：

1. 优先读取完整 `SKILL.md`
2. 优先读取所选 S 文件完整原文
3. 不使用 `runtime-brief` 或摘要版知识文件

`SKILL.md` 现在也不是整份全文硬塞，而是按章节原文路由：

- 全刷新：`Step 0 / 0b / 1`
- 无持仓扫描：`Step 3 / 4 / 5`
- 有持仓：`Step 2 / 4 / 5`
- 临近入场：`Phase B / 3d / 3e / 3f`

## 3. 一轮决策的数据输入

模型决策前会拿到：

- `150` 根可用 K 线
- 浏览结构 `80` 根
- 精读最近 `20` 根
- `patrol_ab_context.py` 产出的结构化 Al Brooks 事件
- `chart_gen.py + ab_ema / ab_sr / ab_mm / ab_patterns`
- 当前缓存中的 `structure_summary / market_state / pre_signal / key_levels`

## 4. 一轮决策的输出

模型必须返回 JSON：

- `phase`
- `market_summary`
- `focus_symbols`
- `symbol_updates`
- `actions`
- `position_management`
- `next_scan_seconds`
- `next_scan_reason`
- `state_patch`
- `explanation`

## 5. 执行阶段

1. `actions` 和 `position_management` 会进入执行层
2. 执行层仍经过 `patrol_trade.py / execution-service`
3. 所有执行结果写入：
   - `cycles/`
   - `journal/decision_log.jsonl`
   - `journal/execution_log.jsonl`

## 6. 推送阶段

当前推送节奏：

- `pre_signal`：即时推送
- `entry_ready / 持仓管理 / 有执行动作`：即时推送
- 普通观察轮：默认不再每轮都推完整卡片
- `每 6 轮`：推送一次定期汇报

## 7. 扫描间隔

- 正常由模型给出 `next_scan_seconds`
- 运行时会把扫描间隔归一到分钟级桶位：
  - `120 / 180 / 240 / 300 / 480 / 720`
- 模型超时时：
  - 无持仓：`480 秒`
  - 有持仓或有预信号：`240 秒`

## 8. 看哪里能知道这轮到底读了什么

- 最新 prompt：
  - `AB Patrol-Agent/data/pa_trader/logs/decision/last_request.md`
- 最新响应：
  - `AB Patrol-Agent/data/pa_trader/logs/decision/last_response.json`
- 最新决策：
  - `AB Patrol-Agent/data/pa_trader/logs/decision/last_decision.json`

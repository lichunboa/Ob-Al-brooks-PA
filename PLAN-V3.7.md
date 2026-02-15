# V3.7 系统优化方案 — 信号治理 + SKILL 重设计 + OpenClaw 适配

## 背景

V3.6 运行后暴露 5 个系统级问题：
1. **信号洪水**：PG 引擎每 60s 产生 4-8 个信号 → 每个信号唤醒 agent → 3-6 轮 Gemini 调用 → 每分钟 24-48 次 API 请求 → 反代账号 403 封禁
2. **垃圾笔记**：被风控拒绝的信号仍创建完整 28 字段笔记，昨天 365 篇中 >340 篇无分析价值
3. **Agent 无分析能力**：威科夫 100% 输出 "Phase D + 吸筹区"，PA 核心字段全空，agent 机械执行 SKILL 而非真正分析
4. **盈亏比绕过**：实际执行的交易盈亏比 1.35:1 < min_risk_reward=2.0，agent 绕过风控参数
5. **source 字段丢失**：signals.jsonl 中 source=?，路由器无法区分信号来源

## 当前系统状态

- OpenClaw 版本：**2026.2.9**（已安装），配置文件 lastTouched=2026.2.2-3
- 三个交易 agent 均使用 `gemini-proxy/gemini-3-flash` 作为主模型
- signal-router.js 已有 V3.7 标记（DEDUP=15min, REJECTION_COOLDOWN=30min, 暴露预检）
- config.py 已有 V3.7 标记（CHECK_INTERVAL=300s, COOLDOWN=300s）
- 但 `__main__.py` 启动脚本仍用 `--interval 60`，覆盖了 config.py 的 300s

---

## 阶段 1: P0 — 信号频率治理（止血）

### 1.1 启动脚本修复

**文件**: `AB Console-Backend/start-all-core.sh`

问题：第 94 行 `--interval 60` 硬编码覆盖了 config.py 的 `DEFAULT_CHECK_INTERVAL=300`。

修复：删除 `--interval 60`，让 PG 引擎使用 config.py 的 300 秒默认值。

```diff
- python3 -m src --pg --interval 60 &
+ python3 -m src --pg &
```

### 1.2 PG 引擎批量聚合

**文件**: `AB Console-Backend/services/signal-service/src/engines/pg_engine.py`

当前：每个规则命中独立发布一个 SignalEvent → 4 品种 x 11 规则 = 最多 44 个信号/轮。

优化：每轮检查结束后，按 `{symbol}_{direction}` 聚合，只发布每个品种每个方向的最强信号。

```python
# check_signals() 末尾，发布前聚合
aggregated = {}
for sig in raw_signals:
    key = f"{sig.symbol}_{sig.direction}"
    if key not in aggregated or sig.strength > aggregated[key].strength:
        aggregated[key] = sig
# 只发布聚合后的信号
for sig in aggregated.values():
    self.publisher.publish(sig)
```

预期效果：每轮从 4-8 个信号降到 **最多 8 个**（4 品种 x 2 方向），实际通常 2-4 个。

### 1.3 signal-service webhook 层限流

**文件**: `AB Console-Backend/services/signal-service/src/__main__.py`

在 `write_openclaw_webhook` 回调中增加品种级限流：同一品种 5 分钟内最多发 1 次 webhook。

```python
_webhook_last_sent = {}  # {symbol: timestamp}
WEBHOOK_MIN_INTERVAL = 300  # 5 分钟

def write_openclaw_webhook(ev):
    now = time.time()
    last = _webhook_last_sent.get(ev.symbol, 0)
    if now - last < WEBHOOK_MIN_INTERVAL:
        logger.debug(f"[Webhook] {ev.symbol} 限流中，跳过")
        return
    _webhook_last_sent[ev.symbol] = now
    # ... 原有 webhook 逻辑
```

### 1.4 source 字段传递

**文件**: `AB Console-Backend/services/signal-service/src/__main__.py`

在 webhook payload 中补充 `source` 字段：

```python
signal_data = {
    ...
    "source": ev.source or "pg",  # pg / pa / sqlite
}
```

### 预期效果

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 信号/分钟 | 4-8 | 0-2 |
| Gemini 调用/分钟 | 24-48 | 0-6 |
| Gemini 调用/小时 | ~2000 | ~72 |

---

## 阶段 2: P1 — 拒绝信号不创建笔记

### 2.1 signal-router.js 拒绝标记

**文件**: `~/.clawdbot/transforms/signal-router.js`

当前：router 的暴露预检（1019-1053 行）直接 `return null` 跳过信号，但 agent 内部的风控拒绝仍会创建笔记。

优化：在 routeToAlBrooks/routeToWyckoff/routeToTrader 的消息中，明确告知 agent：

```
⚠️ 评分 < 70 或风控拒绝时，**禁止创建笔记文件**，仅在 Discord 发送一行摘要。
```

### 2.2 SKILL.md 笔记创建门禁

**文件**: 三个 SKILL.md

在"推送规则"部分强化：

```markdown
### 推送规则（严格执行）
- **>= 80**: Discord + 创建笔记 + 执行交易
- **70-79**: 仅 Discord 一行摘要（≤50字），**禁止创建 .md 文件**
- **< 70**: 不推送，不创建文件
- **风控拒绝**（can_trade=false / 冷却中 / 暴露过高）: Discord 一行说明，**禁止创建 .md 文件**
```

### 2.3 盈亏比门禁

**文件**: `AB Console-Backend/services/execution-service/src/__main__.py`

在 `/order` 端点增加盈亏比检查：

```python
# 计算盈亏比
if stop_loss and take_profit and entry_price:
    risk = abs(entry_price - stop_loss)
    reward = abs(take_profit - entry_price)
    if risk > 0:
        rr = reward / risk
        min_rr = bot_config.get('min_risk_reward', 2.0)
        if rr < min_rr:
            return {"error": f"盈亏比 {rr:.1f}:1 < 最低要求 {min_rr}:1", "code": "RR_TOO_LOW"}
```

---

## 阶段 3: P2 — SKILL 重设计（参考 Claude knowledge-work-plugins 架构）

### 3.1 knowledge-work-plugins 架构分析

Anthropic 的 knowledge-work-plugins 采用以下模式：

```
plugin/
├── .claude-plugin/plugin.json    ← 插件元数据
├── .mcp.json                     ← MCP 服务器连接（数据源）
├── CONNECTORS.md                 ← 数据源说明
├── commands/                     ← 用户可调用的命令（workflow）
│   └── triage.md                 ← 完整工作流程定义
└── skills/                       ← 领域知识（reference）
    └── ticket-triage/SKILL.md    ← 深度领域知识 + 评估框架
```

核心设计理念：
1. **Commands = 工作流**：定义"做什么"和"怎么做"的步骤
2. **Skills = 领域知识**：提供"为什么"和"判断标准"
3. **CONNECTORS = 数据源**：声明可用的外部数据
4. **分离关注点**：workflow 和 knowledge 分开，agent 先理解再执行

### 3.2 当前 SKILL.md 的问题

我们的 SKILL.md 把所有东西混在一起：身份、路径、预检查、分析方法、执行流程、笔记创建、数据更新。
Agent 收到信号后直接跳到"执行流程"，跳过了"分析方法论"部分。

根本原因：
- SKILL.md 太长（200+ 行），agent 倾向于跳到可执行的部分
- 分析方法论是"知识"而非"指令"，agent 不知道如何应用
- 没有强制的"分析检查点"，agent 可以直接跳到下单

### 3.3 新 SKILL 架构

```
~/.clawdbot/skills/
├── al-brooks-simtrade/
│   ├── SKILL.md              ← 精简：身份 + 路径 + 执行流程（<100行）
│   └── references/
│       ├── pa-analysis.md    ← Al Brooks 分析框架（深度知识）
│       └── scoring-rubric.md ← 评分标准 + 示例
├── quant-analysis/
│   ├── SKILL.md
│   └── references/
│       ├── multi-tf-analysis.md
│       └── scoring-rubric.md
└── wyckoff-analysis/
    ├── SKILL.md
    └── references/
        ├── wyckoff-phases.md
        └── scoring-rubric.md
```

### 3.4 新 SKILL.md 结构（以 al-brooks 为例）

```markdown
# PA交易 Al Brooks 模拟交易系统 V3.7

## 身份
bot_id = `al-brooks`，价格行为交易员。

## 路径常量
（保持不变）

## 工作流程（必须按顺序执行，不可跳步）

### Step 1: 状态检查
读取 `📊 你的状态` 块。如果 can_trade=false → Discord 一行说明 → 结束。

### Step 2: 分析（必须输出分析结论才能进入 Step 3）
参考 `references/pa-analysis.md` 进行分析。
**必须回答以下问题**（缺一不可）：
1. 当前 Always In 方向是什么？依据？
2. 信号K线质量如何？（大实体/小实体/十字星）
3. 当前处于趋势还是交易区间？
4. 最近的支撑/阻力在哪里？
5. 盈亏比是多少？（必须 >= 2:1）

### Step 3: 评分
参考 `references/scoring-rubric.md` 打分。
**必须逐项打分**，不可直接给总分。

### Step 4: 决策
- >= 80: 执行交易 + 创建笔记
- 70-79: Discord 一行摘要，不创建文件
- < 70: 不推送

### Step 5: 执行（仅 >= 80）
（下单流程，保持不变）

### Step 6: 笔记（仅 >= 80）
（笔记创建，保持不变，但 frontmatter 必须填充 Step 2 的分析结论）
```

### 3.5 references/pa-analysis.md 示例

```markdown
# Al Brooks 价格行为分析框架

## Always In 判断
- 看最近 20 根K线的整体方向
- 如果价格持续在 20EMA 上方 → Always In Long
- 如果价格持续在 20EMA 下方 → Always In Short
- 如果频繁穿越 20EMA → 交易区间

## 信号K线质量评估
- 大实体（> 平均K线的 1.5 倍）= 强信号
- 小实体 + 长影线 = 弱信号
- 十字星 = 犹豫，需要确认

## Day Type 判断
- 趋势日：开盘后单方向运行，回调小
- 交易区间日：上下震荡，假突破多
- 趋势反转日：先趋势后反转

## 11 策略匹配
（从现有 SKILL.md 的策略速查移过来，但增加"何时使用"和"何时避免"）
```

### 3.6 references/scoring-rubric.md 示例

```markdown
# 评分标准（逐项打分）

## 趋势强度 (0-20)
| 分数 | 条件 |
|------|------|
| 18-20 | Always In 明确 + 价格远离 20EMA + 回调浅 |
| 12-17 | Always In 方向清晰但有回调 |
| 6-11 | 方向不明确，可能是区间 |
| 0-5 | 明显的交易区间 |

## 信号质量 (0-20)
| 分数 | 条件 |
|------|------|
| 18-20 | 大实体信号K + 位置在支撑/阻力 + 顺势 |
| 12-17 | 信号K尚可 + 位置合理 |
| 6-11 | 信号K弱或位置不佳 |
| 0-5 | 十字星/小实体 + 位置差 |

（其他维度类似...）

## 评分示例
### 示例 1: 高分交易 (85分)
- 趋势强度: 18 — BTC 1h Always In Long，价格在 20EMA 上方 2%
- 信号质量: 17 — 大阳线突破前高，回踩 20EMA 后反弹
- 策略匹配: 22 — 20均线缺口策略，完美匹配
- 盈亏比: 18 — 3.2:1
- 风险因素: 10 — 接近日线阻力，扣 5 分

### 示例 2: 低分交易 (55分)
- 趋势强度: 8 — 方向不明，频繁穿越 20EMA
- 信号质量: 10 — 小实体K线，长上影线
- 策略匹配: 15 — 勉强匹配双重底，但结构不清晰
- 盈亏比: 12 — 1.8:1，低于 2:1 最低要求
- 风险因素: 10 — 即将公布 CPI 数据
```

---

## 阶段 4: P3 — OpenClaw 适配

### 4.1 当前版本差距

| 项目 | 当前 | 最新 | 差距 |
|------|------|------|------|
| 安装版本 | 2026.2.9 | 2026.2.9 | ✅ 已是最新 |
| 配置版本 | 2026.2.2-3 | 2026.2.9 | ⚠️ 配置未更新 |

### 4.2 未使用的 OpenClaw 功能

**1. session_config 优化**

当前 signal-router.js 返回的 session_config：
```json
{ "type": "ephemeral", "max_turns": 6, "ttl_minutes": 8, "no_memory": true }
```

优化建议：
- al-brooks: `max_turns: 4`（分析+下单足够）
- wyckoff/trader: `max_turns: 3`（已在用，保持）
- 所有 bot: `ttl_minutes: 5`（从 8 分钟缩短，减少资源占用）

**2. tools.deny 限制 agent 工具**

当前 `tools.exec.ask: "off"` 允许 agent 无限制执行命令。

建议为交易 agent 添加工具限制：
```json
{
  "agents": {
    "list": [
      {
        "id": "al-brooks",
        "tools": {
          "deny": ["web_search", "web_fetch", "browser", "canvas"],
          "exec": { "security": "allowlist" }
        }
      }
    ]
  }
}
```

**3. retry 配置**

为 gemini-proxy 添加 retry 配置，避免 403 时无限重试：
```json
{
  "models": {
    "providers": {
      "gemini-proxy": {
        "retry": {
          "attempts": 2,
          "minDelayMs": 5000,
          "maxDelayMs": 30000
        }
      }
    }
  }
}
```

**4. maxConcurrent 限制**

当前 `maxConcurrent: 4`，`subagents.maxConcurrent: 8`。
建议降低到 `maxConcurrent: 2`，避免多个 agent 同时调用 Gemini。

**5. session.reset 配置**

添加自动重置，避免 agent 会话累积：
```json
{
  "session": {
    "reset": {
      "mode": "daily",
      "atHour": 4,
      "idleMinutes": 30
    }
  }
}
```

### 4.3 安全修复

OpenClaw 2026.2.6 引入了 Safety Scanner。当前配置中 `tools.exec.ask: "off"` 存在风险。

建议：
- 保持 `ask: "off"`（交易 agent 需要执行 curl）
- 但添加 `exec.security: "allowlist"` 限制可执行命令

---

## 实施顺序

| 阶段 | 优先级 | 预计改动 | 文件数 |
|------|--------|---------|--------|
| 阶段 1 | P0 止血 | 启动脚本 + PG 聚合 + webhook 限流 + source | 4 |
| 阶段 2 | P1 降噪 | signal-router 拒绝标记 + SKILL 笔记门禁 + 盈亏比 | 5 |
| 阶段 3 | P2 重设计 | 3 个 SKILL.md 重写 + 6 个 references 文件 | 9 |
| 阶段 4 | P3 适配 | openclaw.json 配置更新 | 1 |

**总计**: ~19 个文件改动

---

## 风险评估

1. **阶段 1 风险低**：纯配置调整，不影响交易逻辑
2. **阶段 2 风险低**：增加门禁，最坏情况是合法交易被拒（可通过日志发现）
3. **阶段 3 风险中**：SKILL 重写可能导致 agent 行为变化，需要观察 1-2 天
4. **阶段 4 风险低**：OpenClaw 配置变更，可随时回滚
<!-- PLAN_END -->

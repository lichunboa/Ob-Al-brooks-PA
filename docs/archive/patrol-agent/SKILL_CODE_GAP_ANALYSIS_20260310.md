# 代码实现与 SKILL.md 差异报告

生成时间：2026-03-10

## 执行摘要

经过详细分析，发现 AB Patrol-Agent 的实现与 SKILL.md 要求存在以下关键差异：

---

## 1. Step 2 持仓管理差异

### 1.1 Premise Check 实现不完整

**SKILL.md 要求：**
- 6 项检查（30 秒内完成）
- 使用 ab_* 模块数据进行检查
- 任一失效 → 立即执行对应操作

**当前实现（position_manager.py）：**
```python
def premise_check(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    # 实现了 6 项检查框架
    # ✅ AI 方向检查
    # ✅ 市场状态检查
    # ✅ 信号 K 线检查
    # ✅ Follow-Through 检查
    # ✅ 目标路径检查
    # ✅ 风险指标检查
```

**问题：**
1. ✅ 框架完整，但数据来源依赖 `market_data` 字典传入
2. ⚠️ **未在 pa_runtime.py 中实际调用** — 所有持仓管理逻辑都已实现，但未集成到主循环
3. ⚠️ ab_* 数据通过 `patrol_ab_context.py` 工具获取，但未直接传递给 `premise_check`

**建议修复：**
```python
# 在 pa_runtime.py 的持仓管理流程中添加：
if positions:
    for position in positions:
        symbol = position.get("symbol")
        ab_context = self.build_ab_context(symbol)

        # 构建 market_data
        market_data = {
            "ab_state": ab_context.get("timeframes", {}).get("5m", {}).get("state"),
            "ab_sr": ab_context.get("timeframes", {}).get("5m", {}).get("ab_sr", {}),
            "ab_ema": ab_context.get("timeframes", {}).get("5m", {}).get("ab_ema", {}),
            "ab_patterns": ab_context.get("timeframes", {}).get("5m", {}).get("ab_patterns", {}),
            "recent_bars": live.get("5m", {}).get("bars", [])[-20:],
            "current_price": live.get("5m", {}).get("bars", [])[-1].get("C"),
            "account_info": execution.get("balance", {}),
            "ai_direction": cached.get("ai_direction"),
            "timeframes": ab_context.get("timeframes", {}),
        }

        # 执行 Premise Check
        premise_result = premise_check(position, market_data)

        if premise_result["action"] == "CLOSE":
            # 立即平仓
            pass
        elif premise_result["action"] == "REDUCE":
            # 减仓 50%
            pass
```

---

### 1.2 Strength Check 实现完整但未调用

**SKILL.md 要求：**
- Premise 全过后执行
- 7 项增强信号评估
- 输出信心等级（高/中/低）

**当前实现：**
```python
def strength_check(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    # ✅ 实现了 7 项检查
    # ✅ 返回 strength_score (0-7)
    # ✅ 返回 confidence (高/中/低)
    # ✅ 返回 recommendation
```

**问题：**
- ⚠️ **未在 pa_runtime.py 中调用** — 与 Premise Check 同样的问题

---

### 1.3 Trailing SL 实现完整但未调用

**SKILL.md 要求：**
- 浮盈 >= 1.5R 时移到保本
- 有新的 Major HL/LH 时移到该点
- Scalp 风格更激进

**当前实现：**
```python
def calculate_trailing_sl(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    # ✅ 实现了 3 条规则
    # ✅ 区分 Scalp/Swing 风格
    # ✅ 使用 ab_sr 的 major_hl/major_lh
```

**问题：**
- ⚠️ **未在 pa_runtime.py 中调用**

---

### 1.4 分批止盈实现完整但未调用

**SKILL.md 要求：**
- Scalp: 1.5R 全平
- Swing: 2R 减仓 50%，3R 再减 25%
- 反转试探: 1R 全平

**当前实现：**
```python
def calculate_partial_close(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    # ✅ 实现了所有规则
    # ✅ 返回 close_ratio
```

**问题：**
- ⚠️ **未在 pa_runtime.py 中调用**

---

### 1.5 完整持仓管理流程存在但未集成

**当前实现：**
```python
def manage_position(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    # ✅ 完整流程：Premise Check → Strength Check → 分批止盈 → Trailing SL
    # ✅ 返回统一的 action 结构
```

**问题：**
- ⚠️ **pa_runtime.py 可能使用了规则引擎的持仓管理，而不是 position_manager.py 的 Al Brooks 框架**

---

## 2. Step 3 扫描差异

### 2.1 Quick Scan 事件检测

**SKILL.md 要求：**
- 必须同时扫描 5m + 15m + 1h 三个周期
- 每个周期独立检测 9 类事件
- H2/L2 触发 ≠ 自动入场

**当前实现：**
- ✅ `patrol_ab_context.py` 为每个周期生成 `events` 列表
- ✅ 事件类型包括：signal_trigger, state, ema_touch, first_pb, tr_edge, pb_depth, hl_signal, wedge_or_mtr, momentum_fading, anomaly
- ✅ 通过 `quick_scan` 字典返回每个周期的事件

**问题：**
- ⚠️ **pa_runtime.py 中未明确展示"必须同时扫描 3 个周期"的逻辑** — 虽然 `patrol_ab_context.py` 处理了所有周期，但主循环中的处理逻辑不清晰

---

### 2.2 Phase B 深分析的 ab_* 模块按需调用

**SKILL.md 要求（Phase B-0）：**
```python
# 根据事件类型决定调用哪些模块
modules_needed = []
if event_type in ['ema_touch', 'pb_complete']:
    modules_needed.append('ab_ema')
if event_type in ['level_break', 'tr_edge', 'signal(TR)']:
    modules_needed.append('ab_sr')
# ... 按需调用
```

**当前实现：**
- ❌ **不是按需调用，而是全量调用** — `patrol_ab_context.py` 对每个周期都调用所有 4 个 ab_* 模块

**影响：**
- 性能：每次扫描都计算所有指标，即使不需要
- 不符合 SKILL.md 的"按需加载"原则

**建议修复：**
在 `patrol_ab_context.py` 中添加 `modules` 参数：
```python
def build_symbol_context(symbol: str, base_url: str, modules: list[str] = None) -> dict[str, Any]:
    if modules is None:
        modules = ["ab_ema", "ab_sr", "ab_mm", "ab_patterns"]  # 默认全量

    # 只调用需要的模块
    if "ab_ema" in modules:
        ema_info = AB_EMA.analyze_ab_ema(...)
    # ...
```

---

## 3. Step 5 动态间隔差异

**SKILL.md 要求：**
- 5 个优先级（P0-P5）
- P0: pre_signal 触发接近 → 2 分钟
- P0: 有持仓 + 波动大 → 2 分钟
- P1: BC/SC 刚发生 → 2 分钟
- ...

**当前实现：**
- ✅ pa_runtime.py 中有 `plan_next_scan` 函数实现动态间隔
- ✅ 包含多种条件判断

**问题：**
- ⚠️ **逻辑分散在多个函数中，不如 SKILL.md 的表格清晰**
- ⚠️ **未明确标注 P0-P5 优先级**

---

## 4. 防懒惰机制差异

### 4.1 看门狗计数器

**SKILL.md 要求：**
```python
consecutive_watching >= 6 → 强制进入 Phase B 做 stale 刷新
```

**当前实现：**
- ✅ `market_scanner.py` 有 `increment_consecutive_watching` 函数
- ✅ `consecutive_watching` 字段存在

**问题：**
- ⚠️ **未找到">= 6 时强制刷新"的逻辑**

---

### 4.2 pre_signal 超时

**SKILL.md 要求：**
- 5m: 25 分钟（5 根 bar）
- 15m: 45 分钟（3 根 bar）
- 1h: 180 分钟（3 根 bar）

**当前实现：**
```python
PRE_SIGNAL_DEFAULT_TTL_SECONDS = {
    "5m": 25 * 60,
    "15m": 45 * 60,
    "30m": 90 * 60,
    "1h": 180 * 60,
}
```

**状态：** ✅ 完全一致

---

## 5. ab_* 模块使用差异

### 5.1 数据流

**SKILL.md 期望：**
```
持仓管理 → 调用 ab_* → 传给 premise_check/strength_check
```

**当前实现：**
```
pa_runtime.py → patrol_ab_context.py (subprocess) → 返回 JSON → 传给 LLM prompt
                                                    ↓
                                            未传给 position_manager.py
```

**问题：**
- ❌ **ab_* 数据未直接传递给持仓管理函数**
- ❌ **position_manager.py 的函数期望 `market_data` 字典包含 ab_* 数据，但调用方未提供**

---

## 总结：关键问题

### 🔴 严重问题（阻塞功能）

1. **position_manager.py 的函数未被调用** — 所有持仓管理逻辑（Premise Check、Strength Check、Trailing SL、分批止盈）都已实现，但未集成到主循环
2. **ab_* 数据未传递给持仓管理** — 数据流断裂

### 🟡 中等问题（影响性能/准确性）

3. **ab_* 模块全量调用而非按需** — 每次扫描都计算所有指标
4. **看门狗计数器未触发强制刷新** — `consecutive_watching >= 6` 的逻辑缺失

### 🟢 轻微问题（可优化）

5. **动态间隔逻辑不够清晰** — 未明确标注 P0-P5 优先级
6. **Quick Scan 多周期处理不够明确** — 虽然实现了，但代码结构不清晰

---

## 修复优先级

### 第一优先级（立即修复）
1. 在 pa_runtime.py 的持仓管理流程中调用 `position_manager.manage_position`
2. 构建正确的 `market_data` 字典传递给持仓管理函数

### 第二优先级（本周修复）
3. 实现 ab_* 模块按需调用
4. 实现看门狗计数器的强制刷新逻辑

### 第三优先级（优化）
5. 重构动态间隔逻辑，明确标注优先级
6. 优化 Quick Scan 多周期处理的代码结构

---

## 建议的修复方案示例

```python
# 在 pa_runtime.py 的持仓管理部分添加：

def _manage_positions_with_ab_context(self, positions, execution, market_cache):
    """使用 position_manager.py 的完整持仓管理流程"""
    from runtime.position_manager import manage_position

    management_actions = []

    for position in positions:
        symbol = position.get("symbol")

        # 1. 获取 ab_* 数据
        ab_context = self.build_ab_context(symbol)
        live = self.fetch_symbol_market(symbol)
        cached = market_cache.get("symbols", {}).get(symbol, {})

        # 2. 构建 market_data
        tf_5m = ab_context.get("timeframes", {}).get("5m", {})
        market_data = {
            "ab_state": tf_5m.get("state"),
            "ab_sr": tf_5m.get("ab_sr", {}),
            "ab_ema": tf_5m.get("ab_ema", {}),
            "ab_patterns": tf_5m.get("ab_patterns", {}),
            "recent_bars": live.get("5m", {}).get("bars", [])[-20:],
            "current_price": live.get("5m", {}).get("bars", [])[-1].get("C") if live.get("5m", {}).get("bars") else 0,
            "account_info": execution.get("balance", {}),
            "ai_direction": cached.get("ai_direction"),
            "timeframes": ab_context.get("timeframes", {}),
        }

        # 3. 执行完整持仓管理
        result = manage_position(position, market_data)

        # 4. 转换为 action
        if result["action"] != "HOLD":
            management_actions.append({
                "type": result["action"],
                "symbol": symbol,
                "params": result["params"],
                "reason": result["reason"],
                "premise_check": result["premise_check"],
                "strength_check": result["strength_check"],
            })

    return management_actions
```

---

## 结论

代码实现了 SKILL.md 要求的大部分功能，但存在**集成问题**：

- ✅ **功能已实现**：position_manager.py 完整实现了 Al Brooks 持仓管理框架
- ❌ **未集成到主循环**：pa_runtime.py 未调用这些函数
- ❌ **数据流断裂**：ab_* 数据未传递给持仓管理函数

**下一步行动：**
1. 修复集成问题（第一优先级）
2. 测试完整流程
3. 优化性能（第二、三优先级）

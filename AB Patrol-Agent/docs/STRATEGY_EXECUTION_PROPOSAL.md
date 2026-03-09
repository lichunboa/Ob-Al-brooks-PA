# 策略执行改造方案

## 问题

当前系统要求"完美匹配所有条件"才下单，导致：
- BTCUSDT 状态 = executable，但因为 model_timeout 不下单
- 几天一单都没有
- 78KB 知识文件，但执行太保守

## 根本矛盾

- **有 10+ 种策略**（H1/H2/L1/L2/BO/Channel/TR/Reversal）
- **但要求完美匹配** → 永远不满足
- **Al Brooks 说**："Setups look good enough to experts. Experts buy for any reason."

## 新方案：策略路由 + 合理性检查

### 1. 策略识别（不需要 LLM）

```python
def identify_strategy(symbol_data):
    """根据市场状态识别策略类型"""
    state = symbol_data["market_state"]

    # BO 策略
    if "BO" in state and "突破" in symbol_data["thesis"]:
        return "BO_CONTINUATION"

    # Channel 策略
    if "TC" in state or "宽幅区间" in state:
        return "CHANNEL_TRADE"

    # TR 策略
    if "TR" in state and "edge" in symbol_data["stage"]:
        return "TR_EDGE"

    # H1/H2 策略
    if "H1" in symbol_data["stage"] or "H2" in symbol_data["stage"]:
        return "HIGH_ENTRY"

    # L1/L2 策略
    if "L1" in symbol_data["stage"] or "L2" in symbol_data["stage"]:
        return "LOW_ENTRY"

    return "UNKNOWN"
```

### 2. 策略核心条件（简化）

```python
STRATEGY_RULES = {
    "BO_CONTINUATION": {
        "required": ["has_breakout", "has_direction"],
        "optional": ["has_second_signal"],
        "min_probability": 0.45,
    },
    "CHANNEL_TRADE": {
        "required": ["has_swing_high_low", "has_direction"],
        "optional": ["has_tr_edge"],
        "min_probability": 0.50,
    },
    "TR_EDGE": {
        "required": ["has_tr_edge", "has_signal_bar"],
        "optional": ["has_second_signal"],
        "min_probability": 0.50,
    },
    "HIGH_ENTRY": {
        "required": ["has_signal_bar", "has_direction"],
        "optional": ["has_pullback"],
        "min_probability": 0.45,
    },
    "LOW_ENTRY": {
        "required": ["has_signal_bar", "has_direction"],
        "optional": ["has_pullback"],
        "min_probability": 0.45,
    },
}
```

### 3. 合理性检查（快速）

```python
def check_trade_validity(symbol_data, strategy):
    """快速合理性检查"""
    checks = {
        "has_entry_price": symbol_data["planned_trade"].get("entry_price") is not None,
        "has_stop_loss": symbol_data["planned_trade"].get("stop_loss") is not None,
        "risk_reward_ok": calculate_risk_reward(symbol_data) >= 1.0,
        "not_too_close": not_near_magnet(symbol_data),
        "direction_clear": symbol_data["pre_signal"]["side"] in ["LONG", "SHORT"],
    }

    # 5 个检查，至少 4 个通过
    passed = sum(checks.values())
    return passed >= 4, checks
```

### 4. 执行决策（简单）

```python
def should_execute(symbol_data):
    """判断是否执行"""
    # 1. 识别策略
    strategy = identify_strategy(symbol_data)
    if strategy == "UNKNOWN":
        return False, "无法识别策略"

    # 2. 检查核心条件
    rules = STRATEGY_RULES[strategy]
    required_ok = all(check_condition(c, symbol_data) for c in rules["required"])
    if not required_ok:
        return False, f"{strategy} 核心条件不满足"

    # 3. 合理性检查
    valid, checks = check_trade_validity(symbol_data, strategy)
    if not valid:
        return False, f"合理性检查失败: {checks}"

    # 4. 执行
    return True, f"{strategy} 策略匹配，执行"
```

## 优势

1. **不依赖 LLM** — 策略识别和检查都是规则
2. **快速** — 不需要 78KB 上下文
3. **可控** — 每个策略的条件清晰
4. **灵活** — 可以调整每个策略的阈值
5. **符合 Al Brooks** — "Good enough to experts"

## 实施步骤

1. **Phase 1**：添加策略识别函数（不改现有逻辑）
2. **Phase 2**：添加快速检查模式（与现有并行）
3. **Phase 3**：对比两种模式的结果（观察 1-2 天）
4. **Phase 4**：切换到新模式

## 回退方案

如果新模式下单太多：
- 提高 `min_probability` 阈值
- 增加必需条件
- 添加冷却时间

## 预期效果

- **当前**：几天 0 单
- **新模式**：每天 2-5 单（根据市场）
- **质量**：保持 45%+ 胜率（通过合理性检查）

## 下一步

你想：
1. 先实施 Phase 1（添加策略识别）
2. 直接切换到新模式
3. 先观察当前系统再决定

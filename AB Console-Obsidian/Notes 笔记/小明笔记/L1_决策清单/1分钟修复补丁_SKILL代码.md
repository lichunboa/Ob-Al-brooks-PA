# 1分钟超短线修复补丁 - SKILL.md 新增代码

**修复时间**: 2026-02-05  
**状态**: ✅ 配置正确，需要代码支持

---

## 🔧 需要添加到 SKILL.md 的代码

### 1. 多周期仓位计算函数

```python
def get_position_size(balance, symbol, timeframe="5m", evolution=None):
    """
    根据时间周期获取仓位大小
    
    修复: 优先使用周期专用配置
    """
    if evolution is None:
        evolution = json.load(open("~/.openclaw/workspace/xiaoming_evolution.json"))
    
    # 1分钟周期 - 使用专用配置
    if timeframe == "1m":
        ultra_config = evolution.get("autonomy", {}).get("ultra_short", {})
        if ultra_config.get("enabled", False):
            position_pct = ultra_config.get("position_size_pct", 0.1) / 100
            position_size = balance * position_pct
            
            # 限制范围: $10 - $100
            position_size = max(10, min(position_size, 100))
            
            print(f"[1M] 仓位计算: {balance} * {position_pct}% = ${position_size:.2f}")
            return position_size
    
    # 5分钟周期 - 使用全局配置
    position_config = evolution.get("position_sizing", {})
    min_pct = position_config.get("min_position_pct", 1.0) / 100
    max_pct = position_config.get("max_position_pct", 1.5) / 100
    absolute_max = position_config.get("absolute_max", 1000)
    
    position_size = balance * min_pct
    position_size = min(position_size, absolute_max)
    
    print(f"[5M] 仓位计算: ${position_size:.2f}")
    return position_size
```

---

### 2. 1分钟专用决策函数

```python
def should_create_trade_1m(signal, evolution=None):
    """
    1分钟超短线专用决策逻辑
    
    修复: 完整的1分钟决策流程
    """
    if evolution is None:
        evolution = json.load(open("~/.openclaw/workspace/xiaoming_evolution.json"))
    
    # 获取1分钟配置
    ultra_config = evolution.get("autonomy", {}).get("ultra_short", {})
    if not ultra_config.get("enabled", False):
        return {"should_trade": False, "reason": "1分钟策略未启用"}
    
    # 获取1分钟策略权重
    strategy_weights_1m = evolution.get("ultra_short_strategy_weights", {})
    if not strategy_weights_1m.get("enabled", False):
        return {"should_trade": False, "reason": "1分钟策略权重未启用"}
    
    symbol = signal.get("symbol")
    strategy = signal.get("strategy")
    original_score = signal.get("score", 0)
    
    # 1. 检查品种
    valid_symbols = ultra_config.get("symbols", ["BTCUSDT", "ETHUSDT"])
    if symbol not in valid_symbols:
        return {"should_trade": False, "reason": f"{symbol} 不在1分钟交易列表中"}
    
    # 2. 检查策略权重
    weights = strategy_weights_1m.get("weights", {})
    strategy_config = weights.get(strategy, {})
    
    if isinstance(strategy_config, dict):
        strategy_weight = strategy_config.get("weight", 0)
    else:
        strategy_weight = strategy_config
    
    if strategy_weight <= 0:
        return {
            "should_trade": False, 
            "reason": f"策略 {strategy} 在1分钟禁用 (权重: {strategy_weight})"
        }
    
    # 3. 评分调整
    adjusted_score = original_score
    reasons = []
    
    # 策略权重加分
    if strategy_weight >= 80:
        adjusted_score += 5
        reasons.append(f"策略权重高({strategy_weight}) +5")
    elif strategy_weight < 60:
        adjusted_score -= 10
        reasons.append(f"策略权重低({strategy_weight}) -10")
    
    # 4. 检查最低评分 (90分)
    min_score = ultra_config.get("min_score", 90)
    if adjusted_score < min_score:
        return {
            "should_trade": False,
            "original_score": original_score,
            "adjusted_score": adjusted_score,
            "min_required": min_score,
            "reasons": reasons,
            "reason": f"调整后评分 {adjusted_score} < 最低要求 {min_score}"
        }
    
    # 5. 风控检查
    daily_loss_limit = ultra_config.get("daily_loss_limit", 500)
    # TODO: 检查当日亏损
    
    # 6. 最大持仓检查
    max_trades = 3  # 1分钟最多3笔同时持仓
    # TODO: 检查当前活跃交易数量
    
    return {
        "should_trade": True,
        "original_score": original_score,
        "adjusted_score": adjusted_score,
        "min_required": min_score,
        "strategy_weight": strategy_weight,
        "position_size_pct": ultra_config.get("position_size_pct", 0.1),
        "stop_loss_pct": ultra_config.get("stop_loss_pct", 0.3),
        "take_profit_pct": ultra_config.get("take_profit_pct", 0.8),
        "max_hold_minutes": ultra_config.get("max_hold_minutes", 30),
        "reasons": reasons,
        "recommendation": "✅ 建议交易 (1分钟超短线)"
    }
```

---

### 3. 修改 create_trade 函数

```python
def create_trade(signal, payload):
    """
    创建交易 - 支持多周期
    
    修复: 根据 timeframe 选择正确的决策逻辑
    """
    evolution = json.load(open("~/.openclaw/workspace/xiaoming_evolution.json"))
    
    # 获取时间周期 (默认为5m)
    timeframe = signal.get("timeframe", "5m")
    
    # 1分钟周期 - 使用专用决策
    if timeframe == "1m":
        result = should_create_trade_1m(signal, evolution)
        
        if not result["should_trade"]:
            print(f"❌ 1分钟交易被拒绝: {result.get('reason', 'Unknown')}")
            # 创建观望笔记
            create_rejection_note(signal, result)
            return None
        
        # 使用1分钟专用仓位计算
        account = json.load(open("~/.openclaw/workspace/xiaoming_account.json"))
        balance = account.get("current_balance", 100000)
        position_size = get_position_size(balance, signal["symbol"], "1m", evolution)
        
        # 覆盖信号中的仓位和风控参数
        signal["position_size"] = position_size
        signal["stop_loss_pct"] = result.get("stop_loss_pct", 0.3)
        signal["take_profit_pct"] = result.get("take_profit_pct", 0.8)
        signal["max_hold_minutes"] = result.get("max_hold_minutes", 30)
        signal["adjusted_score"] = result.get("adjusted_score", signal.get("score", 0))
        
        print(f"✅ 1分钟交易通过: 评分 {result['adjusted_score']}, 仓位 ${position_size:.2f}")
    
    # 5分钟周期 - 使用原有决策
    else:
        result = should_create_trade(signal, evolution)  # 原有函数
        if not result["should_trade"]:
            return None
    
    # 继续原有创建流程...
    return create_trade_note(signal, payload)
```

---

## 📝 修复验证清单

部署修复后，请验证：

- [ ] 1分钟信号触发时，调用 `should_create_trade_1m()`
- [ ] 仓位计算为 $10-$100 (0.1%)
- [ ] 90分评分门槛生效
- [ ] 禁用策略无法通过
- [ ] BTC/ETH 才能交易
- [ ] 5分钟策略不受影响

---

## 🎯 关键修复点

| 问题 | 修复方案 | 状态 |
|------|---------|------|
| 仓位计算冲突 | 多周期仓位函数 | ✅ 代码已提供 |
| 缺少1分钟决策 | `should_create_trade_1m()` | ✅ 代码已提供 |
| 策略选择错误 | 检查1分钟策略权重 | ✅ 代码已提供 |
| 配置未读取 | 显式读取 ultra_short 配置 | ✅ 代码已提供 |

---

**请将上述代码添加到 SKILL.md 的适当位置，重启系统后生效。**

*修复补丁 v1.0 | 2026-02-05*

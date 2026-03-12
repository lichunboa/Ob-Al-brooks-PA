# LLM 触发优化方案

## 问题

当前系统每 2 分钟调用一次 LLM，导致：
1. LLM 超时频繁（长会话）
2. 成本高昂
3. 响应慢

## 解决方案

### 核心思路

**规则引擎优先，LLM 辅助**

- 正常扫描：使用规则引擎（快速、确定性）
- 关键决策：使用 LLM（深度分析）

### 触发条件

#### 1. 开仓决策（有新信号）

触发条件：
- 品种状态变为 `entry_ready`
- 有新的 pre_signal 出现
- AI 方向发生变化
- 市场状态重大变化（BO/TC/TR）

示例：
```
BTCUSDT: watching → entry_ready  ✅ 触发 LLM
ETHUSDT: watching → watching      ❌ 不触发
```

#### 2. 持仓管理变化

触发条件：
- 新开仓
- 部分平仓
- 止损调整
- 止盈调整
- 定期分析（10 分钟）

示例：
```
新开仓 BTCUSDT               ✅ 触发 LLM
止损从 95000 → 96000        ✅ 触发 LLM
持仓稳定，无变化             ❌ 不触发
```

#### 3. 平仓决策

触发条件：
- Premise Check 失效
- 止损/止盈触发
- 手动平仓请求

#### 4. 定期分析

触发条件：
- 有持仓：每 10 分钟
- 无持仓：每 30 分钟

### 实现

#### 1. LLMTriggerManager

```python
from llm_trigger_manager import get_trigger_manager

trigger_manager = get_trigger_manager()

# 判断是否需要 LLM
should_trigger, reason = trigger_manager.should_trigger_llm(
    phase=phase_plan["phase"],
    execution=execution,
    market_cache=market_cache,
    runtime=runtime,
)

if should_trigger:
    # 调用 LLM
    decision = call_llm(...)
    trigger_manager.record_llm_call()
else:
    # 使用规则引擎
    decision = rule_engine_decision(...)
    trigger_manager.record_rule_engine_call()
```

#### 2. 集成到 pa_runtime.py

在 `run_cycle` 方法中：

```python
def run_cycle(self, trigger: dict[str, Any] | None = None) -> dict[str, Any]:
    runtime = self.load_runtime_state()
    market_cache = self.normalize_market_cache(self.load_market_cache())
    execution = self.execution_snapshot()
    phase_plan = self.select_phase_plan(runtime, market_cache, execution, trigger)
    
    # 导入触发管理器
    from llm_trigger_manager import get_trigger_manager
    trigger_manager = get_trigger_manager()
    
    # 判断是否需要 LLM
    should_trigger_llm, trigger_reason = trigger_manager.should_trigger_llm(
        phase=phase_plan["phase"],
        execution=execution,
        market_cache=market_cache,
        runtime=runtime,
    )
    
    if should_trigger_llm:
        LOG.info(f"[LLM_TRIGGER] 触发 LLM: {trigger_reason}")
        # 正常 LLM 流程
        decision = self.call_llm_decision(...)
        trigger_manager.record_llm_call()
    else:
        LOG.info(f"[RULE_ENGINE] 使用规则引擎: {trigger_reason}")
        # 规则引擎流程
        decision = self.rule_engine_decision(...)
        trigger_manager.record_rule_engine_call()
    
    # 后续处理...
```

### 预期效果

#### 调用频率对比

**优化前：**
```
每 2 分钟调用 LLM
1 小时 = 30 次 LLM 调用
1 天 = 720 次 LLM 调用
```

**优化后：**
```
无持仓时：
- 无信号：规则引擎（0 次 LLM）
- 有信号：LLM（1 次）
- 定期分析：每 30 分钟 1 次

有持仓时：
- 持仓稳定：规则引擎（0 次 LLM）
- 持仓变化：LLM（1 次）
- 定期分析：每 10 分钟 1 次

预计：
1 小时 = 2-6 次 LLM 调用（减少 80-90%）
1 天 = 48-144 次 LLM 调用（减少 80-90%）
```

#### 成本对比

假设 LLM 调用成本 $0.01/次：

```
优化前：720 次/天 × $0.01 = $7.2/天
优化后：100 次/天 × $0.01 = $1.0/天

节省：86% 成本
```

#### 响应速度

```
优化前：
- 每次扫描等待 LLM（5-30 秒）
- 超时风险高

优化后：
- 正常扫描：规则引擎（<1 秒）
- 关键决策：LLM（5-30 秒）
- 超时风险低
```

### 统计监控

```python
# 获取统计
stats = trigger_manager.get_statistics()

print(f"LLM 调用: {stats['llm_calls']}")
print(f"规则引擎: {stats['rule_engine_calls']}")
print(f"LLM 占比: {stats['llm_ratio']:.1f}%")
print(f"最后调用: {stats['last_llm_call']}")
```

### 配置选项

在 `.env` 中添加：

```bash
# LLM 触发优化
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1

# 定期分析间隔（分钟）
AB_PATROL_LLM_POSITION_INTERVAL=10  # 有持仓时
AB_PATROL_LLM_SCAN_INTERVAL=30      # 无持仓时

# 强制使用 LLM（调试用）
AB_PATROL_FORCE_LLM=0
```

### 回退机制

如果需要回退到原来的行为：

```bash
# 禁用优化，每次都调用 LLM
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=0
```

或者：

```bash
# 强制使用 LLM
AB_PATROL_FORCE_LLM=1
```

### 测试验证

1. **无持仓扫描测试**
   ```bash
   # 预期：大部分使用规则引擎
   # 只在有新信号时触发 LLM
   ```

2. **有持仓管理测试**
   ```bash
   # 预期：持仓稳定时使用规则引擎
   # 止损/止盈调整时触发 LLM
   ```

3. **性能测试**
   ```bash
   # 运行 24 小时
   # 统计 LLM 调用次数
   # 验证减少 80%+
   ```

### 注意事项

1. **不影响交易质量**
   - 关键决策仍然使用 LLM
   - 规则引擎只处理确定性场景

2. **保持灵活性**
   - 可以随时切换回原模式
   - 可以调整触发条件

3. **监控统计**
   - 定期检查 LLM 调用比例
   - 确保不会遗漏重要信号

### 总结

通过智能触发管理：
- ✅ 减少 80-90% LLM 调用
- ✅ 降低超时风险
- ✅ 提高响应速度
- ✅ 降低成本
- ✅ 保持交易质量

**核心原则：规则引擎优先，LLM 辅助，关键时刻不缺席。**

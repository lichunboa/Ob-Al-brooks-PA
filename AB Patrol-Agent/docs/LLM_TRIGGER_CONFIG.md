# LLM 触发配置说明

## 配置选项

在 `config/.env` 中添加以下配置：

### 1. 智能触发模式（推荐）✅

```bash
# 启用智能触发优化
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1

# 定期分析间隔（分钟）
AB_PATROL_LLM_POSITION_INTERVAL=10  # 有持仓时
AB_PATROL_LLM_SCAN_INTERVAL=30      # 无持仓时
```

**效果：**
- 只在关键时刻触发 LLM
- 减少 80-90% LLM 调用
- 从 720 次/天 → 100 次/天

**触发条件：**
- 新信号出现（entry_ready）
- 持仓管理变化（止损/止盈调整）
- AI 方向变化
- 市场状态重大变化
- 定期分析（10/30 分钟）

### 2. 规则引擎优先模式

```bash
# 完全跳过 LLM，只用规则引擎
AB_PATROL_RULE_ENGINE_PRIORITY=1
```

**效果：**
- 100% 使用规则引擎
- 0 次 LLM 调用
- 最快响应速度

**适用场景：**
- 测试规则引擎
- 避免 LLM 成本
- 确定性交易

### 3. 强制 LLM 模式（调试用）

```bash
# 每次都调用 LLM（旧行为）
AB_PATROL_FORCE_LLM=1
```

**效果：**
- 每 2 分钟调用 LLM
- 720 次/天
- 用于调试和对比

### 4. 默认模式

如果不设置任何配置，系统使用默认 LLM 模式（兼容旧行为）。

## 推荐配置

### 生产环境（推荐）

```bash
# 启用智能触发
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1

# 定期分析间隔
AB_PATROL_LLM_POSITION_INTERVAL=10
AB_PATROL_LLM_SCAN_INTERVAL=30

# 规则引擎启用
AB_PATROL_RULE_ENGINE=1
```

### 测试环境

```bash
# 规则引擎优先（快速测试）
AB_PATROL_RULE_ENGINE_PRIORITY=1
AB_PATROL_RULE_ENGINE=1
```

### 调试环境

```bash
# 强制 LLM（对比测试）
AB_PATROL_FORCE_LLM=1
```

## 查看统计

在运行时，可以查看触发统计：

```python
from llm_trigger_integration import get_trigger_statistics

stats = get_trigger_statistics()
print(f"LLM 调用: {stats['llm_calls']}")
print(f"规则引擎: {stats['rule_engine_calls']}")
print(f"LLM 占比: {stats['llm_ratio']:.1f}%")
```

## 日志输出

系统会在日志中显示触发原因：

```
[LLM_TRIGGER] 智能触发: 新信号: BTCUSDT
[RULE_ENGINE] 规则引擎: 无新信号，使用规则引擎
[LLM_TRIGGER] 智能触发: 持仓管理变化: BTCUSDT 止损调整
```

## 迁移指南

### 从旧版本迁移

1. **备份配置**
   ```bash
   cp config/.env config/.env.backup
   ```

2. **添加新配置**
   ```bash
   echo "AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1" >> config/.env
   ```

3. **重启系统**
   ```bash
   # 重启 patrol runtime
   ```

4. **观察日志**
   - 检查 `[LLM_TRIGGER]` 和 `[RULE_ENGINE]` 日志
   - 确认触发逻辑正常

5. **验证效果**
   - 运行 24 小时
   - 统计 LLM 调用次数
   - 确认减少 80%+

### 回退到旧版本

如果需要回退：

```bash
# 方法 1：强制 LLM
AB_PATROL_FORCE_LLM=1

# 方法 2：禁用优化
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=0
```

## 常见问题

### Q: 会不会错过重要信号？

A: 不会。智能触发会在以下情况触发 LLM：
- 新信号出现
- 持仓管理变化
- 市场状态重大变化
- 定期分析（10/30 分钟）

### Q: 规则引擎够用吗？

A: 规则引擎处理确定性场景（80%），LLM 处理复杂场景（20%）。两者结合效果最好。

### Q: 如何调整触发频率？

A: 修改定期分析间隔：
```bash
AB_PATROL_LLM_POSITION_INTERVAL=5   # 更频繁
AB_PATROL_LLM_SCAN_INTERVAL=60      # 更少
```

### Q: 如何监控效果？

A: 查看日志和统计：
```bash
# 日志中搜索
grep "LLM_TRIGGER\|RULE_ENGINE" logs/patrol.log | tail -100

# 统计 LLM 调用
grep "LLM_TRIGGER" logs/patrol.log | wc -l
```

## 性能对比

### 优化前

```
每 2 分钟调用 LLM
1 小时 = 30 次
1 天 = 720 次
成本 = $7.2/天（假设 $0.01/次）
```

### 优化后（智能触发）

```
关键时刻调用 LLM
1 小时 = 2-6 次
1 天 = 48-144 次
成本 = $0.5-1.5/天

节省：80-93%
```

### 优化后（规则引擎优先）

```
完全不调用 LLM
1 小时 = 0 次
1 天 = 0 次
成本 = $0/天

节省：100%
```

## 总结

**推荐配置：智能触发模式**

优点：
- ✅ 减少 80-90% LLM 调用
- ✅ 降低成本
- ✅ 提高响应速度
- ✅ 保持交易质量
- ✅ 关键时刻不缺席

配置：
```bash
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1
AB_PATROL_LLM_POSITION_INTERVAL=10
AB_PATROL_LLM_SCAN_INTERVAL=30
AB_PATROL_RULE_ENGINE=1
```

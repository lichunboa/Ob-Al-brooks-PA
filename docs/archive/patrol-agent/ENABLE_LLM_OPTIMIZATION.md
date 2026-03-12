# 启用 LLM 触发优化

## 快速启用（3 步）

### 1. 编辑配置文件

```bash
cd "AB Patrol-Agent"
nano config/.env
```

### 2. 添加配置

在文件末尾添加：

```bash
# LLM 触发优化
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1
AB_PATROL_LLM_POSITION_INTERVAL=10
AB_PATROL_LLM_SCAN_INTERVAL=30
```

保存并退出（Ctrl+X, Y, Enter）

### 3. 重启系统

```bash
# 停止当前运行
# 然后重新启动
python runtime/pa_runtime.py
```

## 验证效果

### 查看日志

```bash
# 实时查看日志
tail -f logs/patrol.log | grep "LLM_TRIGGER\|RULE_ENGINE"
```

你应该看到：

```
[LLM_TRIGGER] 智能触发: 新信号: BTCUSDT
[RULE_ENGINE] 规则引擎: 无新信号，使用规则引擎
[RULE_ENGINE] 规则引擎: 持仓稳定，使用规则引擎
[LLM_TRIGGER] 智能触发: 定期市场分析（30分钟）
```

### 统计 LLM 调用

```bash
# 统计最近 1 小时的 LLM 调用
grep "LLM_TRIGGER" logs/patrol.log | grep "$(date +%Y-%m-%d)" | tail -100 | wc -l
```

**预期结果：**
- 优化前：~30 次/小时
- 优化后：~2-6 次/小时

## 配置说明

### 完整配置示例

```bash
# ========== LLM 触发优化 ==========

# 启用智能触发（推荐）
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1

# 定期分析间隔（分钟）
AB_PATROL_LLM_POSITION_INTERVAL=10  # 有持仓时，每 10 分钟深度分析
AB_PATROL_LLM_SCAN_INTERVAL=30      # 无持仓时，每 30 分钟市场分析

# 规则引擎启用（必须）
AB_PATROL_RULE_ENGINE=1

# ========== 其他模式（可选） ==========

# 规则引擎优先模式（完全跳过 LLM）
# AB_PATROL_RULE_ENGINE_PRIORITY=1

# 强制 LLM 模式（调试用，每次都调用）
# AB_PATROL_FORCE_LLM=1
```

### 参数调整

**更激进（更少 LLM 调用）：**
```bash
AB_PATROL_LLM_POSITION_INTERVAL=15  # 15 分钟
AB_PATROL_LLM_SCAN_INTERVAL=60      # 60 分钟
```

**更保守（更多 LLM 调用）：**
```bash
AB_PATROL_LLM_POSITION_INTERVAL=5   # 5 分钟
AB_PATROL_LLM_SCAN_INTERVAL=15      # 15 分钟
```

## 监控和调试

### 实时监控

```bash
# 监控触发情况
watch -n 5 'tail -100 logs/patrol.log | grep "LLM_TRIGGER\|RULE_ENGINE" | tail -20'
```

### 统计分析

```bash
# 今天的 LLM 调用次数
grep "LLM_TRIGGER" logs/patrol.log | grep "$(date +%Y-%m-%d)" | wc -l

# 今天的规则引擎调用次数
grep "RULE_ENGINE" logs/patrol.log | grep "$(date +%Y-%m-%d)" | wc -l
```

### 查看触发原因

```bash
# 查看最近的触发原因
grep "LLM_TRIGGER" logs/patrol.log | tail -20
```

示例输出：
```
[LLM_TRIGGER] 智能触发: 新信号: BTCUSDT
[LLM_TRIGGER] 智能触发: 持仓管理变化: ETHUSDT 止损调整
[LLM_TRIGGER] 智能触发: AI 方向变化: BTCUSDT AIL → AIS
[LLM_TRIGGER] 智能触发: 定期持仓分析（10分钟）
```

## 常见问题

### Q1: 配置后没有生效？

**检查：**
```bash
# 1. 确认配置文件存在
cat config/.env | grep "LLM_TRIGGER"

# 2. 确认系统已重启
ps aux | grep pa_runtime

# 3. 查看日志
tail -50 logs/patrol.log
```

### Q2: 还是每 2 分钟调用 LLM？

**可能原因：**
1. 配置未生效 → 重启系统
2. 使用了 `AB_PATROL_FORCE_LLM=1` → 移除该配置
3. 未启用优化 → 确认 `AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1`

### Q3: 会不会错过重要信号？

**不会。** 智能触发会在以下情况立即触发 LLM：
- ✅ 新信号出现（entry_ready）
- ✅ 持仓管理变化（止损/止盈调整）
- ✅ AI 方向变化
- ✅ 市场状态重大变化
- ✅ 定期分析（10/30 分钟）

### Q4: 如何临时禁用优化？

```bash
# 方法 1：强制 LLM（每次都调用）
AB_PATROL_FORCE_LLM=1

# 方法 2：禁用优化
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=0
```

然后重启系统。

### Q5: 如何查看节省了多少成本？

```bash
# 统计今天的调用次数
llm_calls=$(grep "LLM_TRIGGER" logs/patrol.log | grep "$(date +%Y-%m-%d)" | wc -l)
rule_calls=$(grep "RULE_ENGINE" logs/patrol.log | grep "$(date +%Y-%m-%d)" | wc -l)

echo "LLM 调用: $llm_calls"
echo "规则引擎: $rule_calls"
echo "总调用: $((llm_calls + rule_calls))"
echo "LLM 占比: $(echo "scale=1; $llm_calls * 100 / ($llm_calls + $rule_calls)" | bc)%"
```

## 回退方案

如果需要回退到旧版本：

### 方法 1：禁用优化

```bash
# 编辑 config/.env
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=0
```

### 方法 2：强制 LLM

```bash
# 编辑 config/.env
AB_PATROL_FORCE_LLM=1
```

### 方法 3：Git 回退

```bash
git checkout HEAD~1 runtime/pa_runtime.py
```

然后重启系统。

## 性能对比

### 优化前（每 2 分钟调用）

```
1 小时 = 30 次 LLM
1 天 = 720 次 LLM
成本 = $7.2/天（假设 $0.01/次）
超时风险 = 高
```

### 优化后（智能触发）

```
1 小时 = 2-6 次 LLM
1 天 = 48-144 次 LLM
成本 = $0.5-1.5/天
超时风险 = 低

节省：80-93%
```

## 总结

**推荐配置：**

```bash
AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1
AB_PATROL_LLM_POSITION_INTERVAL=10
AB_PATROL_LLM_SCAN_INTERVAL=30
AB_PATROL_RULE_ENGINE=1
```

**效果：**
- ✅ 减少 80-90% LLM 调用
- ✅ 降低成本
- ✅ 提高响应速度
- ✅ 降低超时风险
- ✅ 保持交易质量

**启用后：**
1. 查看日志确认生效
2. 监控 24 小时
3. 统计 LLM 调用次数
4. 验证交易质量

**有问题？**
- 查看日志：`tail -f logs/patrol.log`
- 查看配置：`cat config/.env`
- 查看统计：`grep "LLM_TRIGGER\|RULE_ENGINE" logs/patrol.log | tail -100`

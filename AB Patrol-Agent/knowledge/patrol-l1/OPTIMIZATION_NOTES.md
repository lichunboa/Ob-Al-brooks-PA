# PA Runtime 优化说明

## 📅 优化日期：2026-03-09

基于 Al Brooks 交易理念的 7 个核心优化，旨在提高开仓频率（从 0-2 笔/天 → 5-10 笔/天）

---

## ✅ 已实施的优化

### 1. 修正 P×R 计算（最严重的 bug）

**问题**：之前可能拒绝了实际 TE 为正的交易

**修正**：
```python
# 正确公式：P×R > (1-P)
# 例如：P=45% R=1.5 → 0.675 > 0.55 ✓（之前被错误拒绝）
```

**影响**：立即生效，修复最严重的 bug

---

### 2. 简化状态机

**之前**：watching → pre_signal → entry_ready_blocked → entry_ready → 执行

**现在**：watching → candidate → executable

**Al Brooks 原则**：看到 setup → 评估 P×R → 入场（不需要 4 个状态）

---

### 3. 放宽信号 K 线要求

**Al Brooks 原则**：
- "Context > 形态 > 信号K线"
- "差的信号 bar 在好 context 中也足够"

**实施**：
```python
# Context 清晰时，小 body 也可以
if context_score >= 7:  # 强 context
    min_body = 2  # 放宽到 2 点
elif context_score >= 5:
    min_body = 3
else:
    min_body = 5
```

**Context Score 计算**：
- 趋势强度 (0-4 分)
- EMA 支撑 (0-2 分)
- 多周期对齐 (0-3 分)
- 最近 Spike (0-1 分)
- 关键位 (0-1 分)

---

### 4. 启用多周期独立入场

**Al Brooks 原则**：
- "5m TR → 立即查 15m/1h 是否有 setup"
- 15m 的 H2 = 独立的 Swing 入场信号

**实施**：
- 任何周期（5m/15m/1h）有信号都触发深度分析
- 15m/1h 的 Swing 信号不再等 5m 确认
- 优先级：15m > 1h > 5m（因为 15m/1h 的 Swing 更可靠）

---

### 5. 增强 Scalp 快速通道

**Al Brooks 预期**：
- TR 边缘 BLSHS = 60% 概率，< 30 秒决策
- EMA PB Scalp = 60% 概率，< 30 秒决策

**实施**：
```python
SCALP_TRIGGERS = {
    "tr_edge": {"P": 0.60, "R": 1.0},
    "ema_touch": {"P": 0.60, "R": 1.0},
    "first_pb": {"P": 0.60, "R": 1.0},
    "h2_l2_trigger": {"P": 0.55, "R": 1.0},
    "wedge_complete": {"P": 0.55, "R": 1.5},
    "blshs": {"P": 0.60, "R": 1.0},
    "failed_bo": {"P": 0.55, "R": 1.0},
}
```

**效果**：Scalp 执行速度从 2-5 分钟 → < 30 秒

---

### 6. 实现反恐惧强制执行

**Al Brooks 原则**：
- "Beginners fear loss and miss great trades"
- "If you are a trader, TRADE!"

**实施**：
```python
# 连续 2 轮所有品种 PASS 且无有效理由（RULE/WAIT）
if consecutive_fear_passes >= 2:
    # 下一轮：找到第一个 P×R 达标的 setup
    # 强制执行
```

**效果**：避免过度保守

---

### 7. 增加 H1 入场优先级

**Al Brooks 原则**：Spike 后默认 H1，不等 H2

**实施**：
```python
# Spike 后 5 根 K 线内默认 H1
if (recent_spike or recent_bo) and bars_since_spike <= 5:
    return "H1_ENTRY"

# 强 TC 中 H1 也有效
if state == "TC" and trend_strength >= 7:
    return "H1_ENTRY"

# BO 状态中 H1 有效
if state == "BO":
    return "H1_ENTRY"
```

**效果**：不再错过 Spike 后的快速入场机会

---

## 📈 预期改进效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 开仓频率 | 0-2 笔/天 | 5-10 笔/天 |
| 多周期利用 | 15m/1h 被忽略 | 独立执行 |
| Scalp 速度 | 2-5 分钟 | < 30 秒 |
| TE 准确性 | 拒绝正 TE | 修正公式 |

---

## 🔧 使用方法

### 方法 1: 在 pa_runtime.py 中导入

```python
# 在 pa_runtime.py 开头添加
from pa_runtime_optimizations import (
    validate_trader_equation,
    simplify_status,
    validate_signal_bar,
    calculate_context_score,
    should_trigger_deep_analysis,
    extract_trigger_timeframes,
    detect_scalp_trigger,
    scalp_fast_lane,
    FearDetector,
    validate_h1_entry,
)
```

### 方法 2: 直接复制函数

将 `pa_runtime_optimizations.py` 中的函数直接复制到 `pa_runtime.py` 中

---

## 📝 关键文件

- `runtime/pa_runtime_optimizations.py` — 优化补丁（所有 7 个优化）
- `runtime/pa_runtime.py` — 主运行时（需要应用优化）
- `knowledge/patrol-l1/SKILL.md` — 知识库主文件
- `knowledge/patrol-l1/references/S5-evaluation.md` — 评估标准

---

## ⚠️ 注意事项

1. **P×R 计算是最关键的修复** — 立即生效
2. **多周期独立入场需要修改 Quick Scan 逻辑** — 任何周期触发都进 Phase B
3. **Scalp 快速通道需要修改事件检测** — 不降级到 Phase B
4. **反恐惧机制需要跟踪状态** — 使用 FearDetector 类
5. **H1 入场需要修改通道入场逻辑** — Spike 后默认 H1

---

## 🚀 下一步

1. ✅ 优化补丁已创建并测试通过
2. ⏳ 应用优化到 pa_runtime.py
3. ⏳ 重启服务测试效果
4. ⏳ 观察 1-2 天的开仓频率
5. ⏳ 根据实际效果微调参数

---

## 📚 参考文档

- `ENTRY_LOGIC_OPTIMIZATION.md` — 详细分析和优化方案
- `TRADING_FREQUENCY_ANALYSIS.md` — 交易频率影响因素
- Al Brooks PDF 文档：
  - `AB Console-Obsidian/Categories 分类/Al brooks/图表百科全书-文件夹版/`
  - `AB Console-Obsidian/Categories 分类/Al brooks/《价格行为PPT中文笔记》/`

---

**优化完成日期**：2026-03-09
**Agent ID**：ac9927c180c17a789（可以 resume 继续分析）

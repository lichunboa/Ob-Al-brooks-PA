# 交易频率影响因素分析

## 📊 当前扫描频率逻辑

系统通过 `normalize_next_scan_seconds()` 函数动态调整扫描间隔，影响交易频率的核心因素：

### 1️⃣ **持仓状态** (最高优先级)
```python
if positions:
    return 240  # 4分钟快扫
```
- **有持仓时**：固定 240 秒（4分钟）快速扫描
- **目的**：及时管理持仓，调整止损/止盈

---

### 2️⃣ **预信号状态** (高优先级)
```python
if has_pre_signal:
    return 240  # 4分钟快扫
```
- **有预信号时**：240 秒快速扫描
- **触发条件**：
  - `status == "pre_signal"`
  - `status == "entry_ready"`
  - `status == "entry_ready_blocked"`
- **目的**：快速捕捉入场机会

---

### 3️⃣ **市场事件** (中高优先级)
```python
if near_trigger or position_volatility_high or fresh_bc_sc or tr_edge_active:
    return 120  # 2分钟极速扫描
```
- **触发条件**：
  - `near_trigger`: 价格接近触发点
  - `position_volatility_high`: 持仓波动大
  - `fresh_bc_sc`: 新鲜的宽通道/高潮反转
  - `tr_edge_active`: 区间边缘活跃
- **目的**：极速响应市场变化

---

### 4️⃣ **动量活跃** (中优先级)
```python
if momentum_active:
    return 180  # 3分钟扫描
```
- **触发条件**：检测到动量信号
- **目的**：跟踪趋势延续

---

### 5️⃣ **观察疲劳** (降频机制)
```python
if stale_count > 3:
    return 300  # 5分钟慢扫

if all_watching_three:
    return 720  # 12分钟超慢扫
```
- **stale_count > 3**: 超过 3 个品种连续观察 6 轮以上
- **all_watching_three**: 所有品种都连续观察 3 轮以上
- **目的**：避免无效扫描，节省资源

---

### 6️⃣ **默认扫描** (基准频率)
```python
if not positions and not has_pre_signal:
    return 480  # 8分钟标准扫描
```
- **无持仓 + 无预信号**：480 秒（8分钟）标准扫描
- **目的**：保持市场观察，不过度频繁

---

## 🔍 影响交易频率的关键因素

### ✅ **加速扫描的因素**（提高交易频率）
1. **持仓存在** → 240s (4分钟)
2. **预信号出现** → 240s (4分钟)
3. **价格接近触发点** → 120s (2分钟)
4. **区间边缘活跃** → 120s (2分钟)
5. **新鲜 BC/SC 形态** → 120s (2分钟)
6. **动量活跃** → 180s (3分钟)

### ⚠️ **减速扫描的因素**（降低交易频率）
1. **连续观察无变化** → 300s (5分钟)
2. **所有品种都在观察** → 720s (12分钟)
3. **无持仓 + 无预信号** → 480s (8分钟)

---

## 🚨 当前可能影响交易频率的问题

### 问题 1: **观察疲劳触发过早**
```python
if all_watching_three:
    return 720  # 12分钟
```
- **问题**：如果所有品种都连续观察 3 轮，直接降到 12 分钟
- **影响**：可能错过快速变化的市场机会
- **建议**：增加阈值到 5 轮，或者检查是否有价格接近关键位

### 问题 2: **预信号判断可能不够敏感**
```python
has_pre_signal = any(
    status == "pre_signal"
    or str(patch.get("pre_signal") or "").strip()
    for patch in symbol_updates.values()
)
```
- **问题**：只检查 `status` 和 `pre_signal` 字段
- **影响**：可能遗漏一些潜在的入场机会
- **建议**：增加对 `entry_idea` 或 `planned_trade` 的检查

### 问题 3: **默认扫描间隔过长**
```python
if not positions and not has_pre_signal:
    return 480  # 8分钟
```
- **问题**：无持仓时默认 8 分钟扫描
- **影响**：可能错过快速形成的机会
- **建议**：根据市场波动率动态调整，波动大时缩短到 240s

### 问题 4: **model_timeout 时的处理**
```python
if model_timeout:
    if positions or has_pre_signal:
        return 240
    return 480
```
- **问题**：超时后直接降到 480s
- **影响**：可能错过紧急市场变化
- **建议**：超时后应该更快重试（120s）

---

## 💡 优化建议

### 建议 1: **增加波动率感知**
```python
# 根据市场波动率动态调整基准频率
if high_volatility:
    base_scan = 240  # 高波动时 4 分钟
else:
    base_scan = 480  # 低波动时 8 分钟
```

### 建议 2: **优化观察疲劳阈值**
```python
# 从 3 轮增加到 5 轮
if all_watching_five:
    return 720
```

### 建议 3: **增加价格接近度检查**
```python
# 检查价格是否接近关键位（支撑/阻力/EMA）
if price_near_key_level:
    return 180  # 3 分钟快扫
```

### 建议 4: **超时后快速重试**
```python
if model_timeout:
    return 120  # 超时后 2 分钟快速重试
```

---

## 📈 当前系统状态

根据最新状态：
```
phase: BOOTSTRAP 全刷新观察轮
cycle_age: 18s
next_scan: 120s
```

- ✅ **当前扫描间隔**: 120 秒（2分钟）
- ✅ **原因**: BTC、ETH 有待触发的 stop-entry（高优先级快扫）
- ✅ **符合逻辑**: 有预信号时应该快速扫描

---

## 🎯 结论

**当前交易频率逻辑总体合理**，但可以优化：

1. ✅ **持仓和预信号时快速扫描** (240s) - 正确
2. ✅ **市场事件时极速扫描** (120s) - 正确
3. ⚠️ **观察疲劳阈值可能过低** - 建议从 3 轮增加到 5 轮
4. ⚠️ **默认扫描间隔可能过长** - 建议根据波动率动态调整
5. ⚠️ **超时后应该更快重试** - 建议从 480s 改为 120s

**总体评价**: 系统设计良好，但在边缘情况下可能错过一些机会。建议增加波动率感知和优化阈值。

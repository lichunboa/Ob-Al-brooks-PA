# ab_* 模块集成方案对比 — patrol-l1 V5.0

## 📋 文档概述

本文档详细对比 patrol-l1 V4.3（当前版本）和 V5.0（集成 ab_sr/ab_mm/ab_patterns 后）的完整逻辑。

**核心原则**：
- ✅ **两层架构**：计算层（ab_* 模块）+ 决策层（S 文件）
- ✅ **知识体系不变**：S 文件仍然要 Read，引用关系不变
- ✅ **agent 专注决策**：新模块只提供数值，不替代决策

---

## 🎯 集成目标

### 解决的问题

| 问题 | V4.3 现状 | V5.0 优化 |
|------|----------|----------|
| **Premise Check 形式化** | 只写"5项✓"，没有具体内容 | 每项都有数值支撑（支撑 2050.5 (swing_low)，距离 0.45%） |
| **BNB 最优点被错过** | Phase B 分析太慢（~2 分钟） | Quick Scan 快速过滤（≤ 1 秒），R < 1.5:1 立刻 PASS |
| **周期不全** | 15m、1h 扫描被压缩 | 3 品种 × 3 周期全覆盖，MULTI-TF 格式输出 |
| **S/R 类型模糊** | "支撑仍在"（模糊） | "支撑 2050.5 (swing_low)，距离 0.45%"（精确） |

### 不改变的部分

| 保持不变 | 说明 |
|---------|------|
| **S 文件体系** | S0→S1→S2→S3→S3b→S4→S5→S6→S7 引用关系不变 |
| **决策逻辑** | agent 仍然 Read S 文件，用 S 文件知识做决策 |
| **工作流程** | Step 0 → Step 1 → Step 2 → Step 3 → Step 4 → Step 5 流程不变 |
| **缓存机制** | market_state_l1.json 结构不变（可选：增加 ab_* 数据） |

---

## 📊 V4.3 vs V5.0 完整对比

### Step 0: 首轮初始化

| 步骤 | V4.3 | V5.0 | 变化 |
|------|------|------|------|
| 加载缓存 | `cat market_state_l1.json` | 同左 | ❌ 不变 |
| 检查过期 | `last_full_refresh` 超过 1 小时 → 标记 stale | 同左 | ❌ 不变 |
| COLD_START | 缓存不存在 → 全流程分析 | 同左 | ❌ 不变 |

---

### Step 1: 获取全局数据 + Daily 偏置

| 步骤 | V4.3 | V5.0 | 变化 |
|------|------|------|------|
| **1a. API 数据** | 并行获取 balance/positions/bot-summary/can-trade | 同左 | ❌ 不变 |
| **1b. Daily 偏置** | 检查缓存 `daily_bias.{SYM}.expires_at`<br>- 未过期 → 用缓存<br>- 已过期 → Read S0 + 获取 1d K 线 | 同左 | ❌ 不变 |

---

### Step 2: 持仓管理

#### V4.3 逻辑：

```python
# Step 2: 持仓管理（有持仓时最优先）
for position in positions:
    # 1. Read S 文件
    Read S2-direction.md
    Read S3-market-state.md
    Read S3b-key-levels.md
    Read S7-management.md

    # 2. 获取 K 线
    klines = get_klines_multi(position.symbol)

    # 3. Premise Check（5 项检查）
    [PREMISE CHECK] {symbol}:
      1. AI 方向: {S2 分析} vs 持仓 {side} → ✓ 一致
      2. 市场状态: {S3 分析} → ✓ 支持
      3. 信号 K 线: {手动判断} → ✓ 成立
      4. FT 质量: {S1 读盘} → ✓
      5. 目标路径: {手动查找 S/R} → ⚠️ 注意

    # 4. 三种保护 + Trailing + 获利
    # ...
```

#### V5.0 逻辑：

```python
# Step 2: 持仓管理（有持仓时最优先）
for position in positions:
    # 1. 获取 K 线
    klines = get_klines_multi(position.symbol)

    # 2. 调用新模块（自动，每轮都调用）← 新增
    sr_info = analyze_ab_sr(klines['5m'])
    pat_info = analyze_ab_patterns(klines['5m'])

    # 3. Read S 文件
    Read S2-direction.md
    Read S3-market-state.md
    Read S3b-key-levels.md
    Read S7-management.md

    # 4. Premise Check（结合数值 + S 文件知识）← 增强
    [PREMISE CHECK] {symbol}:
      1. AI 方向: {S2 分析} vs 持仓 {side} → ✓ 一致
      2. 市场状态:
         - S3 分析: {market_state}
         - 压力方向: {pat_info.pressure.direction} = bull_pressure (65% 多头 K)
         - 结论: ✓ 支持
      3. 信号 K 线:
         - 原 premise: H2 @ 2055.15
         - 当前支撑: {sr_info.nearest_support} = 2050.5 ({sr_info.support_type} = swing_low)
         - 距离支撑: {sr_info.dist_support_pct} = 0.45%
         - 结论: 支撑仍在 → ✓ 成立
      4. FT 质量:
         - S1 读盘: {分析}
         - 压力方向: {pat_info.pressure.direction} = bull_pressure
         - 结论: ✓
      5. 目标路径:
         - TP1: 2079.15 (2R)
         - 路径上 S/R: {sr_info.levels 中 2053-2079 之间的 level}
         - 最近阻力: {sr_info.nearest_resistance} = 2065.0 ({sr_info.resistance_type} = bo_origin)
         - 结论: 路径上有阻力，但不强 → ⚠️ 注意

    # 5. 三种保护 + Trailing + 获利
    # ...
```

#### 对比表格：

| 项目 | V4.3 | V5.0 | 优势 |
|------|------|------|------|
| **调用新模块** | ❌ 无 | ✅ 自动调用 ab_sr + ab_patterns | 提供精确数值 |
| **Premise Check 第 2 项** | 模糊（"市场支持"） | 精确（"bull_pressure (65% 多头 K)"） | 数值支撑 |
| **Premise Check 第 3 项** | 模糊（"支撑仍在"） | 精确（"支撑 2050.5 (swing_low)，距离 0.45%"） | 类型明确 |
| **Premise Check 第 5 项** | 手动查找 S/R | 自动（sr_info.levels） | 快速准确 |
| **时间** | ~2 分钟/持仓 | ~30 秒/持仓 | 速度提升 4x |

---

### Step 3: 扫描新机会

#### Phase A: Quick Scan

##### V4.3 逻辑：

```python
# Phase A: Quick Scan（3 品种 × 3 周期，不读 S 文件）
for symbol in ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']:
    for tf in ['5m', '15m', '1h']:
        # 1. 获取 K 线
        klines = get_klines(symbol, tf)

        # 2. 纯数值检测（9 类事件）
        events = detect_events_pure_numeric(klines, cache[symbol][tf])
        # - anomaly: body > 2x avg_bar_size
        # - level_break: close 穿越缓存中的 key_levels
        # - tr_edge: close 在 TR 上/下 1/3
        # - momentum: 3+ 连续同向趋势 K 线
        # - ema_touch: abs(close - ema20) / close < 0.003
        # - signal_trigger: 缓存 pre_signal.condition 被满足
        # - climax_suspected: S3 Climax 快速检测评分 ≥ 4
        # - h2_l2_trigger: PB 完成 + 信号 bar 出现
        # - pb_complete: 趋势方向 K 线在 PB 后出现

        # 3. 有事件 → 进入 Phase B
        if events:
            phase_b_queue.append({
                'symbol': symbol,
                'tf': tf,
                'events': events,
            })
```

##### V5.0 逻辑：

```python
# Phase A: Quick Scan（3 品种 × 3 周期，不读 S 文件）
for symbol in ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']:
    for tf in ['5m', '15m', '1h']:
        # 1. 获取 K 线
        klines = get_klines(symbol, tf)

        # 2. 纯数值检测（9 类事件）← 不变
        events = detect_events_pure_numeric(klines, cache[symbol][tf])

        # 3. 有事件 → 调用新模块（按需）← 新增
        if events:
            # 按需调用（根据事件类型）
            modules_needed = set()
            for event in events:
                if event['type'] in ('level_break', 'tr_edge', 'h2_l2_trigger', 'signal_trigger'):
                    modules_needed.add('ab_sr')
                if event['type'] in ('h2_l2_trigger', 'signal_trigger'):
                    modules_needed.add('ab_mm')
                if event['type'] in ('anomaly', 'climax_suspected', 'pb_complete', 'signal_trigger'):
                    modules_needed.add('ab_patterns')

            # 只调用需要的模块
            sr_info = None
            mm_info = None
            pat_info = None

            if 'ab_sr' in modules_needed:
                sr_info = analyze_ab_sr(klines)  # ≤ 0.5 秒
            if 'ab_mm' in modules_needed:
                mm_info = analyze_ab_mm(klines)  # ≤ 0.5 秒
            if 'ab_patterns' in modules_needed:
                pat_info = analyze_ab_patterns(klines)  # ≤ 0.5 秒

            # 4. 快速过滤（R < 1.5:1 → PASS）← 新增
            if 'signal_trigger' in [e['type'] for e in events]:
                # 计算 R
                entry = klines[-1]['C']
                sl = sr_info.nearest_support if sr_info else entry * 0.98
                target = mm_info.nearest_bull_target['price'] if mm_info else entry * 1.02
                R = abs(target - entry) / abs(entry - sl)

                if R < 1.5:
                    # R 不足，PASS
                    continue

            # 5. 进入 Phase B
            phase_b_queue.append({
                'symbol': symbol,
                'tf': tf,
                'events': events,
                'sr_info': sr_info,  # ← 新增
                'mm_info': mm_info,  # ← 新增
                'pat_info': pat_info,  # ← 新增
            })
```

##### 对比表格：

| 项目 | V4.3 | V5.0 | 优势 |
|------|------|------|------|
| **纯数值检测** | ✅ 9 类事件 | ✅ 9 类事件 | ❌ 不变 |
| **调用新模块** | ❌ 无 | ✅ 按需调用（1-3 个模块） | 提供精确数值 |
| **快速过滤** | ❌ 无 | ✅ R < 1.5:1 → PASS | 避免进入 Phase B |
| **时间** | ≤ 5 秒 | ≤ 5 秒（按需调用，平均 ~10 次 vs 27 次） | ❌ 不变 |

---

#### Phase B: 深分析

##### V4.3 逻辑：

```python
# Phase B: 深分析（读 S 文件）
for item in phase_b_queue:
    symbol = item['symbol']
    tf = item['tf']
    events = item['events']

    # 1. Read S 文件（决策层）
    Read S2-direction.md
    Read S3-market-state.md
    Read S3b-key-levels.md
    Read S5-evaluation.md
    Read S6-{type}.md

    # 2. 深分析（结合 K 线数据 + S 文件知识）
    [ANALYSIS] {symbol} {tf}:
      事件: {events}
      AI 方向: {S2 分析}
      市场状态: {S3 分析}
      关键位置: {S3b 分析}

      S5 评估: P×R = {手动计算}

      决策: {入场/PASS}
```

##### V5.0 逻辑：

```python
# Phase B: 深分析（读 S 文件）
for item in phase_b_queue:
    symbol = item['symbol']
    tf = item['tf']
    events = item['events']
    sr_info = item['sr_info']  # ← Quick Scan 已经计算好了
    mm_info = item['mm_info']  # ← Quick Scan 已经计算好了
    pat_info = item['pat_info']  # ← Quick Scan 已经计算好了

    # 1. Read S 文件（决策层）
    Read S2-direction.md
    Read S3-market-state.md
    Read S3b-key-levels.md
    Read S5-evaluation.md
    Read S6-{type}.md

    # 2. 深分析（结合数值 + S 文件知识）← 增强
    [ANALYSIS] {symbol} {tf}:
      事件: {events}

      # 数值层（ab_* 模块）
      S/R: {sr_info.nearest_support} ({sr_info.support_type})
      MM 目标: {mm_info.nearest_bull_target.price} ({mm_info.nearest_bull_target.type})
      形态: {pat_info.latest_h}
      压力: {pat_info.pressure.direction}

      # 决策层（S 文件）
      AI 方向: {S2 分析}
      市场状态: {S3 分析}
      关键位置: {S3b 分析}（结合 sr_info 验证）

      S5 评估:
        - P = {S5 分析}
        - R = (target - entry) / (entry - sl)
          = ({mm_info.nearest_bull_target.price} - {entry}) / ({entry} - {sr_info.nearest_support})
          = 2.5
        - P×R = 0.6 × 2.5 = 1.5 > (1-0.6) × 1 = 0.4 ✓

      决策: 入场 LONG @ {entry_price}
```

##### 对比表格：

| 项目 | V4.3 | V5.0 | 优势 |
|------|------|------|------|
| **Read S 文件** | ✅ S2/S3/S3b/S5/S6 | ✅ S2/S3/S3b/S5/S6 | ❌ 不变 |
| **数值来源** | K 线数据 + 手动计算 | ab_* 模块（预计算） | 精确快速 |
| **S/R 类型** | 模糊（"支撑"） | 精确（"swing_low"） | 类型明确 |
| **MM 目标** | 手动计算 | 自动（mm_info） | 快速准确 |
| **R 计算** | 手动计算 | 自动（sr_info + mm_info） | 快速准确 |
| **时间** | ~1 分钟/信号 | ~30 秒/信号 | 速度提升 2x |

---

### Step 4: 输出 + 缓存更新

| 步骤 | V4.3 | V5.0 | 变化 |
|------|------|------|------|
| **输出格式** | 标准格式（symbol/tf/events/decision） | 同左 | ❌ 不变 |
| **缓存更新** | 更新 market_state_l1.json | 同左（可选：增加 ab_* 数据） | ⚠️ 可选 |
| **Discord 推送** | 开仓/平仓/移 SL/周期汇报 | 同左 | ❌ 不变 |

---

### Step 5: 定时器

| 步骤 | V4.3 | V5.0 | 变化 |
|------|------|------|------|
| **智能定时器** | P0-P5 优先级（2-12 分钟） | 同左 | ❌ 不变 |
| **Discord 推送** | 每 6 轮周期汇报 | 同左 | ❌ 不变 |

---

## 🔧 实施计划

### 阶段 1：ab_sr.py 集成（最优先）

**目标**：解决 Premise Check 第 3 项和第 5 项的模糊问题

**集成点**：
1. Step 2 持仓管理：Premise Check 第 3 项（入场前提是否仍然成立）
2. Step 2 持仓管理：Premise Check 第 5 项（目标路径上有新 S/R 阻挡吗）
3. Step 3 Quick Scan：level_break/tr_edge 事件检测

**修改文件**：
- `📁 Skills/patrol-l1/SKILL.md`（Step 2 和 Step 3）

**测试**：
- 有持仓时，Premise Check 输出是否包含精确的 S/R 数据
- Quick Scan 是否能快速检测 level_break 事件

---

### 阶段 2：ab_patterns.py 集成

**目标**：解决 Premise Check 第 2 项和第 4 项的模糊问题

**集成点**：
1. Step 2 持仓管理：Premise Check 第 2 项（市场状态是否支持）
2. Step 2 持仓管理：Premise Check 第 4 项（FT 质量）
3. Step 3 Quick Scan：anomaly/climax_suspected/pb_complete 事件检测

**修改文件**：
- `📁 Skills/patrol-l1/SKILL.md`（Step 2 和 Step 3）

**测试**：
- 有持仓时，Premise Check 输出是否包含压力方向数据
- Quick Scan 是否能快速检测 Climax 事件

---

### 阶段 3：ab_mm.py 集成

**目标**：快速计算 R，避免进入 Phase B

**集成点**：
1. Step 3 Quick Scan：快速过滤（R < 1.5:1 → PASS）
2. Step 3 Phase B：TP 设置参考

**修改文件**：
- `📁 Skills/patrol-l1/SKILL.md`（Step 3）

**测试**：
- Quick Scan 是否能快速过滤 R < 1.5:1 的信号
- Phase B 是否能快速计算 TP 目标

---

## 📚 知识体系保护

### S 文件引用关系（不变）

```
S0 (Daily Bias)
  ↓
S1 (Reading) → Q1-context.md
  ↓
S2 (Direction) → Q2-direction.md
  ↓
S3 (Market State) → Q3-fear.md, Q4-entry.md
  ↓
S3b (Key Levels) ← ab_sr.py 提供数值
  ↓
S4 (Strategy Match) ← ab_mm.py 提供 MM 目标
  ↓
S5 (Evaluation) → Q5-te.md, Q3-fear.md ← ab_mm.py 提供 R 计算
  ↓
S6 (Entry) → Q4-entry.md, Q3-fear.md ← ab_patterns.py 提供形态检测
  ├── S6-bo.md
  ├── S6-channel.md
  ├── S6-tr.md
  ├── S6-reversal.md
  └── S6-common.md
  ↓
S7 (Management) → Q6-management.md ← ab_sr.py + ab_patterns.py 提供 Premise Check 数据
```

### 新模块在知识体系中的位置

| S 文件 | 新模块提供 | S 文件保留 |
|--------|-----------|-----------|
| **S3b** | `sr_info.levels`（9 种 S/R 的数值） | "为什么这些是关键位置"的思考过程 |
| **S4** | `mm_info.targets`（MM 目标的数值） | "为什么选这个策略"的思考过程 |
| **S5** | `mm_info` 提供 R 计算 | "P×R 公式的逻辑"的思考过程 |
| **S6** | `pat_info.hl_entries`（H/L 检测） | "为什么这是好的入场点"的思考过程 |
| **S7** | `sr_info` + `pat_info` 提供 Premise Check 数据 | "为什么 Premise 失效"的思考过程 |

**结论**：
- ✅ S 文件仍然要 Read（保留"为什么"的思考过程）
- ✅ 新模块只提供数值（"是什么"），不替代决策（"怎么做"）
- ✅ 引用关系不变（S0→S1→S2→S3→S3b→S4→S5→S6→S7）

---

## 🎯 预期效果

### 性能提升

| 指标 | V4.3 | V5.0 | 提升 |
|------|------|------|------|
| **持仓管理时间** | ~2 分钟/持仓 | ~30 秒/持仓 | 4x |
| **Quick Scan 时间** | ≤ 5 秒 | ≤ 5 秒 | 1x（按需调用） |
| **Phase B 时间** | ~1 分钟/信号 | ~30 秒/信号 | 2x |
| **总时间（3 品种 × 3 周期）** | ~10 分钟/轮 | ~5 分钟/轮 | 2x |

### 质量提升

| 指标 | V4.3 | V5.0 | 提升 |
|------|------|------|------|
| **Premise Check 完整性** | ⚠️ 不完整（只写"5项✓"） | ✅ 完整（每项都有数值支撑） | 质的飞跃 |
| **S/R 类型明确性** | 模糊（"支撑"） | 精确（"swing_low"） | 质的飞跃 |
| **机会捕获率** | 错过 BNB 最优点 | 快速过滤，不错过 | 质的飞跃 |
| **周期覆盖率** | 15m、1h 被压缩 | 3 品种 × 3 周期全覆盖 | 质的飞跃 |

---

## ⚠️ 注意事项

### 1. 知识体系完整性

**风险**：agent 过度依赖数值，忽略 S 文件的思考过程

**防护措施**：
- ✅ S 文件仍然要 Read（每个阶段都要 Read）
- ✅ 新模块只提供数值，不替代决策
- ✅ agent 必须结合数值 + S 文件知识做决策

### 2. 缓存过期

**风险**：新模块数据过期，导致决策错误

**防护措施**：
- ✅ 方案 2：每轮重新计算（推荐）
- ✅ 加时间戳：`computed_at` + `data_timestamp`
- ✅ agent 可以检查数据时间，超过 5 分钟重新计算

### 3. 计算开销

**风险**：3 品种 × 3 周期 × 3 模块 = 27 次调用，可能影响速度

**防护措施**：
- ✅ 按需调用：只在有事件时调用（平均 ~10 次/轮）
- ✅ 缓存 K 线：避免重复获取
- ✅ 并行调用：多个信号并行处理

---

## 📝 总结

### 核心原则

1. **两层架构**：计算层（ab_* 模块）+ 决策层（S 文件）
2. **知识体系不变**：S 文件仍然要 Read，引用关系不变
3. **agent 专注决策**：新模块只提供数值，不替代决策

### 集成效果

- ✅ **速度提升 2-4x**：持仓管理 4x，Phase B 2x
- ✅ **质量提升**：Premise Check 完整性、S/R 类型明确性、机会捕获率、周期覆盖率
- ✅ **知识体系不崩塌**：S 文件仍然要 Read，引用关系不变

### 实施计划

1. **阶段 1**：ab_sr.py 集成（Premise Check 第 3/5 项）
2. **阶段 2**：ab_patterns.py 集成（Premise Check 第 2/4 项）
3. **阶段 3**：ab_mm.py 集成（Quick Scan 快速过滤）

---

**最后更新**：2026-03-03
**版本**：V5.0 集成方案
**作者**：Claude Code + 春波

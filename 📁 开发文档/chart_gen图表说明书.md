# chart_gen.py 图表说明书

## 概述

chart_gen.py 是 Al Brooks 风格的 K 线图生成器，集成了 4 个核心分析模块：
- **ab_ema.py** — EMA 20 分析
- **ab_sr.py** — 支撑/阻力分析
- **ab_mm.py** — Measured Move 目标
- **ab_patterns.py** — 形态识别

## 图表元素详解

### 1. K 线主体
- **绿色 K 线**：阳线（收盘 > 开盘）
- **红色 K 线**：阴线（收盘 < 开盘）
- **影线**：High/Low 范围
- **实体**：Open/Close 范围

### 2. EMA 20（蓝色实线）
- **来源**：ab_ema.py 的 `analyze_ab_ema()`
- **作用**：均值回归基准线，Al Brooks 唯一使用的指标
- **Agent 可见数据**：
  - `ema_slope`: "steep_rise" / "rising" / "flat" / "falling" / "steep_fall"
  - `bull_mag_count`: 多头 MAG 数量（价格在 EMA 上方的 bar）
  - `bear_mag_count`: 空头 MAG 数量（价格在 EMA 下方的 bar）
  - `first_pb_type`: "bull_pb" / "bear_pb" / "none"
  - `first_pb_bars_ago`: 第一次 PB 到 EMA 距今多少根 bar
- **图表标记**：橙色星号 ⭐ = First PB to EMA（可操作事件）

### 3. S/R 虚线（绿色/红色）
- **来源**：ab_sr.py 的 `analyze_ab_sr()`
- **绿色虚线**：支撑位（价格下方）
- **红色虚线**：阻力位（价格上方）
- **显示逻辑**：
  - 只显示可见范围内的 level (±10% 价格)
  - 优先显示重合区前 3 个 + 最近支撑/阻力
  - 限制 8 条线（避免拥挤）
- **Agent 可见数据**：
  ```python
  {
    "levels": [
      {
        "price": 95234.5,
        "type": "swing_high" / "swing_low" / "bo_origin" / "50pct_pb" /
                "round_number" / "gap_traditional" / "gap_body",
        "side": "support" / "resistance",
        "bars_ago": 12,
        # gap 特有字段
        "gap_class": "breakaway" / "measuring" / "exhaustion",
        "filled": False,
        "fill_bars": 0
      }
    ],
    "confluence_zones": [
      {
        "price_center": 95200,
        "types": ["swing_high", "round_number"],
        "count": 2,
        "score": 4  # count + type 种类数
      }
    ],
    "nearest_support": 94800,
    "nearest_resistance": 95600,
    "support_type": "swing_low",
    "resistance_type": "bo_origin",
    "tr_position": "bottom" / "middle" / "top",
    "trend_phase": "breakout" / "channel" / "tr",
    "gap_stats": {
      "open_gaps": 3,
      "filled_gaps": 1,
      "micro_gaps": 2
    }
  }
  ```

### 4. MM 目标线（绿色/红色点线）
- **来源**：ab_mm.py 的 `analyze_ab_mm()`
- **绿色点线**：多头 MM 目标（价格上方）
- **红色点线**：空头 MM 目标（价格下方）
- **显示逻辑**：只显示最近的多空目标各 1 个
- **Agent 可见数据**：
  ```python
  {
    "targets": [
      {
        "price": 96500,
        "type": "leg1_eq_leg2" / "tr_height" / "gap_mm" /
                "wedge_mm" / "channel_mm" / "second_order_mm",
        "direction": "up" / "down",
        "leg_height": 1200,  # leg1_eq_leg2 特有
        "pb_ratio": 0.45,    # leg1_eq_leg2 特有
        "bars_ago": 8
      }
    ],
    "nearest_bull_target": {...},  # 最近多头目标
    "nearest_bear_target": {...},  # 最近空头目标
    "bull_target_count": 2,
    "bear_target_count": 1
  }
  ```

### 5. 形态标记
- **来源**：ab_patterns.py 的 `analyze_ab_patterns()`

#### 5.1 H/L 入场（三角形）
- **绿色上三角 ▲**：H1/H2/H3/H4 多头入场
- **红色下三角 ▼**：L1/L2/L3/L4 空头入场
- **显示逻辑**：最近 2 个
- **位置**：略低于/高于 K 线，避免重叠

#### 5.2 DT/DB（菱形）
- **绿色菱形 ◆**：Double Bottom（看涨反转）
- **红色菱形 ◆**：Double Top（看跌反转）
- **显示逻辑**：最近 1 个
- **Agent 可见**：neckline 价格、depth

#### 5.3 Wedge（橙色星号）
- **橙色星号 ⭐**：楔形（三推）
- **显示逻辑**：最近 1 个
- **Agent 可见**：direction ("bull" / "bear")、momentum_decreasing

#### 5.4 Inside Bars（不显示）
- **原因**：太频繁，会让图表过于拥挤
- **Agent 可见**：type ("ib" / "ii" / "iii")、count、bars_ago

#### 5.5 Pressure（不显示标记，仅标题）
- **Agent 可见数据**：
  ```python
  {
    "direction": "bull_pressure" / "bear_pressure" / "neutral",
    "bull_pct": 0.65,  # 阳线占比
    "avg_close_position": 0.6,  # 平均收盘位置 (0=低, 1=高)
    "avg_body_ratio": 0.7  # 平均实体/总体比
  }
  ```

### 6. TR 边界（白色半透明虚线）
- **来源**：chart_gen.py 内置的 `detect_trading_range()`
- **逻辑**：最近 20 根 range < 2.5 × ATR → Trading Range
- **作用**：标识当前是否在窄幅整理区

### 7. 成交量（底部柱状图）
- **绿色柱**：阳线成交量
- **红色柱**：阴线成交量
- **作用**：
  - ✅ **有帮助**：Al Brooks 课程中提到 "Climax = 大成交量 + 大 bar"
  - ✅ **BO 确认**：BO bar 成交量大 → 真 BO 概率高
  - ✅ **反转信号**：Climax bar（大成交量 + 反转 bar）
  - ⚠️ **不是主要依据**：Al Brooks 主要看价格行为，成交量是辅助

## 标题信息详解

### 第一行（基础信息）
```
BTCUSDT  5m   EMA20=95234  ATR=123   AIL ↑  Trend Day   EMA↑ MAG:2B/8S
```
- **Symbol + Interval**：品种 + 周期
- **EMA20**：当前 EMA 20 价格
- **ATR**：14 期 ATR（波动率）
- **AIL ↑ / AIS ↓**：Always In Long / Always In Short（趋势方向）
- **Day Type**：Tight TR / Normal TR / Trend Day / Strong Trend
- **EMA 斜率**：EMA↑/EMA↓/EMA— + MAG 计数

### 第二行（S/R + MM + 形态）
```
TR:bottom Phase:breakout   S:94800   R:95600   MM↑:96500   H2   买压
```
- **TR:bottom/middle/top**：价格在 TR 的 1/3 位置
- **Phase:breakout/channel/tr**：趋势阶段（基于 gap 统计）
- **S:94800**：最近支撑价格
- **R:95600**：最近阻力价格
- **MM↑:96500**：多头 MM 目标
- **MM↓:94200**：空头 MM 目标
- **H2 / L1**：最新 H/L 入场形态
- **买压 / 卖压**：当前压力方向

## Agent 使用方式

### 1. 自动加载
- **无需手动启动**：chart_gen.py 使用懒加载，第一次调用时自动加载模块
- **无需重启**：重启电脑后，下次调用时自动重新加载
- **不需要放 📁 启动工具**：这是纯计算模块，不是服务

### 2. 调用方式

#### 方式 1：patrol-l1 自动调用（推荐）
patrol-l1 SKILL.md 可以在需要时调用 chart_gen.py：
```python
# 在 patrol-l1 中
import subprocess
subprocess.run([
    ".venv/bin/python", "scripts/chart_gen.py",
    "-s", "BTCUSDT", "-i", "5m", "-p", "8094"
])
```

#### 方式 2：手动生成
```bash
# 单品种
.venv/bin/python scripts/chart_gen.py -s BTCUSDT -i 5m,15m,1h -p 8094

# 批量（3 品种 × 3 周期）
.venv/bin/python scripts/chart_gen.py --patrol -p 8094
```

### 3. Agent 直接调用分析函数
Agent 可以直接调用 ab_* 模块获取完整数据（不生成图表）：
```python
from indicators.batch.ab_sr import analyze_ab_sr
from indicators.batch.ab_mm import analyze_ab_mm
from indicators.batch.ab_patterns import analyze_ab_patterns

# 获取完整 S/R 分析
sr_info = analyze_ab_sr(open_arr, high, low, close)
# sr_info 包含所有 level、confluence_zones、gap_stats 等

# 获取完整 MM 分析
mm_info = analyze_ab_mm(open_arr, high, low, close)
# mm_info 包含所有 targets、nearest_bull_target 等

# 获取完整形态分析
pat_info = analyze_ab_patterns(open_arr, high, low, close)
# pat_info 包含 hl_entries、dt_db、wedges、pressure、pb_depth 等
```

## 图表存储

### 路径结构
```
AB Console-Backend/data/charts/
├── 2026-03-03/              # 按日期分目录
│   ├── BTCUSDT_5m_014853.png
│   ├── BTCUSDT_15m_014853.png
│   ├── BTCUSDT_1h_014853.png
│   ├── ETHUSDT_5m_014854.png
│   └── ...
└── daily/                   # 日线单独目录（每天覆盖）
    ├── BTCUSDT_1d.png
    ├── ETHUSDT_1d.png
    └── BNBUSDT_1d.png
```

### 自动清理
- **默认保留**：最近 3 天
- **手动清理**：`python scripts/chart_gen.py --cleanup --keep-days 3`
- **批量生成时自动清理**：`--patrol` 模式会自动清理旧图片

## 配置

### 品种列表
```python
PATROL_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]  # V4.3 三品种
```

### 周期配置
```python
# 默认生成 3 个周期
trading_tf = "5m"      # 交易周期
structure_tf = "1h"    # 结构周期
# 自动生成: 5m, 15m, 1h
```

### K 线数量限制
```python
LIMITS = {
    "1m": 80, "5m": 100, "15m": 80, "30m": 60,
    "1h": 60, "4h": 40, "1d": 60,
}
```

## 常见问题

### Q1: 图表上下没有预留空间？
A: mplfinance 自动调整 y 轴范围，会预留约 5% 空间。如果形态标记被裁剪，可以调整 `figsize` 或 marker 位置偏移量。

### Q2: 支撑/阻力没有区分类型？
A: 图表上用颜色区分（绿=支撑，红=阻力），具体类型（swing_high/bo_origin/gap 等）在 Agent 的 `sr_info["levels"]` 中可见。

### Q3: 成交量有用吗？
A: 有用但不是主要依据。Al Brooks 主要看价格行为，成交量用于确认 Climax 和 BO 强度。

### Q4: 为什么不显示所有形态？
A: 避免图表过于拥挤。Inside bars 太频繁，只在 Agent 数据中可见。H/L 入场只显示最近 2 个。

### Q5: Agent 如何知道这些信息？
A: Agent 通过调用 `analyze_ab_sr()` / `analyze_ab_mm()` / `analyze_ab_patterns()` 获取完整数据，图表只是可视化的一部分。

## 视觉设计原则

1. **Al Brooks 暗色主题**：深色背景 (#1a1a2e)，减少眼睛疲劳
2. **颜色语义化**：绿=多/支撑，红=空/阻力，蓝=EMA，橙=事件
3. **半透明叠加**：避免遮挡 K 线主体
4. **限制元素数量**：S/R ≤8 条，MM ≤2 条，形态 ≤5 个
5. **智能过滤**：只显示可见范围内的关键信息

## 更新日志

- **2026-03-03**：集成 ab_sr, ab_mm, ab_patterns 三模块
- **2026-03-03**：品种改为 3 个（BTC/ETH/BNB），周期改为 5m/15m/1h
- **2026-03-03**：标题增加第二行（S/R + MM + 形态摘要）

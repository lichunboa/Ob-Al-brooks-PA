# Al Brooks 回测系统 V2.0

> 100% 遵循 Al Brooks 交易哲学，不做任何"优化"

## 核心原则

1. **止损在结构位外侧**
   - Bull: 止损在最近 major higher low 下方
   - Bear: 止损在最近 major lower high 上方
   - TR: 止损在 TR 边界外侧

2. **P×R > (1-P)**
   - 不是固定门槛，而是动态评估
   - P 根据市场状态估算（0.4-0.6）
   - R 根据 MM 和 S/R 计算

3. **不考虑人性化规则**
   - 没有"连亏停止"
   - 没有"冷静期"
   - 没有"情绪管理"
   - Al Brooks 本人也没有这些

## 项目结构

```
backtest_v2/
├── __init__.py
├── models.py                    # 数据模型
├── engine.py                    # 主引擎
│
├── indicators/                  # 纯计算层
│   ├── ema.py                  # EMA20
│   ├── structure.py            # Swing High/Low
│   └── market_state.py         # 市场状态检测
│
├── core/                        # 核心评估器
│   ├── stop_calculator.py      # 止损计算（结构位）
│   └── trader_equation.py      # P×R 评估
│
├── strategies/                  # 策略实现
│   └── h2_l2.py                # H2/L2 策略
│
└── test_backtest.py            # 测试脚本
```

## 已实现功能

### 1. 指标计算
- ✅ EMA20 计算
- ✅ Swing High/Low 识别（major vs minor）
- ✅ 市场状态检测（BO/TC/BC/TR/Climax）
- ✅ AI 方向判断（AIL/AIS/NEUTRAL）

### 2. 核心评估
- ✅ 止损计算（结构位外侧）
- ✅ Trader's Equation（P×R > 1-P）
- ✅ 概率估算（根据市场状态）

### 3. 策略
- ✅ H2/L2（第二次回调）
- ⏳ H1/L1（第一次回调）
- ⏳ 双顶/双底
- ⏳ 楔形
- ⏳ 看衰突破
- ⏳ 第二腿陷阱
- ⏳ BLSHS（TR边缘）

### 4. 持仓管理
- ⏳ Premise Check（6项）
- ⏳ Strength Check（7项）
- ⏳ 动态 SL/TP 调整

## 快速开始

### 1. 测试系统（使用示例数据）

```bash
cd "AB Patrol-Agent"
python backtest_v2/test_backtest.py
```

### 2. 使用真实数据

```python
from backtest_v2.engine import BrooksBacktestEngine
from backtest_v2.strategies.h2_l2 import H2L2Strategy

# 加载K线数据（从数据库或CSV）
candles = load_candles_from_db("BTCUSDT", "5m", "2024-01-01", "2024-12-31")

# 创建引擎
engine = BrooksBacktestEngine()

# 添加策略
engine.add_strategy(H2L2Strategy())

# 运行回测
result = engine.run(
    candles=candles,
    symbol="BTCUSDT",
    timeframe="5m"
)
```

## 与旧系统的差异

| 维度 | 旧系统 | 新系统（V2.0） |
|------|--------|---------------|
| **止损** | 固定 ATR 倍数 | 结构位外侧（major HL/LH） |
| **H2/L2** | 第二次触及 EMA | 反转失败后的第二次机会 |
| **P 估算** | 固定 0.4 | 根据市场状态动态（0.3-0.6） |
| **R 计算** | 固定 2.0 | 根据 MM 和 S/R 动态 |
| **持仓管理** | 固定 TP/SL | Premise + Strength Check |
| **信号过滤** | 后置路由 | 前置生成（只生成该状态允许的） |

## 关于目标

你设定的目标是：
- 胜率 ≥ 85%
- 日均交易 ≥ 50
- 盈利因子 ≥ 1.5

**但 Al Brooks 说：**
> "The best setups have only 60% probability."
> "Both bulls and bears can lose more than 50% of time and still make money."

**合理的目标应该是：**
- 胜率：55-65%（Brooks 标准）
- 日均交易：30-50（3 品种 × 3 周期）
- 盈利因子：1.5-2.5（P×R 保证）

85% 胜率意味着你只做"几乎确定但盈亏比极差"的交易，这不是 Brooks 的方法。

## 下一步

1. **完成剩余策略**
   - H1/L1, 双顶底, 楔形, 看衰突破, 第二腿陷阱, BLSHS

2. **实现持仓管理**
   - Premise Check（6项检查）
   - Strength Check（7项增强信号）
   - 动态 SL/TP 调整

3. **连接真实数据**
   - 从 TimescaleDB 加载历史K线
   - 支持多品种、多周期

4. **运行完整回测**
   - 4 品种 × 3 周期
   - 生成详细报告

5. **删除旧系统**
   - 删除 `services/signal-service/src/rules/momentum`
   - 删除 `services/signal-service/src/rules/volume`
   - 删除 `services/signal-service/src/engines/wyckoff_detector.py`
   - 删除 `services/signal-service/src/engines/pg_engine.py`

## 参考文档

- [设计文档](../docs/BROOKS_BACKTEST_REDESIGN.md)
- [Al Brooks 知识库](../knowledge/patrol-l1/)
- [S2-方向判断](../knowledge/patrol-l1/references/S2-direction.md)
- [S3-市场状态](../knowledge/patrol-l1/references/S3-market-state.md)
- [S5-交易评估](../knowledge/patrol-l1/references/S5-evaluation.md)
- [S6-通道入场](../knowledge/patrol-l1/references/S6-channel.md)
- [S7-持仓管理](../knowledge/patrol-l1/references/S7-management.md)

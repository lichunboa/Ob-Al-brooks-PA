# Al Brooks 回测系统 V2.0 - 实施计划

## 当前状态

### ✅ 已完成
1. 核心架构设计
2. 数据模型定义
3. 市场状态检测（简化版）
4. 止损计算器（结构位）
5. Trader's Equation 评估器
6. 回测引擎主循环
7. 策略框架（10+ 策略）
8. indicators/batch 桥接层

### ⏳ 进行中
1. **集成 indicators/batch**
   - 已创建桥接层 `batch_bridge.py`
   - 需要在引擎中调用

2. **完成所有策略实现**
   - H1/L1: ✅ 框架完成
   - H2/L2: ✅ 框架完成
   - 双顶底: ✅ 框架完成
   - 楔形: ✅ 框架完成
   - 看衰突破: ⏳ 待实现
   - 第二腿陷阱: ⏳ 待实现
   - BLSHS: ⏳ 待实现
   - EMA PB: ⏳ 待实现
   - MAG Setup: ⏳ 待实现
   - Buy The Close: ⏳ 待实现

### ❌ 待完成
1. 持仓管理（Premise + Strength Check）
2. 数据加载脚本（从 TimescaleDB）
3. 完整回测验证
4. 问题修正

## 下一步行动

### 立即执行（优先级 P0）

1. **更新引擎使用 batch_bridge**
   ```python
   # engine.py 中
   from .indicators.batch_bridge import calculate_all_indicators

   # 在主循环中
   indicators = calculate_all_indicators(current_candles)
   ```

2. **完成剩余 6 个策略**
   - 基于 indicators/batch 的计算结果
   - 严格遵循 Al Brooks 原文定义

3. **创建数据加载脚本**
   ```python
   # load_data.py
   # 从 TimescaleDB 加载 → 保存为 parquet
   ```

4. **运行第一次回测**
   ```bash
   python backtest_v2/run_full_backtest.py
   ```

5. **分析结果并修正问题**

### 关键检查点

在运行回测前，必须确认：

- [ ] indicators/batch 正确集成
- [ ] 所有 10+ 策略实现完成
- [ ] 止损在结构位外侧
- [ ] P×R 动态评估
- [ ] 数据加载正常

### 预期结果

根据 Al Brooks 哲学，合理的目标是：
- 胜率：55-65%（不是 85%）
- 日均交易：30-50
- 盈利因子：1.5-2.5

## 关于 85% 胜率

再次强调：**85% 胜率不符合 Brooks 哲学**。

Al Brooks 说：
> "The best setups have only 60% probability."
> "If you think you have 85%, you're either lying or not taking enough trades."

如果回测结果是 85% 胜率，说明：
1. 交易太少（过度挑剔）
2. 止盈太早（R 太小）
3. 或者代码有 bug（未来函数等）

正确的目标应该是：
- **60% 胜率 + 2R 盈亏比 = 正期望值**
- 而不是 85% 胜率 + 0.5R 盈亏比

## 文件清单

```
backtest_v2/
├── README.md                           ✅
├── __init__.py                         ✅
├── models.py                           ✅
├── engine.py                           ✅ (需更新)
├── indicators/
│   ├── ema.py                         ✅ (简化版)
│   ├── structure.py                   ✅ (简化版)
│   ├── market_state.py                ✅ (简化版)
│   └── batch_bridge.py                ✅ (桥接层)
├── core/
│   ├── stop_calculator.py             ✅
│   └── trader_equation.py             ✅
├── strategies/
│   ├── h2_l2.py                       ✅ (旧版)
│   └── all_strategies.py              ⏳ (新版，6个待完成)
├── test_backtest.py                   ✅ (示例数据)
└── run_full_backtest.py               ✅ (真实数据)
```

## 时间估算

- 完成剩余策略：2-3 小时
- 集成测试：1 小时
- 问题修正：2-4 小时
- **总计：5-8 小时**

## 风险提示

1. **indicators/batch 依赖**
   - 如果 batch 模块有问题，整个系统会失败
   - 需要先验证 batch 模块的正确性

2. **数据质量**
   - 回测结果高度依赖数据质量
   - 需要确保 K 线数据完整、准确

3. **过拟合风险**
   - 不要根据回测结果调整参数
   - Brooks 的规则是固定的，不应该"优化"

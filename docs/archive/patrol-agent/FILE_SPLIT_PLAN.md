# 大文件拆分计划

## 需要拆分的文件

### 1. pa_runtime.py (6162 行) - 最高优先级

**已完成**:
- ✅ 创建 `utils/file_ops.py` - 文件操作
- ✅ 创建 `utils/parsing.py` - 解析工具

**待完成**:
- [ ] `utils/formatting.py` - 格式化工具（~200 行）
  - `compact_json()`, `truncate_text()`, `format_ai_direction_text()`
  - `format_pre_signal_text()`, `format_gate_message()`, `format_trigger_prices_text()`

- [ ] `utils/signal_helpers.py` - 信号辅助（~100 行）
  - `event_has_prefix()`, `signal_event_ranks()`, `has_second_entry_signal()`
  - `classify_primary_s6_reference()`

- [ ] `utils/trade_semantics.py` - 交易语义（~300 行）
  - `infer_trade_style_from_refs()`, `infer_order_type_from_refs()`
  - `structured_trade_semantics()`, `derive_trade_execution_semantics()`

- [ ] `utils/bar_analysis.py` - K线分析（~150 行）
  - `bar_range()`, `compact_bar_record()`, `recent_continuation_momentum()`
  - `recent_bar_stats()`, `compact_stats_for_prompt()`

- [ ] `runtime/config.py` - 配置管理（~80 行）
  - 提取 `Config` 类

**预期效果**: 从 6162 行减少到 ~5000 行

---

### 2. backtest_tool.py (3303 行) - 中优先级

**建议拆分**:
- [ ] `libs/backtest/models.py` - 数据模型
  - `Candle`, `PASignal`, `BackgroundContext`, `MarketState`, `Trade`

- [ ] `libs/backtest/indicators.py` - 技术指标
  - `calculate_ema()`, `ema_slope()`, `calculate_atr()`
  - `CandlePatterns` 类

- [ ] `libs/backtest/cycle_identifier.py` - 周期识别
  - `CycleIdentifier` 类（362 行）

- [ ] `libs/backtest/scoring.py` - 评分引擎
  - `ScoringEngine` 类（262 行）

- [ ] `libs/backtest/simulator.py` - 交易模拟
  - `TradeSimulator` 类（336 行）

- [ ] `libs/backtest/engine.py` - 回测引擎
  - `BacktestEngine` 类（350 行）
  - `main()` 函数

**预期效果**: 从 3303 行拆分为 6-7 个模块，每个 300-500 行

---

### 3. executor.py (1614 行) - 中优先级

**建议拆分**:
- [ ] `services/execution-service/src/bot_registry.py` - Bot 注册管理
  - `_load_order_bot_map()`, `_save_order_bot_map()`
  - `_load_position_bot_map()`, `_save_position_bot_map()`
  - `register_position()`, `unregister_position()`
  - `get_position_bot_id()`, `_register_order()`

- [ ] `services/execution-service/src/kline_analyzer.py` - K线分析
  - `_calc_ema()`, `_calc_atr()`
  - `_describe_bar()`, `_generate_kline_summary()`
  - `fetch_klines()`, `fetch_multi_tf_klines()`

- [ ] `services/execution-service/src/executor.py` - 核心执行器（保留）
  - 订单执行、持仓管理、风控

**预期效果**: 从 1614 行减少到 ~800 行

---

### 4. __main__.py (1337 行) - 低优先级

**建议拆分**:
- [ ] `services/execution-service/src/routes/` - API 路由
  - `routes/orders.py` - 订单相关 API
  - `routes/positions.py` - 持仓相关 API
  - `routes/klines.py` - K线相关 API
  - `routes/trading.py` - 交易状态 API

- [ ] `services/execution-service/src/__main__.py` - 主入口（保留）
  - FastAPI 应用初始化
  - 路由注册

**预期效果**: 从 1337 行减少到 ~300 行

---

### 5. sim_server.py (1026 行) - 低优先级

**建议**: 暂不拆分，1026 行可接受

---

## 实施顺序

1. **第一阶段**: 完成 `pa_runtime.py` 的工具函数提取（已开始）
2. **第二阶段**: 拆分 `backtest_tool.py`（影响范围小）
3. **第三阶段**: 拆分 `executor.py`（需要仔细测试）
4. **第四阶段**: 拆分 `__main__.py`（需要重构 API 路由）

---

**日期**: 2026-03-10
**状态**: 第一阶段进行中

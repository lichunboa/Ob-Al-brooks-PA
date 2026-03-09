# pa_runtime.py 拆分计划

## 当前状态
- 文件：`runtime/pa_runtime.py`
- 行数：6148 行
- 主要类：`Config`, `PatrolRuntime`

## 拆分目标

### 1. 工具函数模块 (utils.py)
**行数**：约 400 行
**内容**：
- 时间处理：`utc_now`, `utc_iso`, `parse_dt`
- 文件操作：`load_json`, `write_json`, `append_jsonl`
- 数据转换：`safe_float`, `compact_json`, `truncate_text`
- 格式化：`format_ai_direction_text`, `format_pre_signal_text`

### 2. 信号分析模块 (signal_analyzer.py)
**行数**：约 800 行
**内容**：
- 信号分类：`classify_primary_s6_reference`
- 风格推断：`infer_trade_style_from_refs`
- 订单类型：`infer_order_type_from_refs`
- 信号事件：`signal_event_ranks`, `has_second_entry_signal`
- K线分析：`bar_range`, `compact_bar_record`, `recent_bar_stats`

### 3. 执行语义模块 (execution_semantics.py)
**行数**：约 600 行
**内容**：
- 交易语义：`structured_trade_semantics`
- 执行语义：`derive_trade_execution_semantics`
- 执行构建：`build_execution_semantics`
- 状态转换：`candidate_stage_cn`, `execution_mode_cn`

### 4. 持仓管理模块 (position_manager.py)
**行数**：约 800 行
**内容**：
- ✅ 已创建框架
- Premise Check（6 项检查）
- Strength Check（7 项增强信号）
- Trailing SL
- 分批止盈

### 5. 市场扫描模块 (market_scanner.py)
**行数**：约 600 行
**内容**：
- 多周期扫描
- K线数据获取
- 技术指标计算
- 市场状态判断

### 6. 订单执行模块 (execution_handler.py)
**行数**：约 500 行
**内容**：
- 订单下单
- 订单修改
- 持仓查询
- 风险计算

### 7. 主运行时 (pa_runtime.py)
**行数**：约 2500 行
**内容**：
- `Config` 类
- `PatrolRuntime` 类（主循环）
- 决策协调
- 状态管理

## 拆分顺序

1. ✅ 创建 `position_manager.py`（已完成）
2. 创建 `utils.py`（工具函数）
3. 创建 `signal_analyzer.py`（信号分析）
4. 创建 `execution_semantics.py`（执行语义）
5. 创建 `market_scanner.py`（市场扫描）
6. 创建 `execution_handler.py`（订单执行）
7. 重构 `pa_runtime.py`（导入新模块）
8. 测试所有模块

## 依赖关系

```
pa_runtime.py (主循环)
    ↓
├── utils.py (工具函数)
├── signal_analyzer.py (信号分析)
│   └── utils.py
├── execution_semantics.py (执行语义)
│   └── utils.py
├── market_scanner.py (市场扫描)
│   └── utils.py
├── execution_handler.py (订单执行)
│   └── utils.py
├── position_manager.py (持仓管理)
│   └── utils.py
├── rule_engine.py (规则引擎) ✅
└── aggressive_mode.py (激进模式) ✅
```

## 测试计划

1. 单元测试：每个模块独立测试
2. 集成测试：模块间交互测试
3. 回归测试：确保功能不变
4. 性能测试：确保速度不降低

## 预期效果

- 代码更清晰，易于维护
- 模块职责单一
- 更易于测试
- 团队协作更容易
- 新功能更容易添加

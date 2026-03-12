# pa_runtime.py 拆分计划

## 当前状态
- **总行数**: 6162 行
- **工具函数**: 60-994 行（约 935 行）
- **Config 类**: 995-1072 行（约 78 行）
- **PatrolRuntime 类**: 1073-6162 行（约 5089 行，90+ 方法）

## 拆分方案

### 1. 工具函数模块（已部分完成）
**目标**: `runtime/utils/` 目录

已完成：
- ✅ `file_ops.py` - 文件操作（5 个函数）
- ✅ `parsing.py` - 解析工具（6 个函数）
- ✅ `formatting.py` - 格式化工具（10 个函数）

待提取：
- `brooks_analysis.py` - Al Brooks 分析相关
  - `classify_primary_s6_reference()`
  - `infer_trade_style_from_refs()`
  - `infer_order_type_from_refs()`
  - `structured_trade_semantics()`
  - `derive_trade_execution_semantics()`
  - `build_execution_semantics()`

- `bar_analysis.py` - K线分析
  - `bar_range()`
  - `compact_bar_record()`
  - `recent_continuation_momentum()`
  - `recent_bar_stats()`
  - `compact_stats_for_prompt()`

- `event_analysis.py` - 事件分析
  - `event_has_prefix()`
  - `event_has_exact()`
  - `signal_event_ranks()`
  - `has_second_entry_signal()`
  - `has_first_entry_signal()`

### 2. Config 类
**目标**: `runtime/config.py`
- 简单的配置类，直接移动

### 3. PatrolRuntime 类拆分

#### 3.1 Chart 管理模块
**目标**: `runtime/chart_manager.py`

方法：
- `chart_python()`
- `tool_python()`
- `chart_roots()`
- `latest_chart_paths()`
- `chart_relative_path()`
- `chart_absolute_path()`
- `build_chart_context()`
- `build_ab_context()`
- `prompt_ab_context()`
- `prefetch_pre_signal_charts()`

#### 3.2 Brooks 过滤器模块
**目标**: `runtime/brooks_filter.py`

方法：
- `flatten_events()`
- `current_market_state()`
- `classify_brooks_filter()`
- `apply_brooks_filter_to_patch()`
- `apply_brooks_filter_to_action()`
- `route_s6_references()`

#### 3.3 引用选择模块
**目标**: `runtime/reference_selector.py`

方法：
- `symbol_reference_hints()`
- `select_canonical_references()`
- `merge_reference_sets()`
- `select_quote_references()`
- `select_prompt_references()`

#### 3.4 HTTP 通信模块
**目标**: `runtime/http_client.py`

方法：
- `http_get_json()`
- `http_post_json()`
- `http_delete_json()`
- `http_post_telegram()`
- `backend_bot_token()`

#### 3.5 Telegram 推送模块
**目标**: `runtime/telegram_pusher.py`

方法：
- `telegram_api_send_photo()`
- `openclaw_message_send()`
- `openclaw_photo_send()`
- `push_telegram_update()`
- `push_telegram_photo()`
- `render_push_card()`
- `render_pre_signal_push()`
- `render_housekeeping_card()`
- `should_push_cycle_card()`

#### 3.6 市场数据模块
**目标**: `runtime/market_data.py`

方法：
- `fetch_symbol_market()`
- `execution_snapshot()`
- `normalize_market_cache()`
- `update_market_cache()`
- `detect_new_pre_signals()`
- `monitoring_snapshot()`

#### 3.7 Prompt 构建模块
**目标**: `runtime/prompt_builder.py`

方法：
- `read_skill_text()`
- `read_reference_text()`
- `parse_full_skill_sections()`
- `select_skill_section_titles()`
- `build_skill_text()`
- `load_knowledge_bundle()`
- `prepare_prompt_context()`
- `build_prompt_from_context()`
- `build_prompt()`
- `build_scalp_fast_prompt()`
- `_symbol_prompt_context()`
- `_recent_trade_context()`
- `execution_prompt_snapshot()`

#### 3.8 决策处理模块
**目标**: `runtime/decision_handler.py`

方法：
- `invoke_decision_provider()`
- `repair_decision_json()`
- `extract_decision()`
- `validate_decision()`
- `rule_engine_decision()`
- `timeout_fallback_decision()`
- `primary_chart_for_decision()`

#### 3.9 交易执行模块
**目标**: `runtime/trade_executor.py`

方法：
- `action_risk_percent()`
- `format_ai_direction()`
- `ai_direction_is_gate_ready()`
- `build_action_ai_direction()`
- `build_action_bar_reading()`
- `equation_is_gate_ready()`
- `build_trade_equation()`
- `ensure_gate_ready_equation()`
- `hydrate_open_order_action()`
- `validate_trade_gate()`
- `execute_action()`

#### 3.10 状态管理模块
**目标**: `runtime/state_manager.py`

方法：
- `load_runtime_state()`
- `load_market_cache()`
- `latest_cycle()`
- `record_runtime_failure()`
- `latest_execution_log()`
- `write_runtime_state()`
- `build_pre_signal_meta()`

#### 3.11 扫描调度模块
**目标**: `runtime/scan_scheduler.py`

方法：
- `poll_trigger()`
- `ack_trigger()`
- `select_phase_plan()`
- `event_score()`
- `ranked_eventful_symbols()`
- `daily_bias_stale()`
- `scalp_fast_candidates()`
- `normalize_next_scan_plan()`
- `normalize_next_scan_seconds()`

#### 3.12 主循环（保留在 pa_runtime.py）
**保留**: `runtime/pa_runtime.py`

方法：
- `__init__()`
- `execution_port()`
- `run_cycle()` - 主循环逻辑
- `run_once()`
- `wait_for_next()`
- `loop()`
- `status()`

## 拆分顺序

### 阶段 1: 提取工具函数（优先级：高）
1. 提取 Brooks 分析工具 → `utils/brooks_analysis.py`
2. 提取 K线分析工具 → `utils/bar_analysis.py`
3. 提取事件分析工具 → `utils/event_analysis.py`
4. 提取 Config 类 → `config.py`

### 阶段 2: 提取独立模块（优先级：高）
5. HTTP 通信 → `http_client.py`
6. Telegram 推送 → `telegram_pusher.py`
7. Chart 管理 → `chart_manager.py`

### 阶段 3: 提取核心逻辑模块（优先级：中）
8. 状态管理 → `state_manager.py`
9. 市场数据 → `market_data.py`
10. 扫描调度 → `scan_scheduler.py`

### 阶段 4: 提取决策和执行模块（优先级：中）
11. Prompt 构建 → `prompt_builder.py`
12. 决策处理 → `decision_handler.py`
13. 交易执行 → `trade_executor.py`

### 阶段 5: 提取过滤器模块（优先级：低）
14. Brooks 过滤器 → `brooks_filter.py`
15. 引用选择 → `reference_selector.py`

### 阶段 6: 重构主类（优先级：低）
16. 重构 `PatrolRuntime` 为组合模式
17. 更新所有导入引用
18. 测试完整性

## 预期结果

```
runtime/
├── __init__.py
├── pa_runtime.py          # 主类（约 500 行）
├── config.py              # 配置类（约 80 行）
├── chart_manager.py       # Chart 管理（约 300 行）
├── brooks_filter.py       # Brooks 过滤器（约 400 行）
├── reference_selector.py  # 引用选择（约 200 行）
├── http_client.py         # HTTP 通信（约 150 行）
├── telegram_pusher.py     # Telegram 推送（约 500 行）
├── market_data.py         # 市场数据（约 300 行）
├── prompt_builder.py      # Prompt 构建（约 600 行）
├── decision_handler.py    # 决策处理（约 400 行）
├── trade_executor.py      # 交易执行（约 400 行）
├── state_manager.py       # 状态管理（约 200 行）
├── scan_scheduler.py      # 扫描调度（约 400 行）
└── utils/
    ├── __init__.py
    ├── file_ops.py        # ✅ 已完成
    ├── parsing.py         # ✅ 已完成
    ├── formatting.py      # ✅ 已完成
    ├── brooks_analysis.py # 待提取
    ├── bar_analysis.py    # 待提取
    └── event_analysis.py  # 待提取
```

## 注意事项

1. **依赖关系**: 先提取无依赖的工具函数和独立模块
2. **测试**: 每次拆分后运行 PA 系统确保功能正常
3. **导入**: 使用相对导入，保持模块间的清晰依赖
4. **向后兼容**: 在 `pa_runtime.py` 中保留导入，确保外部调用不受影响

## 时间估算

- 阶段 1: 2-3 小时
- 阶段 2: 2-3 小时
- 阶段 3: 3-4 小时
- 阶段 4: 4-5 小时
- 阶段 5: 2-3 小时
- 阶段 6: 2-3 小时

**总计**: 15-21 小时

---

**创建日期**: 2026-03-10
**状态**: 计划中

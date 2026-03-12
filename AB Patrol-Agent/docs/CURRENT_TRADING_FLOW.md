# 当前交易流程与策略覆盖

> 更新于 2026-03-12

本文档只描述当前仓库里真实连通的两条交易链，不记录已经删除的旧链路。

## 一、当前存在的 2 条主链与 1 组入口脚本

### 1. live 检测链

权威入口：

- `services/signal-service/src/engines/pa_engine.py`
- `services/signal-service/src/engines/pa/strategy_advanced.py`

当前真实可生成的 `signal_type` 至少有 23 个：

- `收线追进`
- `高1`
- `低1`
- `高2`
- `低2`
- `第二腿陷阱`
- `看衰突破`
- `双重顶`
- `双重底`
- `楔形顶`
- `楔形底`
- `急速通道`
- `HOY突破`
- `LOY突破`
- `末端旗形`
- `突破回调`
- `第一均线缺口`
- `头肩顶MTR`
- `头肩底MTR`
- `ii突破`
- `ioi突破`
- `iii突破`
- `急赴磁体`

说明：

- 其中 `ii突破 / ioi突破 / iii突破` 来自 `detect_ii_breakout()` 的动态模式名。
- `急赴磁体` 仍然有 detector 逻辑，但当前主生成流程已明确把它降为上下文证据，不再视为稳定的独立下单 setup。

### 2. 回测过滤层

权威入口：

- `libs/backtest/strategy_filters.py`

当前登记的 `ALL_KNOWN_STRATEGIES` 有 24 个：

- `收线追进`
- `高1`
- `低1`
- `高2`
- `低2`
- `看衰突破`
- `第二腿陷阱`
- `双重顶`
- `双重底`
- `楔形顶`
- `楔形底`
- `急速通道`
- `末端旗形`
- `20均线缺口`
- `MAG 20/20 Setup`
- `第一均线缺口`
- `突破回调`
- `ii突破`
- `ioi突破`
- `iii突破`
- `头肩顶MTR`
- `头肩底MTR`
- `HOY突破`
- `LOY突破`

当前策略配置档只有 2 个：

- `brooks_pullback_core`
- `brooks_mtr_focus`

### 3. 回测 Brooks playbook 路由

权威入口：

- `libs/backtest/runner.py`

当前可路由到的 `playbook_id` 有 15 个：

- `R0_FIRST_REVERSAL_PROBE`
- `R1_BROAD_CHANNEL_REVERSAL`
- `R2_TR_EDGE_REVERSAL`
- `T1_FIRST_PULLBACK`
- `T2_BROAD_CHANNEL_RECOVERY`
- `T2_TREND_H2`
- `T3_BROAD_CHANNEL_EMA`
- `T3_TREND_EMA`
- `T5_BREAKOUT_CHASE`
- `T6_TR_LEG_CHANNEL_RECOVERY`
- `T6_TR_LEG_EMA_RECOVERY`
- `T6_TR_LEG_FIRST_PULLBACK`
- `TR1_BLSHS`
- `TR2_FAILED_BO_FADE`
- `TR3_SECOND_LEG_TRAP`

## 二、当前真实连通的交易流程

### 1. live 主链

`knowledge/`

-> `services/signal-service/src/engines/pa_engine.py`

-> 生成 `PASignal`

-> `services/signal-service/src/engines/pa/risk.py`

-> entry gate / 风控分类 / playbook 标记

-> execution-service / API / Web 可见性链

-> `trading/position_management/`

-> Premise / Strength / 分批止盈 / 移动止损

### 2. 权威回测主链

`knowledge/`

-> `services/signal-service/src/engines/pa_engine.py`

-> `libs/backtest/runner.BacktestRunner`

-> `libs/backtest/strategy_filters.py`

-> playbook 路由 + 管理模板 + `trading/position_management/`

-> 回测报告 / API 输出

### 3. 回测入口脚本

`tools/backtest/run_backtest.py`

`tools/backtest/run_backtest_v2.py`

`tools/backtest/run_multi_symbol_backtest.py`

`tools/backtest/backtest_v4.py`

-> `libs.backtest.runner.BacktestRunner`

这四条脚本现在都只是权威回测链的入口包装，不再是独立策略链。

补充：

- `backtest_v4.py` 现在只是场景包装层，不再维护旧的逐 bar 自建回测逻辑。
- 场景入口已经支持 `--parquet` / `--cache-dir`，本地可以直接复用缓存数据做冒烟。
- 因此当前系统真实只有两条主链：`live 主链` 和 `权威回测主链`。

## 三、当前最明确的 4 个断点

### 1. `iii突破` 已纳入过滤与路由，但还缺专属策略经验沉淀

`strategy_advanced.py` 会动态生成 `iii突破`。

当前这些关键链路已经补齐：

- `libs/backtest/strategy_filters.py`
- `services/signal-service/src/engines/pa/risk.py`
- `libs/backtest/runner.py`
- `services/api-service/src/routers/backtest.py`

结果：

- `iii突破` 现在会进入和 `ii/ioi突破` 同一条突破追随链。
- 但它仍然没有单独的 profile 经验、统计基线和策略说明，当前只是先按 breakout chase 统一处理。

### 2. `LOY突破` 已登记进过滤层，但 profile 还没专门使用

当前状态是：

- `pa_engine.py` 能生成 `LOY突破`
- `pa/risk.py` 认 `LOY突破`
- `libs/backtest/runner.py` 认 `LOY突破`
- `libs/backtest/strategy_filters.py` 现在也已登记 `LOY突破`

结果：

- 白名单 / 黑名单现在可以显式控制 `LOY突破`。
- 但默认 profile 还没有把它单独纳入策略偏好，只是作为 breakout chase 家族成员存在。

### 3. `急赴磁体` 仍被统计，但已经不是独立可执行 setup

`pa_engine.py` 已明确写明：

- `急赴磁体` 只保留为 target / magnet 证据来源
- 不再直接生成订单信号

结果：

- 它属于上下文标签，不应再被当成“可执行策略数”直接计入交易策略口径。
- 如果报告、报表、策略面板还把它和其它 setup 并列，就会造成“检测到了但不能交易”的认知混乱。

### 4. 过滤层与 live 层的策略名集合还没完全对齐

当前集合差异是：

- live 有但过滤层没有：
  - `急赴磁体`
- 过滤层有但 live 没有：
  - `20均线缺口`
  - `MAG 20/20 Setup`

结果：

- 策略过滤、回测 profile、策略统计口径还不是完全同一套语言。

## 四、当前最稳妥的理解口径

如果你问“现在到底有多少个策略能匹配到”，当前要分 2 个主口径看：

1. 按 live 检测候选算：
   - 至少 23 个 `signal_type`
   - 但其中 `急赴磁体` 已经不是独立可执行 setup
2. 按回测可路由的 Brooks playbook 算：
   - 15 个 `playbook_id`
如果问“当前真正比较完整、能作为主基准的策略链是哪条”，答案是：

- `signal-service/pa_engine`
- `libs/backtest/runner`
- `services/api-service/src/routers/backtest.py`

## 五、下一步建议

优先级从高到低：

1. 为 `iii突破` 和 `LOY突破` 建立独立的 profile 经验与统计口径，而不是只挂在 breakout chase 家族下面。
2. 决定 `急赴磁体` 是彻底从策略集合剔除，还是在报告层显式标成“上下文，不可执行”。
3. 清理 `20均线缺口` / `MAG 20/20 Setup` 这类旧命名，统一到当前 live 命名体系。
4. 继续按 [STRATEGY_COVERAGE_AUDIT.md](STRATEGY_COVERAGE_AUDIT.md) 补齐 `S4` 里尚未独立落地的 playbook。

## 六、本地冒烟验证

2026-03-12 已在本地完成以下验证：

- `uv run --no-project python tools/backtest/run_backtest.py ... --parquet data/backtest_cache/BTCUSDT_2025-12-11_2026-03-11.parquet`
  - 跑通，输出 25 个信号、7 笔交易。
- `uv run --no-project python tools/backtest/backtest_v4.py ... --parquet data/backtest_cache/BTCUSDT_2025-12-11_2026-03-11.parquet`
  - 跑通，结果已写入 `/tmp/backtest_v4_smoke.json`。
- `uv run --no-project python tools/diagnostics/system_test.py`
  - `5/5` 通过。

# 当前目录与功能结构

> 更新于 2026-03-11

本文描述当前仓库里哪些目录是真实运行结构，以及它们各自负责什么。

## 1. 顶层结构

```text
Al-brooks-PA/
├── AB Patrol-Agent/        当前后端、巡逻主脑、sidecar 服务、运行态
├── AB Patrol-Web/          当前独立 Web
├── AB Console-Obsidian/    Al Brooks 知识库、插件、笔记
├── docs/                   项目级文档与归档
├── 📁 启动工具/            Finder 启动脚本
├── 📁 开发文档/            历史开发资料，非默认运行目录
├── 春波的笔记/            个人工作区
└── 🦁 交易员控制台 (Trader Command)/ 个人工作区
```

## 2. AB Patrol-Agent

```text
AB Patrol-Agent/
├── config/                 本地环境配置
├── data/                   cycle、状态、日志、图表、缓存
├── docs/                   Patrol 专属文档
├── indicators/             指标与批处理工具
├── knowledge/              patrol-l1 canonical / references / SKILL
├── libs/                   共享库与回测公共模块
├── run/                    pid、服务日志、运行态文件
├── runtime/                巡逻主循环、规则引擎、LLM 触发、状态管理
├── scripts/                启停脚本与守护脚本
├── services/               execution/api/sync/vis/query/signal 等服务
└── tools/                  控制脚本、回测工具、交易网关、图表脚本
```

### 2.1 `runtime/`

`runtime/` 是 Patrol 主脑核心。

主要文件：

- `pa_runtime.py`
  - 主循环与交易编排
- `config.py`
  - 运行配置与 `.env` 解析
- `prompt_builder.py`
  - LLM 提示词组装
- `state_manager.py`
  - runtime_state / cycle / journal 读写
- `http_runtime.py`
  - 执行服务与外部 HTTP 访问
- `rule_engine.py`
  - 候选单规则识别
- `position_manager.py`
  - S7 持仓管理
- `llm_trigger_integration.py`
  - 是否调用 LLM 的统一入口
- `llm_trigger_manager.py`
  - 触发状态机
- `providers.py`
  - `openclaw` / `codex_cli` provider 适配
- `reference_selector.py`
  - 知识引用选择
- `scan_timing.py`
  - 下一次扫描节奏
- `notification_renderer.py`
  - 状态卡与通知文案
- `status_common.py`
  - Query Service / 控制脚本共享状态汇总
- `utils/`
  - 解析、格式化、事件分析、文件操作公共函数

### 2.2 `services/`

```text
services/
├── api-service/                    对外 REST API
├── consumption/query-service/      runtime 聚合与状态卡接口
├── execution-service/              仓位、下单、改单、对账、订单跟踪
├── signal-service/                 PA 信号引擎与规则引擎
├── sync-service/                   Telegram/前端同步桥
└── vis-service/                    图表与模板渲染
```

各服务职责：

- `api-service`
  - 为 Web 或外部调用提供只读查询接口
- `consumption/query-service`
  - 聚合 runtime/cycle/execution 快照
  - 提供 `/api/v1/runtime/full`
- `execution-service`
  - Patrol 当前真正的执行桥
  - 提供 `/order`、`/positions`、`/orders/open`、`/modify-sl` 等接口
- `signal-service`
  - 保留 PA 信号识别、规则、事件与缓存
- `sync-service`
  - 负责同步转发与对外桥接
- `vis-service`
  - 负责 VPVR、日内热力、微结构等图表接口

### 2.3 `tools/`

主要脚本：

- `pa_crypto_control.py`
  - 本地控制入口
- `patrol_trade.py`
  - 确定性交易 gate 规则定义（当前由 runtime 进程内直接调用）
- `backtest_tool.py`
  - 回测主工具
- `backtest_matrix.py`
  - 多品种 / 多周期 / 多行情分段回测矩阵入口
- `backtest_v4.py`
  - 回放/模拟执行工具
- `chart_gen.py`
  - 图表生成
- `patrol_ab_context.py`
  - 结构化 Al Brooks 上下文生成
- `sim_server.py`
  - 本地模拟执行服务

### 2.4 `libs/`

```text
libs/
├── backtest/               回测模型、指标、周期识别、模拟交易
├── common/                 通用库
└── database/               SQLite / 数据库相关文件
```

## 3. AB Patrol-Web

```text
AB Patrol-Web/
├── scripts/                Web 启动脚本
├── src/app/                Next.js App Router 页面与 API Route
├── src/components/         页面组件
├── src/contexts/           React Context
├── src/hooks/              数据订阅与轮询 Hook
├── src/lib/                API 客户端与公共工具
└── src/types/              TS 类型定义
```

### 3.1 `src/app/`

- `(dashboard)/pa-bot/`
  - 当前 Patrol 主看板
- `(dashboard)/execution/`
  - 执行侧面板
- `(dashboard)/scanner/`
  - 扫描视图
- `(dashboard)/backtest/`
  - 回测视图
- `api/pa-bot/runtime/route.ts`
  - Patrol Web 当前双 runtime 聚合接口
- `api/execution-accounts/route.ts`
  - 主 `cTrader` + 次 `Binance Demo` 账户聚合接口
- `api/market-scan/route.ts`
  - 多资产 + 加密扫描聚合接口
- `api/runtime/full/route.js`
  - 旧 landing 页面兼容接口，仍被 `src/app/page.js` 使用

### 3.2 `src/lib/`

- `executionApi.ts`
  - 对接 execution-service
- `syncApi.ts`
  - 对接 sync-service
- `config.ts`
  - Web 运行配置
- `ws.ts`
  - WebSocket 工具

## 4. 当前运行边界

截至 2026-03-11，当前真实运行边界是：

- `runtime`
  - 已经是双实例主循环
  - 主 runtime: `ctrader / multi_asset`
  - 次 runtime: `binance / crypto`
- `execution-service`
  - 主栈 `8092` 为 `cTrader demo`
  - 次栈 `8094` 为 `Binance demo`
- `Web`
  - 已经能同时展示两套执行账户、两组扫描市场、两套 runtime 状态
  - `/pa-bot` 通过 `data/pa_trader` 与 `data/pa_trader_crypto` 聚合双 runtime
  - `/execution` 与 `/scanner` 通过 `8092` + `8094` 聚合双账户

## 5. AB Console-Obsidian

```text
AB Console-Obsidian/
├── .obsidian/plugins/      Obsidian 插件
├── Daily/                  日报、交易记录
├── Notes 笔记/             常规笔记
├── Categories 分类/        分类笔记与课程整理
├── 策略仓库 (Strategy Repository)/  策略资料
├── Templates/              模板
├── Attachments/            附件与截图
└── 课程/                   课程资料
```

它的定位不是运行代码，而是：

- 知识权威源
- 复盘与交易记录
- Obsidian 插件运行环境

## 6. docs

```text
docs/
├── README.md               文档入口
├── CURRENT_TRADING_FLOW.md 当前交易流程
├── FOLDER_STRUCTURE.md     当前目录与功能结构
├── ROOT_LAYOUT.md          顶层边界
├── backend/README.md       Patrol 后端说明
├── web/README.md           Patrol Web 说明
└── archive/                历史文档归档
```

## 7. 当前哪些目录不是源码

这些目录会频繁变化，但不属于“要整理的业务源码”：

- `AB Patrol-Agent/data/`
- `AB Patrol-Agent/run/`
- `AB Patrol-Web/.next/`
- `AB Patrol-Web/node_modules/`
- 各服务自己的 `.venv/`
- `.ruff_cache/`

清理结构时，应优先整理源码目录和文档目录，不要把运行数据和源码混着处理。

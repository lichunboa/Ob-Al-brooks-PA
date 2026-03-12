# 后端分层结构

> 更新于 2026-03-12

## 一、当前推荐目录

```text
AB Patrol-Agent/
├── exchange/                     交易所接入层
│   └── adapters/                 Binance / OKX / cTrader 适配器
├── trading/                      交易决策域
│   ├── market/                   第 1 步：市场上下文分析
│   ├── position_management/      第 2 步：持仓生命周期管理
│   │   ├── evaluation/           前提 / 强度评估
│   │   ├── risk_controls/        止盈 / 止损动作
│   │   └── manager.py            持仓总控编排
│   ├── notifications/            通知渲染
│   └── utils/                    交易域通用工具
├── runtime/                      运行时编排层
│   ├── pa_runtime.py             巡逻主循环
│   ├── pa_trader.py              自动交易入口
│   └── path_layout.py            统一运行 / 报告路径布局
├── services/                     服务入口层
│   ├── execution-service/        交易执行服务
│   ├── signal-service/           信号服务
│   ├── api-service/              API 网关
│   ├── sync-service/             同步服务
│   └── vis-service/              可视化服务
├── tools/                        共享引导与分组工具目录
│   ├── backtest/                 回测、矩阵、审计
│   ├── ops/                      巡逻控制、交易接入、图表生成
│   └── diagnostics/              系统测试与问题排查
├── indicators/batch/             Brooks 指标核心（只读）
├── libs/                         共享库、数据库、历史回测框架
├── data/                         运行数据、缓存、日志、报告
│   ├── pa_trader/                Patrol 运行态
│   ├── history/                  统一历史行情目录
│   │   ├── cache/                回测 Parquet 缓存
│   │   ├── hf_downloads/         原始 CSV.gz 下载
│   │   └── hf_parquet/           可选本地 Parquet 分片
│   ├── run/                      PID、服务日志、launchd 包装
│   └── reports/backtest/         回测报告
└── docs/                         当前权威文档
```

## 二、职责边界

### 1. `exchange/`

- 只放交易所协议、鉴权、品种规格、下单适配。
- 不放交易决策、不放回测统计。

### 2. `trading/`

- 只放“如何分析市场 / 如何管仓 / 如何通知”。
- 目录顺序按交易流程组织：
  - `market/` 先给出市场上下文
  - `position_management/` 再处理持仓生命周期
- `position_management/` 内继续按生命周期拆层：
  - `evaluation/` 负责“这笔仓位还该不该拿”
  - `risk_controls/` 负责“该怎么减仓/移损”
  - `manager.py` 只负责编排，不堆规则细节
- 不直接发 HTTP、不直接读服务配置、不直接访问交易所。

### 3. `runtime/`

- 只做巡逻编排、状态持久化、通知、服务协调。
- 这里允许调用 `trading/` 和 `exchange/`，但不要把核心规则重新写回 `runtime/`。

### 4. `services/`

- 每个服务只保留服务入口、路由、配置、依赖装配。
- 领域逻辑优先复用 `trading/` / `exchange/` / `libs/`。
- live 信号检测统一落在 `services/signal-service/src/engines/`。

### 5. `libs/`

- `libs/backtest/` 是当前唯一权威回测链。
- 新策略的回测过滤、playbook 路由、回测执行，都统一落在这里。

### 6. `AB Patrol-Web`

- Web 端仍然独立在 `AB Patrol-Web/src/`。
- 后端不要再把展示逻辑塞回 `AB Patrol-Agent`。

### 7. `data/`

- 所有运行产物统一落在 `data/`，不再散落在项目根目录。
- 历史行情统一落在 `data/history/`，不再把原始 CSV 和窗口缓存散放在 `data/` 根层。
- `data/run/` 只放 PID、服务日志和 launchd 包装文件。
- `data/reports/` 只放回测、分析等生成型报告。

## 三、后续新增代码的放置规则

- 新交易所接入：放 `exchange/adapters/`
- 新市场状态/结构分析：放 `trading/market/`
- 新知识规则来源：先落 `knowledge/`
- 新 live 信号检测：放 `services/signal-service/src/engines/`
- 新回测过滤 / 路由 / runner 逻辑：放 `libs/backtest/`
- 新持仓评估规则：放 `trading/position_management/evaluation/`
- 新止盈 / 止损动作：放 `trading/position_management/risk_controls/`
- 新持仓流程编排：放 `trading/position_management/manager.py`
- 新服务接口：放对应 `services/*/src/`
- 新页面 / Web API：放 `AB Patrol-Web/src/`

## 四、当前唯一推荐主链

1. `knowledge/` 负责策略语义与原始规则来源
2. `services/signal-service/` 负责信号检测与 live 入场判断
3. `libs/backtest/` 负责权威回测过滤、路由与执行
4. `trading/position_management/` 负责持仓管理、止盈止损、Premise / Strength

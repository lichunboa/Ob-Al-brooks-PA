# Al Brooks PA 项目结构说明

> 最后更新：2026-03-12

当前 `AB Patrol-Agent` 根目录已经按“配置与构建 / 业务域 / 运行与产物 / 工具与文档”重新收口。

详细分层规则见：

- `BACKEND_STRUCTURE.md`

## 根目录分层

```text
AB Patrol-Agent/
├── pyproject.toml               Python 构建与依赖入口
├── uv.lock                      uv 锁文件
├── requirements*.txt            兼容型依赖清单
├── Makefile                     顶层便捷命令
├── README.md                    项目总入口
├── config/                      配置文件
├── exchange/                    交易所接入层
├── trading/                     交易决策域
├── runtime/                     巡逻运行时
├── services/                    服务入口
├── libs/                        共享库与数据库
├── indicators/                  Brooks 指标核心
├── knowledge/                   知识库
├── tools/                       共享引导与分组工具目录
├── scripts/                     启停与运维脚本
├── data/                        运行数据、缓存、报告、日志
├── docs/                        当前有效文档
└── tests/                       测试
```

## `data/` 内部分层

```text
data/
├── pa_trader/                   Patrol 主运行态
├── pa_trader_crypto/            Crypto 运行态
├── charts/                      图表产物
├── backtest_cache/              回测数据缓存
├── cache/                       通用缓存
├── run/                         PID、服务日志、launchd 包装
└── reports/
    └── backtest/                回测报告与摘要
```

## 允许留在根目录的内容

1. 构建入口与锁文件
2. 一级业务域目录
3. 顶层启动脚本与项目总 README
补充说明：

1. `services/*/src/core/` 如果存在，属于服务私有模块
2. 根目录不再保留额外兼容层目录

## 不应继续散落在根目录的内容

1. PID 文件
2. 服务日志
3. 回测 JSON 报告
4. 一次性结构说明文档

这些内容统一下沉到 `data/` 或 `docs/`。

## `tools/` 内部分层

```text
tools/
├── _bootstrap.py                跨子目录共享引导
├── backtest/                    权威回测入口、矩阵评估、审计
├── ops/                         巡逻控制、交易接入、图表生成、交易所配置
└── diagnostics/                 系统测试、恢复检查、数据质量、上下文诊断
```

## 新增内容的放置规则

1. 新业务代码只放到已有一级业务域目录，不再新增平行根目录。
2. 新日志、PID、运行封装文件只放 `data/run/`。
3. 新回测报告只放 `data/reports/`。
4. 新结构说明、运行说明、接入说明只放 `docs/`。
5. 新策略实现统一走 `knowledge/` -> `services/signal-service/` -> `libs/backtest/` -> `trading/position_management/`。

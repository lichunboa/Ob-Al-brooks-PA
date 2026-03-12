# trading 交易决策域

> 目标：按真实交易流程组织代码，而不是按“功能堆叠”组织代码。

## 目录顺序

```text
trading/
├── market/                          第 1 步：市场上下文分析
├── position_management/             第 2 步：持仓生命周期管理
│   ├── evaluation/                  持仓前提/强度评估
│   ├── risk_controls/               止盈/止损动作
│   └── manager.py                   总控编排
├── notifications/                   交易通知渲染
└── utils/                           交易域公共工具
```

## 放置规则

- 新的市场结构、状态、方向判断：放 `market/`
- live 信号检测与入场形态：统一放 `services/signal-service/src/engines/`
- 回测 playbook 路由与过滤：统一放 `libs/backtest/`
- 新的前提检查、持仓强度规则：放 `position_management/evaluation/`
- 新的分批止盈、止损保护、风控动作：放 `position_management/risk_controls/`
- `position_management/manager.py` 只保留编排，不再堆具体规则

## 当前边界

- `trading/` 不再承担轻量信号试验链。
- 新策略应以 `knowledge/` 为规则来源，在 `signal-service` 落信号，在 `libs/backtest/runner` 落回测路由，在 `position_management/` 落持仓管理。

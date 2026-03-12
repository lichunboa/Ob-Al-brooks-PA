# Al Brooks PA Trading System

> 基于 Al Brooks 价格行为（Price Action）的自动交易系统

## 📖 快速导航

- **[项目结构说明](docs/PROJECT_STRUCTURE.md)** - 根目录与模块分层说明
- **[后端分层结构](docs/BACKEND_STRUCTURE.md)** - 接交易所 / 交易 / 回测 / 服务入口分层
- **[数据目录说明](data/README.md)** - 运行产物与报告目录规则
- **[运行时流程](docs/RUNTIME_FLOW.md)** - 系统运行流程图
- **[Brooks 逻辑图](docs/BROOKS_LOGIC_MAP.md)** - Al Brooks 交易逻辑
- **[Brooks 规则审计](docs/BROOKS_RULE_AUDIT.md)** - 回测门控的教材规则与工程启发式拆分
- **[当前交易流程](docs/CURRENT_TRADING_FLOW.md)** - 当前 live / 权威回测主链与策略覆盖
- **[cTrader 设置](docs/CTRADER_SETUP.md)** - 交易所配置

## 🚀 快速开始

### 1. 运行回测

```bash
# 单品种回测（30天）
uv run --no-project python tools/backtest/run_backtest.py --symbol BTCUSDT --days 30

# 批量回测（多品种×多周期）
uv run --no-project python tools/backtest/backtest_matrix.py
```

### 2. 启动交易服务

```bash
# 1. 启动 execution-service（交易所接口）
cd services/execution-service
uv run python src/main.py  # 端口 8092

# 2. 启动 signal-service（信号生成）
cd services/signal-service
uv run python src/main.py  # 端口 8091

# 3. 启动 PA Trader（自动交易）
uv run python runtime/pa_trader.py
```

### 3. 查看回测报告

```bash
# 查看最新报告
ls -lt data/reports/backtest/ | head -5

# 查看报告内容
cat data/reports/backtest/xxx.json | jq .
```

## 📊 系统架构

```
交易所（cTrader）
    ↓
execution-service (8092) ← K线数据、订单执行
    ↓
signal-service (8091) ← 只保留 Brooks / PA 主信号链
    ↓
PA Trader (runtime/) ← 自动交易 + 持仓管理
    ↓
订单执行 → execution-service → 交易所
```

## 🎯 核心功能

### 1. Al Brooks 信号生成

基于 Al Brooks 价格行为理论的信号：

- **H1/H2/L1/L2** - 第一次/第二次回调
- **双顶/双底** - DT/DB 反转形态
- **楔形** - Wedge 反转
- **看衰突破** - Failed Breakout
- **第二腿陷阱** - 2nd Leg Trap
- **BLSHS** - TR 边缘 Scalp
- **EMA 回调** - EMA Pullback
- **MAG Setup** - 20/20 Setup
- **收线追进** - Buy The Close

### 2. 市场状态检测

- **BO** (Breakout) - 突破中
- **TC** (Tight Channel) - 紧密通道
- **BC** (Broad Channel) - 宽幅通道
- **TR** (Trading Range) - 交易区间
- **CLIMAX** - 高潮

### 3. 持仓管理

#### Premise Check（前提检查）
1. AI 方向是否反转
2. 市场状态是否改变
3. 信号 K 线是否被否定
4. FT 质量如何
5. TP 路径是否受阻
6. 风险指标是否正常

#### Strength Check（强度检查）
1. Gap 保持打开
2. 新 Major HL/LH 形成
3. EMA 反弹干净
4. Micro gap 未关闭
5. PB 浅且有序
6. 对手方形成楔形
7. 多 TF 同向

#### 分批止盈
- TP1: 1R（50% 仓位）
- TP2: 2R（30% 仓位）
- TP3: 3R+（20% 仓位，Trailing SL）

## 📁 核心模块

### 交易所接口
- `exchange/adapters/` - 交易所适配器（Binance / OKX / cTrader）
- `services/execution-service/` - 交易执行服务入口

### 交易模块
- `trading/market/` - 第 1 步：市场分析
- `trading/position_management/` - 第 2 步：持仓生命周期管理
  - `evaluation/` - 前提检查、强度评估
  - `risk_controls/` - 分批止盈、移动止损
  - `manager.py` - 持仓管理总控编排
- `runtime/` - PA Trader 运行时编排
- `services/signal-service/` - live 信号检测与入场判断
- `indicators/batch/` - Al Brooks 指标计算

### 回测模块
- `libs/backtest/` - 权威回测 runner、过滤、回放与报告
- `tools/backtest/` - 主回测脚本、矩阵工具、上下文审计

### 运维与诊断工具
- `tools/ops/` - 巡逻控制、交易接入、图表生成、交易所配置
- `tools/diagnostics/` - 系统测试、数据审计、恢复检查、上下文诊断

### Web 模块
- `../AB Patrol-Web/src/` - 页面、组件、Web API

### 知识库
- `knowledge/patrol-l1/` - Al Brooks 知识库（只读）

### 当前权威文档
- `docs/PROJECT_STRUCTURE.md` - 目录落位与根级分层
- `docs/BACKEND_STRUCTURE.md` - 后端模块边界与放置规则
- `docs/RUNTIME_FLOW.md` - 巡逻运行链与状态流
- `docs/CURRENT_TRADING_FLOW.md` - 当前策略覆盖与交易链断点
- `docs/STRATEGY_COVERAGE_AUDIT.md` - 对照 S4 playbook 的覆盖审计
- `docs/BROOKS_RULE_AUDIT.md` - 回测门控规则的教材对照审计

## 📈 回测结果示例

```
======================================================================
  回测结果
======================================================================

  最终余额: $10,523.40
  总盈亏: $+523.40 (+5.23%)

  === 交易统计 ===
  信号总数: 847
  开仓次数: 847
  完成交易: 847
  胜率: 62.3% (528W / 319L)
  盈亏比 (PF): 1.85
  总盈利: $1,245.60
  总亏损: $722.20

  === 风格分布 ===
  Scalp: 234 (27.6%)
  Swing: 613 (72.4%)

  === 持仓管理 ===
  Premise 失效: 156 (18.4%)
  Trailing SL: 89 (10.5%)
  分批止盈: 312 (36.8%)
```

## ⚠️ 重要提示

### 1. 不要修改知识库
- `knowledge/patrol-l1/` - 从 Al Brooks 原课程提炼
- `indicators/batch/` - 核心指标计算
- **只能由人工维护，严禁 AI 修改**

### 2. 胜率目标
- **入场胜率**：55-65%（Brooks 标准）
- **账户胜率**：70-80%+（通过持仓管理）

Al Brooks 说：
> "The best setups have only 60% probability. If you think you have 85%, you're either lying or not taking enough trades."

### 3. 持仓管理是关键
- Premise 失效立即平仓（避免大亏）
- 分批止盈（锁定利润）
- Trailing SL（让利润奔跑）
- 部分加仓（强势时）

## 🔧 开发指南

### 修改信号逻辑
1. 先在 `knowledge/` 对齐策略定义
2. 再修改 `services/signal-service/src/engines/`
3. 重启 signal-service
4. 运行回测验证

### 修改持仓管理
1. 修改 `trading/position_management/`
2. 评估逻辑放 `evaluation/`
3. 止盈止损动作放 `risk_controls/`
2. 运行回测验证

### 添加新策略
1. 先在 `knowledge/` 对齐策略定义与触发条件
2. 在 `services/signal-service/src/engines/` 添加 live 信号检测
3. 在 `services/signal-service/src/engines/pa/risk.py` 补风控分类
4. 在 `libs/backtest/runner.py` 和 `libs/backtest/strategy_filters.py` 补回测路由与过滤
5. 如涉及仓位管理，再补 `trading/position_management/`
6. 运行权威回测验证

## 📞 技术栈

- **Python 3.14**
- **FastAPI** - API 服务
- **TimescaleDB** - 时序数据库
- **cTrader API** - 交易所接口
- **Pandas/NumPy** - 数据处理

## 📄 许可证

本项目基于 Al Brooks 的价格行为理论开发，仅供学习和研究使用。

---

**最后更新**：2026-03-12
**项目路径**：`/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent`

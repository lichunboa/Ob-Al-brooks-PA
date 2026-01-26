# 📋 全面升级规划书 (Comprehensive Upgrade Roadmap)

> **版本**: 2.2  
> **更新日期**: 2026-01-27  
> **插件版本**: v1.7.0  
> **协议**: 基于 [Spec-Workflow-MCP](https://github.com/Pimzino/spec-workflow-mcp) 标准  
> **目标**: 将 TradeCat 后端能力映射到 Obsidian 插件，实现"在 Obsidian 中完成所有交易分析工作"。

---

## ⚠️ 重要上下文 (Critical Context for Future Sessions)

> **这部分是给未来 AI 会话看的，确保不偏离方向。**

### 项目定位
- **Al-Brooks-Console** 是一个 Obsidian 插件，用于交易员的日常复盘、学习和实时分析
- **TradeCat** 是后端系统，提供数据采集、指标计算、信号检测、AI 分析等能力
- **目标**：将 TradeCat 的能力可视化到 Obsidian 插件中，告别 Telegram Bot 交互

### 关键决策 (2026-01-27)
1. **标的范围**：美股 (ES, NQ, NVDA, AAPL) 和加密货币 (BTC, ETH, BNB, SOL) 已全面支持
2. **策略定义**：Phase 3+ 目标，用户可自定义交易规则并让后端自动检测
3. **升级节奏**：每个大 Spec 开始前必须讨论细节，不能直接动手
4. **数据刷新**：市场扫描仪 5s 刷新，策略监控 5m 刷新

### 技术栈
- **前端**：Obsidian 插件 (React, TypeScript, Lightweight Charts v5.1.0)
- **后端**：Python 微服务 (FastAPI, TimescaleDB, signal-service 规则引擎)
- **通信**：REST API (`localhost:8088`)，未来考虑 WebSocket

### 文件位置
- **插件代码**：`.obsidian/plugins/al-brooks-console/src/`
- **后端代码**：`backend/tradecat-core/services/`
- **规划文档**：`🦁 交易员控制台 (Trader Command)/`

---

## 🎉 v1.7.0 更新内容 (2026-01-27)

### ✅ 新功能

| 功能 | 描述 |
|------|------|
| **加密货币支持** | BTC/ETH/BNB/SOL 实时 K 线数据，与美股共享统一 API |
| **Al Brooks 策略监控** | 8 种 Al Brooks 形态实时检测（双顶底、楔形、高1低1 等） |
| **5 秒刷新** | 市场扫描仪刷新间隔从 30s 改为 5s |
| **5 分钟级别 K 线** | 图表显示 5 分钟级别 K 线（之前是 1h） |
| **macOS 自动启动** | 开机后自动启动后端服务，只需启动 Docker Desktop |

### ✅ 修复

| 问题 | 解决方案 |
|------|----------|
| SSL 证书失败 | 安装最新 certifi 证书，修复币安 WebSocket 连接 |
| K 线图表不显示 | 添加时间戳去重和排序逻辑，确保 lightweight-charts 兼容 |
| 数据表混淆 | 实现智能表路由（crypto→candles_1m, stocks→crypto_kline_1m）|

### 📁 新增文件

- `StrategyIndicatorPanel.tsx` - Al Brooks 策略监控面板
- `~/scripts/start-trading-backend.sh` - macOS 启动脚本
- `~/Library/LaunchAgents/com.albrooks.trading.backend.plist` - 自动启动配置

---

## 📊 第一部分：现状分析

### 1.1 后端能力盘点 (TradeCat)

| 服务 | 能力 | 前端利用率 |
|------|------|------------|
| **data-service** | 加密货币 K 线采集 (WebSocket) | ✅ 已对接 |
| **stock-service** | 美股/期货采集 (yfinance) | ✅ 已对接 |
| **trading-service** | 34 个技术指标 | ✅ 策略监控使用 |
| **signal-service** | 129 条规则引擎 | ⚠️ 部分使用 |
| **telegram-service** | 49 种卡片 + 交互命令 | ❌ 待迁移 |
| **ai-service** | Wyckoff 分析, LLM | ⚠️ 基础问答 |

### 1.2 前端模块状态

| 模块 | 状态 |
|------|------|
| 交易中心 (TradingHubTab) | ✅ 可用 |
| 市场扫描仪 (MarketScanner) | ✅ **6 品种、5s 刷新** |
| Al Brooks 策略监控 | ✅ **8 种形态、5m 刷新** |
| 复盘分析 (ReviewTab) | ✅ 已实现 |
| 策略学习 (StrategyLibraryTab) | ✅ 已实现 |
| 后端服务 (BackendTab) | ⚠️ 基础可用 |

---

## 🗺️ 第二部分：演进路线图

### Phase 0: 基础修复 ✅ 已完成
- [x] 修复 MiniChart 渲染问题
- [x] 确保后端服务稳定运行
- [x] 加密货币数据对接
- [x] Al Brooks 策略监控面板

### Phase 1: 后端功能前端化 [进行中]
- [ ] Spec 1: 信号图层 (在 K 线上叠加 Buy/Sell 箭头)
- [ ] Spec 2: 技术指标面板
- [ ] Spec 3: 排行榜卡片
- [ ] Spec 4: 快速查询面板 (`BTC!` 等价 UI)
- [ ] Spec 5: AI 深度分析

### Phase 2: 模块融合 [待定]
- [ ] Spec 6: 与复盘/策略学习模块打通

### Phase 3: 策略定义 [待讨论]
- 用户自定义交易规则
- 后端加载用户策略并检测

### Phase 4: 实时与智能 [中期]
- WebSocket 实时推送
- 历史回测

---

## ✅ 第三部分：执行优先级

| 优先级 | Spec | 状态 |
|--------|------|------|
| ~~P0~~ | ~~Spec 0: MiniChart 修复~~ | ✅ 完成 |
| **P1** | Spec 1: 信号图层 | ⏳ 等待 |
| P1 | Spec 2: 指标面板 | ⏳ 等待 |
| P2 | Spec 3-5 | ⏳ 等待 |
| P3 | Spec 6: 模块融合 | ⏳ 等待 |

---

## 🛡️ 第四部分：风险与注意事项

| 项目 | 说明 |
|------|------|
| **数据延迟** | yfinance 美股数据延迟 15-20 分钟，周末无数据 |
| **WebSocket 重连** | 币安 WebSocket 可能因 SSL 问题断开，重启 ws.py 可修复 |
| **自动启动** | 需先手动启动 Docker Desktop，后端服务会自动启动 |
| **版本锁定** | Lightweight Charts v5.1.0，API 与 v4 不兼容 |

---

## 📋 第五部分：配置参考

### 市场扫描仪支持品种

```typescript
// MarketScannerComponent.tsx - DEFAULT_SYMBOLS
const symbols = [
    // 🇺🇸 股票期货
    { id: "ES", ticker: "ES=F", name: "E-mini S&P 500" },
    { id: "NQ", ticker: "NQ=F", name: "E-mini Nasdaq" },
    // 💰 加密货币
    { id: "BTC", ticker: "BTCUSDT", name: "Bitcoin" },
    { id: "ETH", ticker: "ETHUSDT", name: "Ethereum" },
    // 📈 科技股
    { id: "NVDA", ticker: "NVDA", name: "NVIDIA" },
    { id: "AAPL", ticker: "AAPL", name: "Apple" },
];
```

### Al Brooks 策略监控形态

| 形态 | Al Brooks 术语 | 风险等级 |
|------|----------------|----------|
| 双重顶底 | Double Top/Bottom | 低 |
| 楔形顶底 | Wedge Top/Bottom, Three Pushes | 低 |
| 高1/低1 | High 1, Low 1 | 高 |
| 20均线缺口 | First EMA Gap | 中 |
| 区间突破回调 | Breakout Pullback | 中 |
| 失败突破 | Failed Breakout, Bull/Bear Trap | 中 |
| 反转K线信号 | Reversal Bar, Signal Bar | 中 |
| 大资金操盘 | Climax, Exhaustion | 中 |

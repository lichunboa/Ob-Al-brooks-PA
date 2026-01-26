# 📋 全面升级规划书 (Comprehensive Upgrade Roadmap)

> **版本**: 2.1  
> **更新日期**: 2026-01-27  
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
1. **标的范围**：先专注美股 (ES, NQ, NVDA, AAPL) 和加密货币，稳定后再扩展
2. **策略定义**：Phase 3+ 目标，用户可自定义交易规则并让后端自动检测
3. **升级节奏**：每个大 Spec 开始前必须讨论细节，不能直接动手
4. **当前阻塞**：MiniChart 渲染异常（大绿块），需先修复再开始 Spec 1

### 技术栈
- **前端**：Obsidian 插件 (React, TypeScript, Lightweight Charts v5.1.0)
- **后端**：Python 微服务 (FastAPI, TimescaleDB, signal-service 规则引擎)
- **通信**：REST API (`localhost:8088`)，未来考虑 WebSocket

### 文件位置
- **插件代码**：`.obsidian/plugins/al-brooks-console/src/`
- **后端代码**：`backend/tradecat-core/services/`
- **规划文档**：`🦁 交易员控制台 (Trader Command)/`

---

## 📊 第一部分：现状分析

### 1.1 后端能力盘点 (TradeCat)

| 服务 | 能力 | 前端利用率 |
|------|------|------------|
| **data-service** | 加密货币 K 线采集 | ✅ 已对接 |
| **stock-service** | 美股/期货采集 (yfinance) | ✅ 已对接 |
| **trading-service** | 34 个技术指标 | ⚠️ 未展示 |
| **signal-service** | 129 条规则引擎 | ⚠️ 仅文字展示 |
| **telegram-service** | 49 种卡片 + 交互命令 | ❌ 待迁移 |
| **ai-service** | Wyckoff 分析, LLM | ⚠️ 基础问答 |

### 1.2 前端模块状态

| 模块 | 状态 |
|------|------|
| 交易中心 (TradingHubTab) | ✅ 基础可用 |
| 市场扫描仪 (MarketScanner) | ⚠️ **图表渲染异常** |
| 复盘分析 (ReviewTab) | ✅ 已实现 |
| 策略学习 (StrategyLibraryTab) | ✅ 已实现 |
| 后端服务 (BackendTab) | ⚠️ 基础可用 |

### 1.3 当前阻塞问题

**MiniChart 渲染异常**：
- 症状：K 线显示为大绿块/大红块，而非正常蜡烛图
- 可能原因：时间戳格式错误、数据排序问题、或 Lightweight Charts v5 配置问题
- 影响：Spec 1 (信号图层) 依赖正常的 K 线图

---

## 🗺️ 第二部分：演进路线图

### Phase 0: 基础修复 [当前]
- 修复 MiniChart 渲染问题
- 确保后端服务稳定运行

### Phase 1: 后端功能前端化 [2-3 周]
- Spec 1: 信号图层 (在 K 线上叠加 Buy/Sell 箭头)
- Spec 2: 技术指标面板
- Spec 3: 排行榜卡片
- Spec 4: 快速查询面板 (`BTC!` 等价 UI)
- Spec 5: AI 深度分析

### Phase 2: 模块融合 [1-2 周]
- Spec 6: 与复盘/策略学习模块打通

### Phase 3: 策略定义 [待讨论]
- 用户自定义交易规则
- 后端加载用户策略并检测
- 这是一个复杂功能，需要单独讨论设计

### Phase 4: 实时与智能 [中期]
- WebSocket 实时推送
- 历史回测

---

## 📝 第三部分：详细任务规格

### 🛠️ Spec 0: MiniChart 渲染修复 [当前执行]

**问题描述**：K 线图显示为纯色块而非蜡烛

**诊断步骤**：
1. 检查后端返回的 K 线数据格式 (时间戳是毫秒还是秒?)
2. 检查数据排序 (是否按时间升序?)
3. 检查 Lightweight Charts v5 的配置

**任务清单**：
- [x] **Task 0.1**: 调用 API 并打印返回数据
  - 发现返回 `open_time` (ISO 字符串) 而非 `time` (数字)
- [x] **Task 0.2**: 确认时间戳格式和转换逻辑
  - API 返回 ISO 字符串格式 (如 "2026-01-26T17:28:00+00:00")
  - 数据按时间降序排列（最新在前）
- [x] **Task 0.3**: 修复转换逻辑或配置
  - 修改 `CandleData` 接口使用 `open_time: string`
  - 使用 `new Date(open_time).getTime() / 1000` 转换
  - 反转数据数组为升序
- [ ] **Task 0.4**: 验证图表正常显示 ← **等待用户测试**

---

### 🎯 Spec 1: 信号图层

**需求**：在 K 线图上显示 Buy/Sell 信号箭头

**任务清单**：
- [ ] Task 1.1: 后端 API 验证
  - [ ] 1.1.1 调用 `GET /api/v1/signals/{symbol}` 确认返回结构
  - [ ] 1.1.2 文档化返回字段
- [ ] Task 1.2: 前端类型定义
  - [ ] 1.2.1 创建 `SignalEvent` 接口
  - [ ] 1.2.2 新增 `getSymbolSignals()` API 函数
- [ ] Task 1.3: MiniChart 升级
  - [ ] 1.3.1 新增 `fetchSignals()`
  - [ ] 1.3.2 实现 `convertToMarkers()`
  - [ ] 1.3.3 调用 `series.setMarkers()`
- [ ] Task 1.4: 视觉调优

---

### 🎯 Spec 2-6: (见前版，开始前再讨论细节)

---

## ✅ 第四部分：执行优先级

| 优先级 | Spec | 状态 |
|--------|------|------|
| **P0** | Spec 0: MiniChart 修复 | 🔄 进行中 |
| P1 | Spec 1: 信号图层 | ⏳ 等待 |
| P1 | Spec 2: 指标面板 | ⏳ 等待 |
| P2 | Spec 3-5 | ⏳ 等待 |
| P3 | Spec 6: 模块融合 | ⏳ 等待 |

---

## 🛡️ 第五部分：风险与注意事项

| 项目 | 说明 |
|------|------|
| **数据延迟** | yfinance 美股数据延迟 15-20 分钟，非实时 |
| **周末无数据** | 美股周末/假期无数据，图表可能显示为空 |
| **信号生成** | 需确保 signal-service 运行并有足够历史数据 |
| **版本锁定** | Lightweight Charts v5.1.0，API 与 v4 不兼容 |

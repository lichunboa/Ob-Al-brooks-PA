# 📋 全面升级规划书 (Comprehensive Upgrade Roadmap)

> **版本**: 2.5  
> **更新日期**: 2026-01-28  
> **插件版本**: v1.7.0 → v2.0.0  
> **后端**: TradeCat (Fork 自 https://github.com/tukuaiai/tradecat)  
> **后端分支**: `backend-main` (开发主分支)  
> **当前开发分支**: `feature/market-scanner-v2`  
> **协议**: 基于 [Spec-Workflow-MCP](https://github.com/Pimzino/spec-workflow-mcp) 标准  
> **目标**: 打造专业的 Al Brooks 交易员工作空间，支持多品种、自定义策略、实时监控与提醒，后端可部署到服务器。

---

## ⚠️ 重要上下文 (Critical Context for Future Sessions)

### 项目定位
- **Al-Brooks-Console** 是 Obsidian 插件，交易员的日常复盘、学习和实时分析中心
- **TradeCat Fork** 是后端服务，可本地部署也可服务器部署
- **最终形态**: Obsidian 为主界面，Telegram 为辅助提醒，支持团队/多用户

### 关键决策 (2026-01-28)
1. **服务器部署**: 后端支持本地/服务器双模式，通过 API 接口与插件通信
2. **Telegram 推送**: 后端 signal-service 触发 → Telegram Bot 推送 → 手机接收
3. **AI 分析集成**: AI 分析时结合用户笔记系统 + 后端市场数据
4. **Git 分支策略**: `backend-main` 为主分支，功能开发从主分支切新分支
5. **设置页面**: 后端/API/AI 配置全部移到 Obsidian 设置页，右侧显示数据监控
6. **品种扩展**: 架构支持无限添加品种，外汇优先 (EURUSD/GBPUSD/USDJPY/XAUUSD)
7. **数据缓存**: IndexedDB 保留3个月，回测按需下载，定期自动清理
8. **提醒策略**: 支持1分钟/5分钟/1小时合并窗口，按品种/策略筛选
9. **后端重构**: 逐步替换品牌信息，保留核心功能，添加自定义策略和回测
10. **服务器部署**: 功能稳定后再部署到服务器
11. **Token 安全**: 当前使用临时Token，正式发布前需重新配置

### 技术栈
- **前端**: Obsidian 插件 (React, TypeScript, Lightweight Charts v5.1.0)
- **后端**: Python 微服务 (FastAPI, TimescaleDB, WebSocket), 可 Docker 部署
- **数据**: IndexedDB (本地缓存) + TimescaleDB (服务器历史数据)
- **通信**: REST API + WebSocket (实时推送)
- **推送**: Telegram Bot API

---

## 🔄 版本历史

### v2.5 (2026-01-28) - 当前
- **服务器部署架构**: 支持本地/服务器双模式部署
- **Telegram 推送**: 后端触发 → 手机接收完整链路
- **AI 分析增强**: 结合用户笔记系统 + 后端数据
- **Git 架构**: 创建 `backend-main` 主分支
- **数据修复**: candles_5m/15m/1h/4h 聚合表已创建

### v2.4 (2026-01-28)
- 直接使用 Lightweight Charts
- 单一精细化图表方案
- 数据分层（3个月本地 + 回测下载）

---

## 🏗️ 后端重构计划

### 重构策略

**目标**: 将 TradeCat Fork 逐步转化为 Al Brooks Console 专用后端

**原则**:
1. **保留核心**: data-service, trading-service, signal-service, api-gateway, telegram-service, ai-service
2. **品牌替换**: 文档、配置、注释中的 TradeCat → Al Brooks Console
3. **去冗余**: 删除 PyPI 发布、GitHub Actions、预览服务等
4. **扩展功能**: 添加自定义策略、回测框架、与 Obsidian 深度集成

### 重构阶段

**阶段 1: 品牌化 (预计 1-2 天)**
```bash
# 替换内容
- README.md / README_EN.md → 重写项目介绍
- pyproject.toml → 修改包名、作者、描述
- config/.env.example → 修改默认配置
- services/telegram-service/src/main.py → 修改 Bot 名称和欢迎语
- 所有 Python 文件头部注释 → 替换版权信息
```

**阶段 2: 去冗余 (预计 1 天)**
```bash
# 删除文件/目录
- .github/workflows/        # CI/CD (我们用自己的)
- services-preview/         # 预览版服务
- docs/                     # 原项目文档
- scripts/pypi-*            # PyPI 发布脚本
- CHANGELOG.md (原)         # 原项目更新日志
```

**阶段 3: 功能扩展 (预计 2-3 周)**
- 自定义策略编辑器 API
- 回测框架后端支持
- 与 Obsidian 插件的专用 API
- 多用户支持 (服务器部署模式)

### 数据策略

**当前数据源**:
| 市场 | 数据源 | 状态 | 替代方案 |
|------|--------|------|----------|
| 加密货币 | 币安 (Binance) | ✅ 使用中 | - |
| 美股/期货 | Yahoo Finance | ✅ 使用中 | Polygon.io (备用) |
| 外汇 | Yahoo Finance | 🔄 计划 | dukascopy (高质) |
| A股 | - | 🔄 计划 | AKShare |

**免费数据源汇总**:
```yaml
加密货币:
  - 币安: {实时: true, 免费: true, 限制: "需代理", 推荐: "★★★★★"}
  
美股/期货:
  - Yahoo Finance: {实时: false, 延迟: "15分钟", 免费: true, 推荐: "★★★"}
  - Polygon.io: {实时: true, 免费额度: "5次/分钟", 推荐: "★★★★"}
  - IEX Cloud: {实时: false, 免费额度: "50万次/月", 推荐: "★★★"}
  
外汇/黄金:
  - Yahoo Finance: {实时: false, 免费: true, 推荐: "★★"}
  - dukascopy: {实时: false, 历史数据: "高质量", 推荐: "★★★★"}
  
A股:
  - AKShare: {实时: true, 免费: true, 推荐: "★★★★"}
```

**实施建议**:
- 短期 (1-2周): 继续使用币安 + Yahoo Finance
- 中期 (1个月): 集成 Polygon.io 作为美股实时备用
- 长期 (2个月): 集成 dukascopy 获取外汇历史数据

---

## 🏗️ 部署架构设计

### 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                     部署模式支持                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  模式 1: 本地开发 (当前)                                      │
│  ┌──────────────┐      ┌──────────────────┐                │
│  │   Obsidian   │──────│  localhost:8088  │                │
│  │    插件      │      │  (本地后端服务)    │                │
│  └──────────────┘      └──────────────────┘                │
│                                │                            │
│                                ▼                            │
│                         ┌──────────────┐                   │
│                         │  Docker DB   │                   │
│                         └──────────────┘                   │
│                                                             │
│  模式 2: 服务器部署 (目标)                                    │
│  ┌──────────────┐      ┌──────────────────┐                │
│  │   Obsidian   │◄────►│  api.example.com │                │
│  │    插件      │ HTTPS │  (云端后端服务)   │                │
│  └──────────────┘      └──────────────────┘                │
│         │                        │                         │
│         │                        ▼                         │
│         │              ┌──────────────────┐               │
│         │              │   服务器集群      │               │
│         │              │  • API Gateway   │               │
│         │              │  • data-service  │               │
│         │              │  • TimescaleDB   │               │
│         │              └──────────────────┘               │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │   Telegram   │ ◄── 后端推送提醒                          │
│  │    手机端     │                                          │
│  └──────────────┘                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### API 接口设计

**后端提供统一 API 接口**:
```
Base URL: 
  - 本地: http://localhost:8088
  - 服务器: https://api.yourdomain.com

认证:
  Header: X-API-Token: <your_token>

端点:
  GET  /health                    # 健康检查
  GET  /api/v1/status             # 服务状态
  GET  /api/v1/symbols            # 品种列表
  GET  /api/v1/candles/{symbol}   # K线数据
  WS   /ws/market                 # WebSocket 实时数据
  POST /api/v1/signals/subscribe  # 订阅信号提醒
  POST /api/v1/ai/analyze         # AI 分析
```

---

## 🏗️ Git 分支管理策略

### 分支结构

```
backend/tradecat-core/
├── backend-main          # 后端开发主分支（稳定版）
│   └── 所有功能开发从此切分支
│
├── feature/xxx           # 功能开发分支
│   ├── feature/market-scanner-v2    # 当前：市场扫描仪重构
│   ├── feature/custom-strategy      # 计划：自定义策略
│   └── feature/forex-support        # 计划：外汇支持
│
├── hotfix/xxx            # 紧急修复分支
│
└── dev (origin)          # 上游 TradeCat 的 dev 分支（定期同步）
```

### 工作流程

```bash
# 1. 开始新功能前，更新主分支
git checkout backend-main
git pull origin backend-main  # 如果有远程

# 2. 创建功能分支
git checkout -b feature/xxx

# 3. 开发完成后，提交到主分支
git checkout backend-main
git merge feature/xxx
git branch -d feature/xxx

# 4. 定期同步上游 TradeCat 更新
git remote add upstream https://github.com/tukuaiai/tradecat.git
git fetch upstream
git checkout backend-main
git merge upstream/dev  # 解决冲突后合并
```

### 当前分支状态

| 分支 | 说明 | 状态 |
|------|------|------|
| `backend-main` | 后端开发主分支 | ✅ 已创建 |
| `feature/market-scanner-v2` | 市场扫描仪重构 | 🔄 当前开发 |

---

## 📊 现状分析

### 后端数据监控诊断

**已修复**:
- ✅ candles_5m / candles_15m / candles_1h / candles_4h / candles_1d 聚合表已创建
- ✅ 自动刷新策略已配置

**待解决**:
- ⚠️ 数据延迟问题 (WebSocket 采集需优化)
- ⚠️ 需要添加数据健康度监控面板

---

## 🗺️ 演进路线图

### Phase 0: 基础架构重构 [进行中]

#### 0.1 设置页面重构 [P0]

**Obsidian 设置页新增**:
```
📚 Al Brooks Console 设置
├── 📡 后端服务设置
│   ├── 后端 API 地址: [http://localhost:8088]
│   ├── API Token: [••••••]
│   └── 连接测试 [按钮]
│
├── 🤖 AI 服务设置
│   ├── AI API Endpoint: [http://127.0.0.1:8045]
│   ├── AI API Key: [••••••]
│   └── AI 模型: [Gemini 3 Pro]
│
├── 📱 Telegram 推送设置
│   ├── Bot Token: [••••••]
│   ├── Chat ID: [••••••]
│   ├── 启用桌面通知 [开关]
│   └── 启用 Telegram 推送 [开关]
│
├── 📊 监控品种设置
│   ├── [+] 添加品种
│   └── 监控列表:
│       ☑️ BTC  5m  [删除]
│       ☑️ ETH  5m  [删除]
│       ☑️ ES   5m  [删除]
│       ☐ EURUSD 15m [删除]  ← 外汇
│
└── 🔔 提醒设置
    ├── 免打扰时段: 22:00 - 08:00
    └── 策略提醒级别: 仅低风险
```

#### 0.2 本地数据缓存策略 [P0]

**数据分层**:
```
内存 (当前会话)
├── 实时 tick 数据
└── 当前图表 K 线

IndexedDB (本地持久化)
├── 近期K线: 3个月 (自动清理)
├── 用户配置: 永久
├── 监控品种: 永久
└── 策略配置: 永久

服务器 (按需下载)
├── 历史数据: 全量
└── 回测数据: 临时缓存
```

**缓存策略**:
- 启动时检查缺失数据，自动补充
- 每周日凌晨清理超过3个月的数据
- 回测数据下载后临时存储，7天后自动删除
- 提供手动清理按钮

#### 0.3 服务器部署架构 [P0]
- [ ] 添加 API Token 认证中间件
- [ ] 支持 CORS 跨域 (服务器模式)
- [ ] Docker Compose 生产配置
- [ ] 环境变量配置 (.env.prod)
- [ ] SSL/TLS 支持

**部署文档**:
```bash
# 服务器部署步骤
1. 克隆仓库
git clone https://github.com/yourname/tradecat-fork.git
cd tradecat-fork

2. 配置环境
cp config/.env.example config/.env.prod
# 编辑 .env.prod 配置数据库、Token等

3. 启动服务
docker-compose -f docker-compose.prod.yml up -d

4. 验证
 curl https://api.yourdomain.com/health
```

#### 0.3 Telegram 推送集成 [P1]

**推送流程**:
```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────┐
│  signal-service │────►│  telegram-service │────►│  Telegram Bot │
│  检测到信号     │     │  格式化消息       │     │  推送到手机   │
└─────────────────┘     └──────────────────┘     └───────────────┘
```

**推送内容模板**:
```
🦁 Al Brooks 交易提醒

📊 品种: BTCUSDT (5分钟)
📈 策略: 双重底形态
🎯 方向: 做多

💰 入场: $89,500
🛑 止损: $89,200 (-0.3%)
🎯 目标 1: $90,200 (+0.8%)
🎯 目标 2: $90,800 (+1.4%)

⏰ 时间: 2026-01-28 19:30 (北京)
📊 置信度: 75%

[查看图表] [创建笔记]
```

**提醒合并策略** (可配置):
- 时间窗口选项: 1分钟 / 5分钟 / 1小时
- 批量提醒: 同品种多策略触发时打包推送
- 筛选: 按品种/策略风险级别筛选
- 默认: 全部提醒 (开发阶段便于优化)

#### 0.4 AI 分析集成 [P1]

**AI 分析时结合的数据**:
```typescript
interface AIAnalysisContext {
  // 后端市场数据
  market: {
    symbol: string;
    currentPrice: number;
    recentCandles: Candle[];      // 最近100根K线
    indicators: Indicators;        // RSI/MACD/布林带等
    patterns: Pattern[];           // 检测到的形态
  };
  
  // 用户笔记系统数据
  userNotes: {
    recentTrades: TradeNote[];     // 最近交易笔记
    relatedStrategies: Strategy[]; // 相关策略卡片
    historicalSignals: Signal[];   // 该品种历史信号
    personalStats: Stats;          // 个人统计数据
  };
  
  // Al Brooks 方法论知识
  alBrooksKnowledge: {
    currentCycle: MarketCycle;     // 当前市场周期
    alwaysIn: Direction;           // Always In 方向
    keyLevels: Level[];            // 关键支撑阻力位
  };
}
```

**AI 分析输出**:
```markdown
## BTCUSDT 5分钟 价格行为分析

### 当前市场结构
- **市场周期**: 强趋势 (Strong Trend)
- **Always In**: 多头 (Long)
- **关键位**: 
  - 支撑: $89,200 (昨日低点)
  - 阻力: $90,500 (前高)

### 形态识别
检测到 **双重底形态** (Double Bottom):
- 第一推: $89,100 (18:15)
- 第二推: $89,200 (19:30)
- 突破点: $89,500
- 置信度: 75%

### 参考你的交易记录
你在 BTC 上该策略的胜率: 65%
最近3次该形态信号: +2.1R, -1R, +1.5R

### 建议
1. 可在突破 $89,500 后做多
2. 止损设在 $89,100 (形态失效点)
3. 目标 $90,200 (3:1 盈亏比)

### 相关策略卡片
- [[双重底形态交易策略]]
- [[强趋势中突破入场]]
```

### Phase 1: 图表与策略系统 [进行中]

#### Spec 1: Lightweight Charts 集成 [P0]

- [ ] 替换 TradingView Widget
- [ ] 多品种切换列表
- [ ] 周期切换 (1m/5m/15m/1h/4h/1d) + 策略监控同步
- [ ] 实时 WebSocket 更新
- [ ] **图表截图功能**
  - 一键截图保存到笔记
  - 自动命名 (品种_周期_时间.png)
  - 复盘时关联图表截图

#### Spec 2: 外汇支持 [P1]

**优先支持外汇品种**:
| 品种 | 名称 | 数据源 | 交易时间 |
|------|------|--------|----------|
| EURUSD | 欧元/美元 | yfinance | 24h (周日22:00-周五22:00 GMT) |
| GBPUSD | 英镑/美元 | yfinance | 同上 |
| USDJPY | 美元/日元 | yfinance | 同上 |
| XAUUSD | 黄金/美元 | yfinance | 同上 |
| US30 | 道琼斯指数 | yfinance | RTH 09:30-16:00 ET |

#### Spec 3: 策略系统与回测 [P2]

- [ ] 自定义策略编辑器
- [ ] 策略回测框架
- [ ] 策略优化器

---

## ✅ 执行计划

| 阶段 | 任务 | 优先级 | 分支 |
|------|------|--------|------|
| 0.1 | 设置页面重构 | P0 | feature/market-scanner-v2 |
| 0.2 | 数据监控面板 | P0 | feature/market-scanner-v2 |
| 0.3 | 服务器部署架构 | P1 | feature/market-scanner-v2 |
| 0.4 | Telegram 推送 | P1 | feature/market-scanner-v2 |
| 0.5 | AI 分析集成 | P1 | feature/market-scanner-v2 |
| 1.1 | Lightweight Charts | P0 | feature/market-scanner-v2 |
| 1.2 | 外汇支持 | P1 | feature/forex-support |

---

## 📝 待办事项

- [x] 创建 backend-main 分支
- [x] 创建 feature/market-scanner-v2 分支
- [x] 修复 candles_5m/15m/1h/4h 聚合表
- [x] 添加 GitHub 远程仓库并推送
- [ ] 设置页面重构
- [ ] 数据监控面板

## ⚠️ 重要提醒事项

### 发布前检查清单

**GitHub Token 安全** (当前状态: ⚠️ 临时配置)
- [ ] 删除当前使用的临时 Token
- [ ] 生成新的 Personal Access Token
- [ ] 新 Token 权限: 仅 `repo` (不需要 `workflow`)
- [ ] 在本地配置新的 Token
- [ ] 测试推送是否正常

**后端品牌替换** (当前状态: ⏳ 待完成)
- [ ] 替换 README.md 中的 TradeCat 品牌
- [ ] 修改 pyproject.toml 包信息
- [ ] 更新 telegram-service Bot 名称
- [ ] 替换所有代码注释中的版权信息

**服务器部署准备** (当前状态: ⏳ 功能稳定后)
- [ ] 准备 Docker Compose 生产配置
- [ ] 配置域名和 SSL 证书
- [ ] 准备部署文档

### 外汇数据源优化 (当前: Yahoo Finance)
- [ ] 调研 Polygon.io 实时数据接口
- [ ] 调研 dukascopy 外汇历史数据
- [ ] 评估数据质量和成本

---

**下一步**: 请提供你的 GitHub 仓库地址，我帮你推送 backend-main 分支

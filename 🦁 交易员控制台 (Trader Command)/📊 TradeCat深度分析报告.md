# TradeCat 深度技术分析报告

## 1. 系统架构总览
TradeCat 采用典型的**微服务+共享数据层**架构，各组件职责清晰，通过数据库解耦。

### 核心组件
- **Data Service**: 负责数据采集。
    - *亮点*: 实现了 WebSocket 批量写入缓冲 (3秒窗口)，极大降低了数据库 IO 压力。内置"智能回填"机制，能自动发现并修复 K 线缺口。
- **Trading Service**: 负责计算。
    - *机制*: 分为 `batch` (全量窗口计算) 和 `incremental` (增量计算) 两种模式。所有指标计算结果写入 SQLite，供轻量级读取。
- **Signal Service**: 负责策略/信号。
    - *模式*: 基于规则引擎 (`rules` 目录)，定期扫描指标库触发信号。
- **AI Service**: 负责 LLM 分析。
    - *流程*: 聚合市场数据 -> 组装 Prompt -> 调用 Gemini/OpenAI -> 生成自然语言分析。
- **Telegram Service**: 用户交互界面。

## 2. 数据流向分析
1.  **Binance/Yahoo** -> `Data Service` (采集)
2.  -> **TimescaleDB** (`raw.crypto_kline_1m`) (存储原始 K 线)
3.  -> **Trading Service** (读取原始 K 线 -> `TA-Lib` 计算)
4.  -> **SQLite** (`indicators.db`) (存储技术指标值)
5.  -> **Signal Service** (扫描 SQLite -> 触发规则 -> 生成 Signal)
6.  -> **Telegram Bot** (推送 Signal / 响应用户查询)

## 3. 扩展性评估 (对于 Al Brooks PA 策略)

### 3.1 添加新指标 (容易)
在 `trading-service/src/indicators/batch/` 下新建 Python 文件继承 `Indicator` 类即可。
*应用*: 可以编写 `al_brooks_setup.py` 来识别 H1/H2, L1/L2, MTR, Wedge 等形态。

### 3.2 添加新信号 (中等)
在 `signal-service/src/rules/` 下添加规则类。
*应用*: 当识别到 `H2` 且 `EMA` 向下时，触发 "Strong Bear Signal"。

### 3.3 AI 个性化 (容易)
修改 `ai-service/src/prompts/` 或配置文件中的 Prompt。
*应用*: 修改 Prompt 让 AI "像 Al Brooks 一样思考"，关注逐根 K 线分析 (Bar-by-bar analysis)。

## 4. 优势与不足

### ✅ 优势
- **高性能**: 针对 Crypto 高频数据做了专门优化 (TimescaleDB + Batching)。
- **模块化**: 想要加美股数据，只需加一个 `stock-service` (我们已经做了)，不影响核心。
- **费用低**: 核心计算在本地，仅 AI 分析需要调用 LLM API。
- **数据完整**: 自带回填和数据清洗逻辑。

### ⚠️ 不足/挑战
- **美股非原生**: 原生只支持 Crypto，美股需要"伪装"成 Crypto 格式存储 (Volume/QuoteVol 映射问题)。
- **信号延迟**: 基于轮询机制 (Scanning)，信号可能有 分钟级 延迟，不适合高频剥头皮。
- **Obsidian 集成**: 需要维护独立的 API Gateway 来适配 Obsidian 插件。

## 5. 结论与建议
TradeCat 是一个非常适合**中低频、趋势跟踪或波段交易**的框架。它的架构足以支撑复杂的 Price Action 形态识别。

**后续路线建议**:
1.  **深化 PA 识别**: 在 `trading-service` 中移植更多 Al Brooks 的形态算法。
2.  **AI 优化**: 调整 Prompt，让 AI 输出更符合 PA 交易员视角的分析报告。
3.  **多品种监控**: 利用现在的架构，继续扩展外汇 (Forex) 等其他市场数据。

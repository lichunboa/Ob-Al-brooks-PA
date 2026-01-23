# AL Brooks Trading Console - Backend Services

基于 [TradeCat](https://github.com/tukuaiai/tradecat) (MIT License) 移植的后端服务，为 Obsidian 插件提供：

- **数据采集** - 加密货币实时行情 (CCXT/Binance)
- **技术指标** - 38 种指标计算 (RSI, MACD, 布林带等)
- **信号检测** - 129 条规则引擎
- **AI 分析** - Wyckoff/Al Brooks 方法论分析

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，配置必要的参数
chmod 600 .env
```

### 2. 启动服务

```bash
# 启动所有服务
docker-compose up -d

# 仅启动数据库
docker-compose up -d timescaledb

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 3. 验证服务

```bash
# 检查数据库
docker exec -it al-brooks-timescaledb psql -U postgres -d market_data -c "SELECT version();"

# 检查 API
curl http://localhost:8088/health
```

## 服务架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Obsidian Plugin                          │
│                  (al-brooks-console)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway                             │
│                    (Port 8088)                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ AI Service  │   │Signal Service│  │Trading Service│
│ (Wyckoff)   │   │(129 Rules)  │   │(38 Indicators)│
└─────────────┘   └─────────────┘   └──────┬──────┘
                           │               │
                           ▼               ▼
                   ┌─────────────────────────────┐
                   │      Data Service           │
                   │  (CCXT/Binance WebSocket)   │
                   └──────────────┬──────────────┘
                                  │
                                  ▼
                   ┌─────────────────────────────┐
                   │       TimescaleDB           │
                   │    (Port 5434)              │
                   └─────────────────────────────┘
```

## API 端点

### 行情数据

```
GET /api/v1/candles/{symbol}?interval=1h&limit=100
GET /api/v1/indicators/{symbol}?interval=1h
GET /api/v1/signals/{symbol}
```

### AI 分析

```
POST /api/v1/analysis
{
  "symbol": "BTCUSDT",
  "prompt": "wyckoff_analysis"
}
```

### 系统状态

```
GET /health
GET /api/v1/status
```

## 目录结构

```
backend/
├── docker-compose.yml      # Docker 编排配置
├── .env.example            # 环境变量模板
├── .env                    # 实际配置 (不提交)
├── init-scripts/           # 数据库初始化脚本
├── services/
│   ├── data-service/       # 数据采集服务
│   ├── trading-service/    # 指标计算服务
│   ├── signal-service/     # 信号检测服务
│   ├── ai-service/         # AI 分析服务
│   └── api-gateway/        # API 网关
├── prompts/                # AI 提示词模板
├── data/                   # 运行时数据
└── logs/                   # 日志文件
```

## 从 TradeCat 移植的功能

| 服务 | 状态 | 说明 |
|------|------|------|
| data-service | 待移植 | 数据采集 (CCXT, Binance WS) |
| trading-service | 待移植 | 38 种技术指标 |
| signal-service | 待移植 | 129 条信号规则 |
| ai-service | 待移植 | Wyckoff AI 分析 |
| api-gateway | 新增 | REST API 供 Obsidian 调用 |

## 许可证

- 后端服务代码基于 TradeCat (MIT License)
- 请保留原作者版权声明

## 参考

- [TradeCat GitHub](https://github.com/tukuaiai/tradecat)
- [TimescaleDB 文档](https://docs.timescale.com/)
- [CCXT 文档](https://docs.ccxt.com/)

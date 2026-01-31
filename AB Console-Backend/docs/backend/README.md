# 后端服务文档

## 简介

AB Console 后端服务提供市场数据获取和策略计算功能。

## 架构

```
backend/tradecat-core/services/websocket-service/
├── simple_server.py       # 简化版 HTTP 服务（当前使用）
├── src/                   # 完整版 WebSocket 服务（开发中）
│   ├── main.py
│   ├── strategies/
│   └── handlers/
└── requirements.txt
```

## 当前服务 (simple_server.py)

简化版 HTTP 服务，提供：
- 真实市场数据（Binance API）
- 策略信号计算
- HTTP REST API

### 启动

```bash
cd backend/tradecat-core/services/websocket-service
python3 simple_server.py

# 服务运行在 http://localhost:8088
```

### API 端点

#### 健康检查
```http
GET /health

Response:
{
  "status": "healthy",
  "service": "data-service",
  "version": "2.0.0",
  "data_source": "binance"
}
```

#### 获取 K线数据
```http
GET /api/v1/candles?symbol=BTCUSDT&interval=5m&limit=100

Response:
{
  "symbol": "BTCUSDT",
  "interval": "5m",
  "source": "binance",  // 或 "mock"
  "candles": [
    {
      "time": 1706432000,    // Unix 时间戳（秒）
      "open": 40000.0,
      "high": 40100.0,
      "low": 39900.0,
      "close": 40050.0,
      "volume": 100.5
    }
  ]
}
```

**参数说明:**
- `symbol`: 交易对，如 BTCUSDT, ETHUSDT
- `interval`: 时间框架，可选值: 1m, 5m, 15m, 30m, 1h, 4h, 1d
- `limit`: 返回的 K线数量，最大 1000

#### 策略信号分析
```http
GET /api/v1/signals/analyze?symbol=BTCUSDT&interval=5m

Response:
{
  "symbol": "BTCUSDT",
  "interval": "5m",
  "candles_analyzed": 100,
  "signals": [
    {
      "type": "BUY",           // 或 "SELL"
      "name": "H1突破",
      "description": "收盘价突破前高 0.5%",
      "confidence": 75,        // 置信度 0-100
      "timestamp": 1706432000,
      "metadata": {...}
    }
  ]
}
```

#### 策略列表
```http
GET /api/v1/strategies

Response:
{
  "strategies": [
    {"id": "h1_breakout", "name": "H1突破", "enabled": true},
    {"id": "l1_breakout", "name": "L1突破", "enabled": true},
    {"id": "trend_strength", "name": "趋势强度", "enabled": true}
  ]
}
```

## 数据源

### Binance API

- **官方文档**: https://binance-docs.github.io/apidocs/spot/en/
- **K线 endpoint**: `GET /api/v3/klines`
- **限制**: 1200 请求/分钟（IP 限制）

### 故障转移

当 Binance API 不可用时，自动使用模拟数据：
```python
candles = fetch_binance_candles(symbol, interval, limit)
if candles is None:
    candles = generate_mock_candles(symbol, interval, limit)
```

## 策略引擎

### 支持的策略

| 策略 | 类型 | 描述 |
|------|------|------|
| H1突破 | BUY | 收盘价突破前一根K线的高点 |
| L1突破 | SELL | 收盘价跌破前一根K线的低点 |
| 趋势强度 | BUY/SELL | 连续多根K线同向运动 |

### 添加新策略

在 `SimpleStrategyEngine.analyze()` 方法中添加：

```python
# 自定义策略检测
if your_condition:
    signals.append({
        'type': 'BUY',  # 或 'SELL'
        'name': '策略名称',
        'description': '策略描述',
        'confidence': 70,  # 0-100
        'timestamp': current['time'],
        'symbol': symbol,
        'interval': interval,
        'metadata': {...}
    })
```

## 部署

### Docker（推荐）

```bash
docker build -t tradecat-backend .
docker run -p 8088:8088 tradecat-backend
```

### 直接运行

```bash
# 安装依赖（如果需要）
pip install -r requirements.txt

# 启动服务
python3 simple_server.py
```

## 开发计划

- [x] Binance API 接入
- [x] 基础策略引擎
- [x] HTTP REST API
- [ ] WebSocket 实时推送
- [ ] 数据库存储（TimescaleDB）
- [ ] 用户认证
- [ ] 更多技术指标

---

*详见完整 API 文档: [API文档.md](./API文档.md)*

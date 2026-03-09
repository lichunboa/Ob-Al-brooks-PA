# cTrader 集成方案

## API 信息

- Client ID: `22422`
- Client Secret: `P3tUUQJNaDhrkZBcNpZT2icVOwiWGp2aXnThg4WVn92lXvakUp`
- Access Token: `xbmOJYV7c2SBBDQKkU1cvNBoAp99wYlSYMTvnRWmT2HZc9u99I`
- Playground: https://openapi.ctrader.com/apps/22422/playground
- Callback URL: http://localhost:8096/callback

## 集成架构

```
PA Runtime (策略层)
    ↓
Execution Service (执行层)
    ↓
Exchange Adapter (适配层) ← 新增
    ├── Binance Adapter (已有)
    └── cTrader Adapter (新增)
```

## cTrader vs Binance 差异

| 特性 | Binance | cTrader |
|------|---------|---------|
| 品种格式 | BTCUSDT | EURUSD, GBPUSD |
| 订单类型 | MARKET, LIMIT, STOP_MARKET | MARKET, LIMIT, STOP |
| 持仓模式 | 单向/双向 | 净持仓 |
| 杠杆 | 1-125x | 1-500x |
| 最小单位 | quantity | lots |
| 价格精度 | 小数位 | pips |

## 实现步骤

### 1. 创建 cTrader Adapter

```python
# runtime/adapters/ctrader_adapter.py

class CTraderAdapter:
    def __init__(self, client_id, client_secret, access_token):
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = access_token
        self.base_url = "https://openapi.ctrader.com"
    
    def place_order(self, order: dict) -> dict:
        """
        将 PA Runtime 的订单格式转换为 cTrader 格式
        
        PA Format:
        {
            "symbol": "EURUSD",
            "side": "BUY",
            "quantity": 0.1,  # lots
            "order_type": "MARKET",
            "stop_loss": 1.0850,
            "take_profit": 1.0950,
        }
        
        cTrader Format:
        {
            "symbolName": "EURUSD",
            "tradeSide": "BUY",
            "volume": 10000,  # 0.1 lots = 10000 units
            "orderType": "MARKET",
            "stopLoss": 1.0850,
            "takeProfit": 1.0950,
        }
        """
        pass
    
    def get_positions(self) -> list:
        """获取持仓"""
        pass
    
    def get_account_info(self) -> dict:
        """获取账户信息"""
        pass
    
    def close_position(self, symbol: str, quantity: float) -> dict:
        """平仓"""
        pass
```

### 2. 修改 Execution Service

```python
# execution-service/main.py

from adapters.binance_adapter import BinanceAdapter
from adapters.ctrader_adapter import CTraderAdapter

# 根据配置选择适配器
if config.exchange == "binance":
    adapter = BinanceAdapter(...)
elif config.exchange == "ctrader":
    adapter = CTraderAdapter(...)

# 统一接口
@app.post("/order")
def place_order(order: dict):
    return adapter.place_order(order)
```

### 3. 配置文件

```bash
# config/.env

# 交易所选择
AB_PATROL_EXCHANGE=ctrader  # binance | ctrader

# cTrader 配置
CTRADER_CLIENT_ID=22422
CTRADER_CLIENT_SECRET=P3tUUQJNaDhrkZBcNpZT2icVOwiWGp2aXnThg4WVn92lXvakUp
CTRADER_ACCESS_TOKEN=xbmOJYV7c2SBBDQKkU1cvNBoAp99wYlSYMTvnRWmT2HZc9u99I
CTRADER_ACCOUNT_ID=your_account_id
```

### 4. 品种配置

```yaml
# config/symbols_ctrader.yaml

symbols:
  - symbol: EURUSD
    timeframes: [5m, 15m, 1h]
    min_lot: 0.01
    max_lot: 100
    pip_value: 0.0001
    
  - symbol: GBPUSD
    timeframes: [5m, 15m, 1h]
    min_lot: 0.01
    max_lot: 100
    pip_value: 0.0001
    
  - symbol: XAUUSD  # 黄金
    timeframes: [5m, 15m, 1h]
    min_lot: 0.01
    max_lot: 100
    pip_value: 0.01
```

## cTrader API 端点

### 认证
```
POST /connect/token
```

### 账户信息
```
GET /v2/accounts/{accountId}
```

### 下单
```
POST /v2/accounts/{accountId}/orders
```

### 获取持仓
```
GET /v2/accounts/{accountId}/positions
```

### 平仓
```
DELETE /v2/accounts/{accountId}/positions/{positionId}
```

## 风险计算差异

### Binance
```python
risk = (entry - stop_loss) * quantity * price
```

### cTrader
```python
# 外汇
risk = (entry - stop_loss) / pip_value * lot_size * contract_size

# 黄金
risk = (entry - stop_loss) * lot_size * contract_size
```

## 测试计划

1. **沙盒测试**
   - 使用 cTrader Demo 账户
   - 测试订单执行
   - 测试持仓管理

2. **小资金实盘**
   - 最小仓位测试
   - 验证风险计算
   - 验证止损/止盈

3. **全功能测试**
   - 多品种同时交易
   - 持仓管理
   - 异常处理

## 优势

✅ **统一策略层**：PA Runtime 不需要修改
✅ **灵活切换**：通过配置切换交易所
✅ **多市场支持**：外汇、黄金、指数
✅ **更高杠杆**：cTrader 支持 1-500x
✅ **更多品种**：外汇主要货币对 + 贵金属

## 下一步

1. 实现 cTrader Adapter
2. 测试 API 连接
3. 实现订单转换
4. 测试持仓管理
5. 沙盒测试
6. 小资金实盘

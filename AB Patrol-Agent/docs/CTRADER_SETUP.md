# cTrader 配置指南

## 概述

cTrader 是一个专业的外汇交易平台，支持外汇、黄金、指数等多种资产。

## 获取 API 凭证

### 1. 注册 cTrader 账户

访问：https://ctrader.com/

### 2. 创建 Demo 账户

1. 登录 cTrader
2. 选择 "Demo Account"
3. 记录账户 ID

### 3. 获取 API 凭证

1. 访问：https://openapi.ctrader.com/
2. 创建应用
3. 获取：
   - Client ID
   - Client Secret
   - Access Token

## 配置步骤

### 1. 编辑 config/.env

```bash
# cTrader 配置
AB_PATROL_CTRADER_CLIENT_ID=your_client_id
AB_PATROL_CTRADER_CLIENT_SECRET=your_client_secret
AB_PATROL_CTRADER_ACCESS_TOKEN=your_access_token
AB_PATROL_CTRADER_ACCOUNT_ID=your_account_id
AB_PATROL_CTRADER_DEMO=1  # 1 = Demo, 0 = Live
```

### 2. 测试连接

```python
from adapters.ctrader_adapter import CTraderAdapter

config = {
    "client_id": "your_client_id",
    "client_secret": "your_client_secret",
    "access_token": "your_access_token",
    "account_id": "your_account_id",
    "demo": True,
}

adapter = CTraderAdapter(config)
account_info = adapter.get_account_info()
print(account_info)
```

## 支持的品种

### 外汇（10 个主流货币对）
- EURUSD - 欧元/美元
- GBPUSD - 英镑/美元
- USDJPY - 美元/日元
- AUDUSD - 澳元/美元
- USDCAD - 美元/加元
- NZDUSD - 纽元/美元
- USDCHF - 美元/瑞郎
- EURGBP - 欧元/英镑
- EURJPY - 欧元/日元
- GBPJPY - 英镑/日元

### 贵金属（2 个）
- XAUUSD - 黄金/美元
- XAGUSD - 白银/美元

### 指数（5 个）
- US30 - 道琼斯指数
- US500 - 标普 500
- NAS100 - 纳斯达克 100
- GER40 - 德国 DAX
- UK100 - 英国富时 100

## Lots 转换

cTrader 使用 lots 作为交易单位：

### 外汇
- 1 lot = 100,000 units
- 0.01 lot = 1,000 units (micro lot)

### 黄金
- 1 lot = 100 oz
- 0.01 lot = 1 oz

### 指数
- 1 lot = 1 contract

## 示例

### 下单示例

```python
# 做多 EURUSD
result = adapter.place_order(
    symbol="EURUSD",
    side="BUY",
    quantity=100000,  # 1 lot
    order_type="MARKET",
    stop_loss=1.0800,
    take_profit=1.0900,
)
```

### 查询持仓

```python
positions = adapter.get_positions()
for pos in positions:
    print(f"{pos['symbol']}: {pos['side']} {pos['quantity']}")
```

### 平仓

```python
result = adapter.close_position(
    symbol="EURUSD",
    quantity=50000,  # 部分平仓 0.5 lot
)
```

## 注意事项

### 1. Demo 账户限制
- 虚拟资金
- 可能有延迟
- 部分功能受限

### 2. API 限流
- 每秒最多 10 个请求
- 超过限制会被暂时封禁

### 3. 交易时间
- 外汇：周一 00:00 - 周六 00:00 (GMT)
- 黄金：周一 01:00 - 周六 00:00 (GMT)
- 指数：根据市场而定

### 4. 点差和佣金
- Demo 账户点差可能与实盘不同
- 注意佣金计算

## 故障排查

### 连接失败
```
Error: Connection refused
```
**解决方案：**
1. 检查 API 凭证
2. 确认账户状态
3. 检查网络连接

### 认证失败
```
Error: Invalid access token
```
**解决方案：**
1. 重新生成 Access Token
2. 检查 Token 是否过期
3. 确认 Client ID/Secret 正确

### 下单失败
```
Error: Insufficient margin
```
**解决方案：**
1. 检查账户余额
2. 减少交易量
3. 调整杠杆

## 最佳实践

### 1. 使用 Demo 账户测试
在实盘前充分测试策略

### 2. 控制交易频率
避免触发 API 限流

### 3. 监控账户状态
定期检查余额和保证金

### 4. 设置止损
每笔交易都设置止损

### 5. 记录交易日志
便于回测和优化

## 参考资源

- cTrader 官网：https://ctrader.com/
- Open API 文档：https://help.ctrader.com/open-api/
- 社区论坛：https://ctrader.com/forum/

## 支持

如有问题，请联系：
- cTrader 支持：support@ctrader.com
- 社区论坛：https://ctrader.com/forum/

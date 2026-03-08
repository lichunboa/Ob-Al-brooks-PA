# Execution Service

币安合约交易执行服务，提供 REST API 供 OpenClaw agent 调用。

## 功能

- 币安合约市价/限价单
- 自动设置止损/止盈
- 风控管理（每日亏损限制、仓位限制、紧急停止）
- 支持 Testnet 和 Mainnet

## 快速开始

### 1. 配置 API Key

```bash
cp config/.env.example config/.env
# 编辑 config/.env，填入你的 API Key
```

**Testnet API Key 获取**：
1. 访问 https://testnet.binancefuture.com
2. 用 GitHub 登录
3. 生成 API Key

### 2. 安装依赖

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. 启动服务

```bash
python -m src
```

服务默认运行在 `http://localhost:8091`

## API 文档

启动后访问 `http://localhost:8091/docs` 查看 Swagger 文档。

### 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /health | 健康检查 |
| GET | /balance | 获取余额 |
| GET | /positions | 获取持仓 |
| POST | /order | 下单 |
| POST | /order/{symbol}/close | 平仓 |
| DELETE | /orders | 取消所有订单 |
| GET | /risk/status | 风控状态 |
| POST | /risk/emergency-stop | 紧急停止 |

### 下单示例

```bash
curl -X POST http://localhost:8091/order \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "side": "BUY",
    "quantity": 0.001,
    "order_type": "MARKET",
    "stop_loss": 95000,
    "take_profit": 105000,
    "leverage": 5
  }'
```

## 风控配置

在 `config/.env` 中配置：

```env
MAX_DAILY_LOSS_USDT=100    # 每日最大亏损
MAX_POSITION_SIZE_USDT=50  # 单笔最大仓位
MAX_LEVERAGE=5             # 最大杠杆
EMERGENCY_STOP=false       # 紧急停止开关
```

## 与 OpenClaw 集成

在 OpenClaw agent skill 中调用：

```python
import httpx

async def execute_trade(symbol, side, quantity, stop_loss, take_profit):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8091/order",
            json={
                "symbol": symbol,
                "side": side,
                "quantity": quantity,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
            }
        )
        return response.json()
```

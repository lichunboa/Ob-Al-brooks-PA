# 信号价格修复记录

> 修复日期: 2026-02-06

## 问题描述

信号推送到 Discord 后，agent 报告"8小时延迟"，但实际上信号时间戳是正确的。

### 根本原因

1. **PG Engine 期货指标信号没有价格**：`top_trader_extreme_long`、`top_trader_extreme_short`、`taker_ratio_flip_long`、`taker_ratio_flip_short` 这些信号从 `binance_futures_metrics_5m` 表获取数据，但该表没有 `close` 字段，导致 `price` 始终为 `0.0`。

2. **Transform 没有传递价格**：即使后端发送了价格，transform 也没有将 `price` 字段包含在返回对象中。

3. **Agent 智能推断延迟**：由于信号中 `price: 0.0`，agent 会调用 Binance API 获取当前价格，然后根据价格差异推断信号延迟。例如 ETH 从 $2,200 变到 $1,835，agent 认为信号是旧的。

## 修复内容

### 1. pg_engine.py

**文件**: `AB Console-Backend/services/signal-service/src/engines/pg_engine.py`

修改以下方法，添加 `candle` 参数从 K 线数据获取价格：

```python
# 修改前
def check_top_trader_extreme_long(self, curr: dict, threshold: float = 3.0) -> PGSignal | None:
    ...
    price=_safe_float(curr.get("close", 0)),  # curr 是期货指标，没有 close 字段！
    ...

# 修改后
def check_top_trader_extreme_long(self, curr: dict, threshold: float = 3.0, candle: dict = None) -> PGSignal | None:
    ...
    price = _safe_float(candle.get("close", 0)) if candle else 0.0  # 从 K 线数据获取价格
    ...
```

同样修改的方法：
- `check_top_trader_extreme_long`
- `check_top_trader_extreme_short`
- `check_taker_ratio_flip_long`
- `check_taker_ratio_flip_short`

更新 `check_signals` 方法中的调用：

```python
# 修改前
(self.rules.check_top_trader_extreme_long, [curr_metric, 3.0]),

# 修改后
(self.rules.check_top_trader_extreme_long, [curr_metric, 3.0, curr_candle]),
```

### 2. al-brooks-multi-channel.js

**文件**: `~/.openclaw/transforms/al-brooks-multi-channel.js`

添加价格字段到 transform 输出：

```javascript
// 获取信号价格（如果后端提供了的话）
const signalPrice = payload.price || 0;

// 在信号消息中显示价格
- 信号价格: ${signalPrice > 0 ? '$' + signalPrice.toLocaleString() : '使用 Binance API 获取'}

// 在返回对象中包含价格
return {
  message: signalMessage.trim(),
  timestamp: Date.now(),
  price: signalPrice,  // 新增
  signal_time: timeStr,
  ...
};
```

## 验证

修复后手动测试：

```bash
docker exec ab-signal-service python3 -c "
from engines.pg_engine import get_pg_engine, PGSignalRules
engine = get_pg_engine()
candles = engine._fetch_latest_candles()
metrics = engine._fetch_latest_metrics()
rules = PGSignalRules()

curr_candle = candles.get('BTCUSDT')
curr_metric = metrics.get('BTCUSDT')

signal = rules.check_top_trader_extreme_long(curr_metric, 3.0, curr_candle)
print(f'Signal price: {signal.price}')
"
```

输出：
```
Signal price: 63609.2
```

## 数据流

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  TimescaleDB    │     │  signal-service  │     │    OpenClaw     │
│                 │     │                  │     │                 │
│ candles_1m      │────>│ PGSignalEngine   │────>│ Webhook         │
│ (有 close)      │     │ check_signals()  │     │ Transform       │
│                 │     │                  │     │                 │
│ futures_metrics │────>│ PGSignalRules    │     │ Agent           │
│ (无 close)      │     │ check_top_trader │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              │ 修复：从 candles 获取 price
                              │ 而不是从 metrics
                              ▼
                        price = candle.get("close")
```

## 相关文件

| 文件 | 说明 |
|------|------|
| `AB Console-Backend/services/signal-service/src/engines/pg_engine.py` | PG 信号引擎 |
| `~/.openclaw/transforms/al-brooks-multi-channel.js` | OpenClaw Transform |
| `openclaw-config/transforms/al-brooks-multi-channel.js` | Transform 备份 |

## 教训

1. **期货指标表和 K 线表结构不同**：期货指标表 (`binance_futures_metrics_5m`) 没有价格字段，需要从 K 线表 (`candles_1m`) 获取。

2. **Transform 需要显式传递字段**：即使后端发送了数据，transform 也需要显式将字段包含在返回对象中。

3. **Agent 的智能推断**：当信号缺少价格时，agent 会尝试获取当前价格并推断延迟，这是智能行为但可能导致误判。

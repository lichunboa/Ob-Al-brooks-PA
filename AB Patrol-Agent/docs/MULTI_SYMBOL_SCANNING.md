# 多品种并行扫描

## 概述

多品种并行扫描模块允许同时扫描多个品种，提高效率。

## 功能特性

- ✅ 并行扫描多个品种
- ✅ 支持多个交易所（Binance、OKX、cTrader）
- ✅ 统一的信号输出
- ✅ 优先级排序
- ✅ 信号过滤

## 使用方法

### 1. 基本用法

```python
from multi_symbol_scanner import scan_multiple_symbols

# 扫描多个品种
symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]
signals = scan_multiple_symbols(
    symbols=symbols,
    exchange="binance",
    timeframe="5m",
    max_workers=5,
)

# 打印结果
for signal in signals:
    print(f"{signal['symbol']}: {signal['side']} - 优先级 {signal['priority']:.1f}")
```

### 2. 扫描所有市场

```python
from multi_symbol_scanner import scan_all_markets, format_scan_results

# 扫描所有交易所
results = scan_all_markets(
    exchanges=["binance", "okx", "ctrader"],
    timeframe="5m",
    max_workers=10,
)

# 打印格式化结果
print(format_scan_results(results))
```

### 3. 自定义品种列表

```python
from multi_symbol_scanner import scan_multiple_symbols

# 自定义品种列表
custom_symbols = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "AVAXUSDT",
    "DOTUSDT",
]

signals = scan_multiple_symbols(
    symbols=custom_symbols,
    exchange="binance",
    timeframe="15m",
    max_workers=5,
)
```

### 4. 信号过滤

```python
from multi_symbol_scanner import scan_multiple_symbols, filter_signals

# 扫描
signals = scan_multiple_symbols(
    symbols=["BTCUSDT", "ETHUSDT", "BNBUSDT"],
    exchange="binance",
    timeframe="5m",
)

# 过滤高优先级信号
high_priority = filter_signals(
    signals=signals,
    min_priority=70.0,  # 只保留优先级 >= 70 的信号
    max_signals=3,      # 最多 3 个信号
)
```

## 优先级计算

信号优先级由以下因素决定（总分 100）：

### 1. 信号强度（40%）
- 基于技术指标的综合评分
- 范围：0-40

### 2. 市场状态（30%）
- BO（突破）：30 分
- TC（趋势）：25 分
- TR（震荡）：15 分

### 3. 多周期对齐（20%）
- 多个周期方向一致：+20 分
- 不一致：0 分

### 4. 风险回报比（10%）
- R >= 3：10 分
- R >= 2：7 分
- R >= 1.5：5 分
- R < 1.5：0 分

## 默认品种列表

### Binance（加密货币）
```python
[
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "ADAUSDT",
    "DOGEUSDT",
    "AVAXUSDT",
    "DOTUSDT",
    "MATICUSDT",
]
```

### OKX（加密货币永续）
```python
[
    "BTC-USDT-SWAP",
    "ETH-USDT-SWAP",
    "BNB-USDT-SWAP",
    "SOL-USDT-SWAP",
    "XRP-USDT-SWAP",
]
```

### cTrader（外汇 + 黄金）
```python
[
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "AUDUSD",
    "USDCAD",
    "XAUUSD",  # 黄金
]
```

## 配置选项

### 并行数量

```python
# 少量品种（< 10）
max_workers=5

# 中等数量（10-20）
max_workers=10

# 大量品种（> 20）
max_workers=20
```

### 过滤阈值

```python
# 保守（只要最好的信号）
min_priority=70.0
max_signals=3

# 平衡（中等质量）
min_priority=50.0
max_signals=5

# 激进（更多机会）
min_priority=30.0
max_signals=10
```

## 集成到主循环

### 方法 1：定期扫描

```python
import time
from multi_symbol_scanner import scan_all_markets

while True:
    # 每 5 分钟扫描一次
    results = scan_all_markets(
        exchanges=["binance"],
        timeframe="5m",
        max_workers=10,
    )
    
    # 处理信号
    for exchange, signals in results.items():
        for signal in signals:
            print(f"发现信号: {signal['symbol']} - {signal['side']}")
            # TODO: 执行交易逻辑
    
    time.sleep(300)  # 5 分钟
```

### 方法 2：事件驱动

```python
from multi_symbol_scanner import scan_multiple_symbols

def on_new_bar(symbols):
    """新 K 线事件"""
    signals = scan_multiple_symbols(
        symbols=symbols,
        exchange="binance",
        timeframe="5m",
        max_workers=5,
    )
    
    # 处理信号
    for signal in signals:
        if signal['priority'] >= 70:
            print(f"高优先级信号: {signal['symbol']}")
            # TODO: 执行交易逻辑
```

## 性能优化

### 1. 调整并行数

```python
# CPU 密集型任务
max_workers = min(len(symbols), os.cpu_count() * 2)

# IO 密集型任务（API 调用）
max_workers = min(len(symbols), 20)
```

### 2. 缓存市场数据

```python
# 缓存 K 线数据，避免重复请求
from functools import lru_cache

@lru_cache(maxsize=100)
def get_klines_cached(symbol, timeframe):
    return get_klines(symbol, timeframe)
```

### 3. 批量请求

```python
# 如果交易所支持批量请求，优先使用
symbols_batch = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]
klines_batch = get_klines_batch(symbols_batch, "5m")
```

## 监控和日志

### 扫描统计

```python
from multi_symbol_scanner import scan_all_markets

results = scan_all_markets()

# 统计
total_symbols = sum(len(get_default_symbols(ex)) for ex in ["binance", "okx", "ctrader"])
total_signals = sum(len(signals) for signals in results.values())

print(f"扫描品种: {total_symbols}")
print(f"发现信号: {total_signals}")
print(f"信号率: {total_signals / total_symbols * 100:.1f}%")
```

### 性能监控

```python
import time

start = time.time()
results = scan_all_markets(max_workers=10)
elapsed = time.time() - start

print(f"扫描耗时: {elapsed:.2f}s")
print(f"平均每品种: {elapsed / total_symbols:.2f}s")
```

## 常见问题

### Q1: 扫描太慢怎么办？

A: 增加并行数：
```python
scan_all_markets(max_workers=20)  # 增加到 20
```

### Q2: 如何添加新品种？

A: 修改默认列表或传入自定义列表：
```python
custom_symbols = ["BTCUSDT", "ETHUSDT", "NEWCOIN"]
scan_multiple_symbols(symbols=custom_symbols)
```

### Q3: 如何只扫描特定交易所？

A: 指定交易所列表：
```python
scan_all_markets(exchanges=["binance"])
```

### Q4: 信号太多怎么办？

A: 提高过滤阈值：
```python
filter_signals(signals, min_priority=80.0, max_signals=2)
```

### Q5: 如何避免 API 限流？

A: 控制并行数和添加延迟：
```python
scan_multiple_symbols(max_workers=5)  # 降低并行数
time.sleep(0.1)  # 每次请求后延迟
```

## 示例输出

```
============================================================
多品种扫描结果
============================================================
总信号数: 3

【BINANCE】
------------------------------------------------------------
1. BTCUSDT - BUY
   优先级: 85.0
   市场状态: BO
   策略: T1-BO

2. ETHUSDT - SELL
   优先级: 72.5
   市场状态: TC
   策略: T2-PB

3. SOLUSDT - BUY
   优先级: 68.0
   市场状态: TC
   策略: T3-EMA

============================================================
```

## 总结

多品种并行扫描模块提供了：
- ✅ 高效的并行扫描
- ✅ 统一的信号输出
- ✅ 智能的优先级排序
- ✅ 灵活的过滤机制
- ✅ 多交易所支持

使用建议：
1. 从少量品种开始（5-10 个）
2. 逐步增加并行数
3. 根据信号质量调整过滤阈值
4. 监控性能和 API 限流
5. 定期更新品种列表

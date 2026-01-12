# TradeCat Documentation

**Quantitative Trading for Everyone**

TradeCat is a comprehensive quantitative trading toolkit that provides:

- 📊 **Market Data** - Fetch K-lines from multiple exchanges
- 📈 **Technical Indicators** - 38+ indicators with TA-Lib acceleration
- 🔔 **Signal Detection** - Automated trading signals
- 🤖 **AI Analysis** - LLM-powered market analysis

## Quick Start

```bash
pip install tradecat
```

```python
from tradecat import Data, Indicators, Signals

# Fetch data
df = Data.klines("BTCUSDT", interval="1h", days=30)

# Calculate indicators
ind = Indicators(df)
df["rsi"] = ind.rsi()
df["macd"], df["signal"], df["hist"] = ind.macd()

# Detect signals
signals = Signals.detect("BTCUSDT")
for s in signals:
    print(f"{s['name']}: {s['type']} ({s['level']})")
```

## Installation Options

```bash
# Basic installation
pip install tradecat

# With TA-Lib (faster indicators)
pip install tradecat[full]

# With AI support
pip install tradecat[ai]

# Everything
pip install tradecat[all]
```

## Features

### Data Module

```python
from tradecat import Data

# Single symbol
df = Data.klines("BTCUSDT", "1h", days=30)

# Multiple symbols
df = Data.klines(["BTCUSDT", "ETHUSDT"], "1d", days=365)

# Get current ticker
ticker = Data.ticker("BTCUSDT")
print(f"Price: ${ticker['price']:,.2f}")

# List available symbols
symbols = Data.symbols()
```

### Indicators Module

```python
from tradecat import Data, Indicators

df = Data.klines("BTCUSDT", "4h", days=30)
ind = Indicators(df)

# Individual indicators
rsi = ind.rsi(14)
macd, signal, hist = ind.macd(12, 26, 9)
upper, mid, lower = ind.bollinger(20, 2)
k, d, j = ind.kdj()
atr = ind.atr(14)

# All indicators at once
df_full = ind.all()
```

### Signals Module

```python
from tradecat import Signals

# Detect all signals
signals = Signals.detect("BTCUSDT", interval="1h")

# Filter by type
rsi_signals = Signals.detect("BTCUSDT", types=["rsi", "macd"])

# Get summary
summary = Signals.summary("BTCUSDT")
print(f"Bias: {summary['bias']}")
print(f"Bullish: {summary['bullish_count']}, Bearish: {summary['bearish_count']}")
```

### AI Module

```python
from tradecat import AI
import os

# Set API key
os.environ["OPENAI_API_KEY"] = "sk-..."

# Analyze
analysis = AI.analyze("BTCUSDT", model="gpt-4")
print(analysis.summary)
print(analysis.suggestion)

# Wyckoff analysis
analysis = AI.analyze("BTCUSDT", method="wyckoff")
print(analysis.wyckoff)
```

## Configuration

```python
from tradecat import Config

# Use local database
Config.set_database("postgresql://localhost:5434/market_data")
df = Data.klines("BTCUSDT", source="local")

# Set proxy
Config.set_proxy("http://127.0.0.1:7890")

# Set API credentials
Config.set_credentials(api_key="xxx", api_secret="yyy")
```

## Links

- [GitHub Repository](https://github.com/tukuaiai/tradecat)
- [PyPI Package](https://pypi.org/project/tradecat/)
- [Changelog](https://github.com/tukuaiai/tradecat/blob/main/CHANGELOG.md)
- [Contributing Guide](https://github.com/tukuaiai/tradecat/blob/main/CONTRIBUTING.md)

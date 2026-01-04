<p align="center">
  <img src="https://github.com/tukuaiai.png" alt="TradeCat" width="100px">
</p>

<div align="center">

# 🐱 TradeCat

**Crypto Data Analysis & Trading Platform**

*All markets, all strategies, all data, all methods - trade everything, monitor everything*

[简体中文](README.md) | English

---

<p>
  <img src="https://img.shields.io/badge/Python-3.10+-blue?style=flat-square&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/TimescaleDB-99GB-orange?style=flat-square&logo=postgresql&logoColor=white" alt="TimescaleDB">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License">
</p>

<p>
  <a href="https://t.me/tradecat_ai_channel"><img src="https://img.shields.io/badge/Telegram-Channel-blue?style=flat-square&logo=telegram" alt="Telegram"></a>
  <a href="https://t.me/glue_coding"><img src="https://img.shields.io/badge/Telegram-Community-blue?style=flat-square&logo=telegram" alt="Community"></a>
  <a href="https://x.com/123olp"><img src="https://img.shields.io/badge/Twitter-@123olp-black?style=flat-square&logo=x" alt="Twitter"></a>
</p>

</div>

---

## 📖 Table of Contents

- [✨ Features](#-features)
- [🏗️ Architecture](#️-architecture)
- [📊 Data Scale](#-data-scale)
- [📈 Technical Indicators](#-technical-indicators)
- [🤖 Telegram Bot](#-telegram-bot)
- [🚀 Quick Start](#-quick-start)
- [📁 Directory Structure](#-directory-structure)
- [🔧 Operations Guide](#-operations-guide)

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔄 Real-time Data Collection
- **WebSocket Streaming** - Binance Futures all symbols
- **Multi-timeframe** - 1m/5m/15m/1h/4h/1d/1w
- **Futures Metrics** - OI, Long/Short Ratio, Funding Rate
- **Latency** - < 5 seconds

</td>
<td width="50%">

### 📊 38 Technical Indicators
- **Trend** - EMA/MACD/SuperTrend/ADX
- **Momentum** - RSI/KDJ/CCI/MFI
- **Volatility** - Bollinger/ATR/Keltner
- **Patterns** - 61 candlestick + price patterns

</td>
</tr>
<tr>
<td width="50%">

### 🤖 Telegram Bot
- **Live Rankings** - 20+ ranking cards
- **Signal Alerts** - Pattern breakouts, indicator anomalies
- **Interactive Query** - Single token details
- **AI Analysis** - Wyckoff-based deep analysis

</td>
<td width="50%">

### 🗄️ Massive Data Storage
- **Candle Data** - 373M records (2018-present)
- **Futures Data** - 94M records (2021-present)
- **Storage Engine** - TimescaleDB time-series optimized
- **Compressed Backup** - zstd ~15GB

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
                              ┌─────────────────────────────────────────┐
                              │            Binance Exchange API          │
                              │   WebSocket Candles  │  REST Futures     │
                              └────────┬─────────────┴──────────┬────────┘
                                       │                        │
                    ┌──────────────────▼────────────────────────▼──────────────────┐
                    │                    data-service                              │
                    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
                    │  │  backfill   │  │    live     │  │   metrics   │          │
                    │  │  Gap Fill   │  │  WebSocket  │  │  Futures    │          │
                    │  └─────────────┘  └─────────────┘  └─────────────┘          │
                    └──────────────────────────┬───────────────────────────────────┘
                                               │
                    ┌──────────────────────────▼───────────────────────────────────┐
                    │                     TimescaleDB                              │
                    │  ┌─────────────────────┐  ┌─────────────────────┐           │
                    │  │    candles_1m       │  │  futures_metrics    │           │
                    │  │   373M rows / 99GB  │  │  94M rows / 5GB     │           │
                    │  └─────────────────────┘  └─────────────────────┘           │
                    └──────────────────────────┬───────────────────────────────────┘
                                               │
                    ┌──────────────────────────▼───────────────────────────────────┐
                    │                   trading-service                            │
                    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
                    │  │   engine    │  │ indicators  │  │  scheduler  │          │
                    │  │  Compute    │  │  38 types   │  │  Cron Jobs  │          │
                    │  └─────────────┘  └─────────────┘  └─────────────┘          │
                    └──────────────────────────┬───────────────────────────────────┘
                                               │
                    ┌──────────────────────────▼───────────────────────────────────┐
                    │                    market_data.db                            │
                    │              SQLite Indicator Results (38 tables)            │
                    └──────────────────────────┬───────────────────────────────────┘
                                               │
          ┌────────────────────────────────────┼────────────────────────────────────┐
          │                                    │                                    │
          ▼                                    ▼                                    ▼
┌─────────────────────┐          ┌─────────────────────┐          ┌─────────────────────┐
│  telegram-service   │          │    ai-service       │          │   order-service     │
│  ┌───────────────┐  │          │  ┌───────────────┐  │          │  ┌───────────────┐  │
│  │  Bot + Cards  │  │          │  │  LLM Analysis │  │          │  │ Market Maker  │  │
│  └───────────────┘  │          │  └───────────────┘  │          │  └───────────────┘  │
└─────────────────────┘          └─────────────────────┘          └─────────────────────┘
          │
          ▼
┌─────────────────────┐
│   Telegram Users    │
└─────────────────────┘
```

### Services

| Service | Description | Tech Stack |
|:---|:---|:---|
| **data-service** | WebSocket candles, futures metrics, gap backfill | Python, asyncio, ccxt |
| **trading-service** | 38 technical indicators, scheduling | Python, pandas, TA-Lib |
| **telegram-service** | Bot interaction, rankings, signals | python-telegram-bot |
| **ai-service** | LLM-powered market analysis | Gemini API |
| **order-service** | Trade execution, Avellaneda-Stoikov MM | Python, ccxt |
| **TimescaleDB** | Time-series storage | PostgreSQL 16 + TimescaleDB |

---

## 📊 Data Scale

| Dataset | Records | Symbols | Time Range | Storage |
|:---|---:|---:|:---|---:|
| **Candles (1m)** | 373,342,599 | 615 | 2018-01 ~ present | 99 GB |
| **Futures Metrics** | 94,576,458 | 612 | 2021-12 ~ present | 5 GB |

### Historical Data Download

Full dataset available on HuggingFace:

🔗 **Dataset**: [huggingface.co/datasets/123olp/binance-futures-ohlcv-2018-2026](https://huggingface.co/datasets/123olp/binance-futures-ohlcv-2018-2026)

```bash
# Import candles
zstd -d candles_1m.bin.zst -c | psql -h localhost -p 5433 -U postgres -d market_data \
    -c "COPY market_data.candles_1m FROM STDIN WITH (FORMAT binary)"
```

---

## 📈 Technical Indicators

### 38 Indicators by Category

| Category | Indicators |
|:---|:---|
| **Trend (8)** | EMA, MACD, SuperTrend, ADX, Ichimoku, Donchian, Keltner, Trendlines |
| **Momentum (6)** | RSI, KDJ, CCI, WilliamsR, MFI, RSI Harmonic |
| **Volatility (4)** | Bollinger Bands, ATR, Support/Resistance, ATR Volatility |
| **Volume (6)** | OBV, CVD, VWAP, Volume Ratio, Liquidity, VPVR |
| **Futures (8)** | Open Interest, OI Value, Long/Short Ratio, Taker Ratio, Funding Rate, Liquidations, Sentiment Aggregate |
| **Patterns (61+)** | TA-Lib candlestick patterns + Head & Shoulders, Double Top/Bottom, Triangles, Wedges |

---

## 🤖 Telegram Bot

### Commands & Triggers

| Trigger | Function | Description |
|:---|:---|:---|
| `BTC!` | Single Token Query | Interactive multi-panel view |
| `BTC!!` | Full TXT Export | Download complete psql-style report |
| `BTC@` | AI Analysis | Wyckoff-based deep market analysis |
| `/data` | Data Panel | Access ranking cards |
| `/ai` | AI Analysis | Start AI coin selection |
| `/query` | Coin Query | Show available symbols |
| `/help` | Help | Usage instructions |

### Keyboard Layout

```
┌─────────────┬─────────────┬─────────────┐
│ 📊 Data     │ 🔍 Query    │  🤖 AI      │
├─────────────┴──────┬──────┴─────────────┤
│     🏠 Menu        │      ℹ️ Help       │
└────────────────────┴────────────────────┘
```

### Single Token Query Panels

1. **Basic** - Bollinger, KDJ, MACD, RSI, OBV, Volume Ratio
2. **Futures** - OI, Long/Short Ratio, Sentiment
3. **Advanced** - Support/Resistance, ATR, Liquidity, Trend, VWAP
4. **Patterns** - K-line pattern detection (61 types)

---

## 🚀 Quick Start

### Requirements

| Dependency | Version |
|:---|:---|
| Python | 3.10+ |
| PostgreSQL | 16+ with TimescaleDB |
| TA-Lib | 0.4+ |

### Installation

```bash
# Clone
git clone https://github.com/tukuaiai/tradecat.git
cd tradecat

# Install TA-Lib (Ubuntu/Debian)
wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz
tar -xzf ta-lib-0.4.0-src.tar.gz
cd ta-lib && ./configure --prefix=/usr && make && sudo make install
cd .. && rm -rf ta-lib ta-lib-0.4.0-src.tar.gz

# Initialize all services
./scripts/init.sh

# Configure
cp config/.env.example config/.env
vim config/.env  # Set BOT_TOKEN, DATABASE_URL, etc.

# Start (daemon mode with auto-restart)
./scripts/start.sh start

# Check status
./scripts/start.sh status
```

---

## 📁 Directory Structure

```
tradecat/
├── config/                     # Unified configuration
│   ├── .env                    # Production config (gitignored)
│   └── .env.example            # Template
│
├── scripts/                    # Global scripts
│   ├── init.sh                 # Initialize services
│   ├── start.sh                # Start/stop/status
│   └── verify.sh               # Verification
│
├── services/                   # Microservices
│   ├── data-service/           # Data collection
│   ├── trading-service/        # Indicator computation
│   ├── telegram-service/       # Telegram Bot
│   ├── ai-service/             # AI analysis
│   └── order-service/          # Trade execution
│
├── libs/
│   ├── database/               # SQLite indicator data
│   └── common/                 # Shared utilities
│
└── backups/                    # Database backups
```

---

## 🔧 Operations Guide

### Service Management

```bash
# Start all (daemon mode - auto restart on crash)
./scripts/start.sh start

# Status
./scripts/start.sh status

# Stop all
./scripts/start.sh stop

# Restart
./scripts/start.sh restart
```

### Database

```bash
# Connect to TimescaleDB
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d market_data

# Check candle count
SELECT COUNT(*) FROM market_data.candles_1m;

# Connect to SQLite (indicators)
sqlite3 libs/database/services/telegram-service/market_data.db
```

### Logs

```bash
# data-service
tail -f services/data-service/logs/ws.log
tail -f services/data-service/logs/backfill.log

# trading-service
tail -f services/trading-service/logs/simple_scheduler.log

# telegram-service
tail -f services/telegram-service/logs/bot.log
```

---

## 📞 Contact

- **Telegram Channel**: [@tradecat_ai_channel](https://t.me/tradecat_ai_channel)
- **Community**: [@glue_coding](https://t.me/glue_coding)
- **Twitter/X**: [@123olp](https://x.com/123olp)

### Support the Project

- **Binance UID**: `572155580`
- **Tron (TRC20)**: `TQtBXCSTwLFHjBqTS4rNUp7ufiGx51BRey`
- **Solana**: `HjYhozVf9AQmfv7yv79xSNs6uaEU5oUk2USasYQfUYau`
- **Ethereum (ERC20)**: `0xa396923a71ee7D9480b346a17dDeEb2c0C287BBC`

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Made with ❤️ by [tukuaiai](https://github.com/tukuaiai)**

</div>

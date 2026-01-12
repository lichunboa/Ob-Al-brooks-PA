# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Backtest engine (planned)
- Strategy DSL (planned)
- Web Dashboard (planned)

## [0.1.0] - 2024-01-12

### Added
- **Data Module** (`tradecat.Data`)
  - K-line (OHLCV) data fetching from Binance
  - Support for multiple symbols and intervals
  - Local database support (PostgreSQL/TimescaleDB)
  - Ticker and symbols list API

- **Indicators Module** (`tradecat.Indicators`)
  - 17+ technical indicators with pure Python fallback
  - Trend: SMA, EMA, WMA, MACD, ADX
  - Momentum: RSI, KDJ, CCI, Williams %R, MFI
  - Volatility: ATR, Bollinger Bands, Keltner Channel, Donchian Channel
  - Volume: OBV, VWAP, CVD
  - Optional TA-Lib acceleration

- **Signals Module** (`tradecat.Signals`)
  - Automated signal detection
  - RSI overbought/oversold
  - MACD crossovers and divergences
  - Bollinger Band touches and squeezes
  - KDJ crossovers
  - EMA crossovers
  - Volume spikes
  - Signal summary with bias calculation

- **AI Module** (`tradecat.AI`)
  - Multi-model support: OpenAI, Anthropic, Google, DeepSeek
  - Technical analysis with market context
  - Wyckoff methodology analysis
  - Structured analysis output

- **Configuration** (`tradecat.Config`)
  - Database configuration
  - API credentials management
  - Proxy support
  - Environment variable loading

- **Infrastructure**
  - PyPI package structure (src-layout)
  - Type hints (PEP 561)
  - Comprehensive test suite
  - CI/CD with GitHub Actions
  - Multi-platform support (Linux, macOS, Windows)
  - Python 3.9-3.13 compatibility

### Dependencies
- Core: pandas, numpy, requests
- Optional: ccxt, TA-Lib, sqlalchemy, psycopg
- AI: openai, anthropic, google-generativeai

[Unreleased]: https://github.com/tukuaiai/tradecat/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tukuaiai/tradecat/releases/tag/v0.1.0

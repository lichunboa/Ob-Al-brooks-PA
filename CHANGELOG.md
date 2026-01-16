# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Backtest engine (planned)
- Strategy DSL (planned)
- Web Dashboard (planned)

---

## [0.5.0] - 2026-01-16

### Added
- **API Service** - New CoinGlass-compatible REST API
  - Align with CoinGlass API V4 specification
  - Inherit global SYMBOLS_GROUPS configuration for supported-coins
  - Add API call examples documentation

### Fixed
- Unify parameter validation error response format

---

## [0.4.0] - 2026-01-15

### Added
- Unified instant response for all Telegram button callbacks
- Async full engine for trading-service

### Fixed
- EMA parse_mode and KDJ settings signature
- Hard switch for env manager security

### Changed
- Update market analysis prompts for AI service
- Disable env manager UI and command for security
- Remove outdated documentation files

---

## [0.3.0] - 2026-01-14

### Added
- Data freshness check for signal-service to skip stale data
- Upgrade default AI model to gemini-3-flash-preview

### Fixed
- Telegram callbacks for futures depth/oi/funding cards
- Signal-service honor env symbol whitelist in sqlite engine
- Ranking card callbacks hardening
- Disable markdown parse for EMA/VWAP cards
- Trading-service align df columns to table

### Documentation
- Add Gemini headless guide and ProxyCast config

---

## [0.2.9] - 2026-01-13

### Fixed
- Per-symbol latest rows for metrics (avoid drop on staggered timestamps)
- EMA card uses table data for selected period
- Refresh last update per fetch not global max
- Time display uses dataset timestamp
- Signal-service translate pushes, persist cooldown, escape sqlite columns

### Documentation
- Remove misleading --days 365 option
- Add cryptocurrency wallet addresses

---

## [0.2.8] - 2026-01-12

### Added
- HuggingFace data download script and deploy prompt

### Fixed
- Remove inline comments from logrotate.conf
- Address deployment audit findings
- Add lang parameter to _load_rows methods
- i18n improvements and daemon health check

### Changed
- Remove dead Binance API code from telegram-service
- Remove Binance API dependency

---

## [0.2.7] - 2026-01-11

### Added
- **Signal Service** - Extract signals module as independent service (129 rules)
- **Fate Service** - Add fate-engine to services-preview
- Symbols config inheritance from config/.env

### Changed
- Decouple ai-service from telegram dependency
- Use signal-service via adapter layer in telegram-service
- Standardize project structure for all services

### Fixed
- Fate-service path management and database module
- Add tests directory with conftest.py for fate-service

---

## [0.2.6] - 2026-01-10

### Added
- **Signal Engine** - TimescaleDB-based signal engine for real-time PG data
- 20 core signal rules for high-value low-noise alerts
- PG signal formatter with clean templates
- Signal history query UI
- Telegram admin config panel and user management
- Sliding window retention plan and DDL script

### Fixed
- SQL injection, event loop, and history vulnerabilities in signals
- Inherit symbols from SYMBOLS_GROUPS env config

### Security
- Signal engine audit reports and security fixes

---

## [0.2.5] - 2026-01-09

### Added
- **Visualization Service** - 6 intraday analysis chart templates
- Bollinger Band zone strip template
- Docker support with improved Dockerfile and entrypoint
- Order book collector with hybrid snapshot storage
- Order_book continuous aggregates (1m/1h)
- Latency monitoring and heartbeat detection for order book collector
- i18n translations for visualization module (zh_CN/en)
- English Wyckoff master prompt for AI

### Fixed
- Docker security and service health checks
- Env UI duplicate icons

---

## [0.2.4] - 2026-01-08

### Added
- i18n support to ranking service and signal UI
- Apply i18n to all 38 ranking cards
- Card i18n helper module with translation functions
- VPVR-ridge OHLC horizontal candlestick format

### Changed
- VPVR-ridge uses joypy.joyplot for standardized ridge rendering
- Split services-preview for preview services

### Fixed
- VPVR-ridge OHLC logic corrections
- Add libs/common to ws.py path

---

## [0.2.3] - 2026-01-07

### Added
- bookDepth data import script for markets-service

---

## [0.2.2] - 2026-01-06

### Added
- Query command translations
- VPVR-zone-strip square root normalization for market cap

### Fixed
- Complete query i18n for all entry points

---

## [0.2.1] - 2026-01-05

### Added
- Complete i18n coverage (273 terms, 39/39 cards)
- App.py user messages i18n
- VPVR-zone-strip volume red-green gradient colors
- Matplotlib native legend for VPVR-zone-strip

---

## [0.2.0] - 2026-01-04

### Added
- **Predict Service** - Prediction market service (Node.js)
- Complete signal detection system with 129 rules
- Single token complete TXT export functionality
- K-pattern independent panel (bullish/bearish/neutral classification)
- Main menu token query button
- Token query and AI analysis to persistent keyboard
- AI indicator data compression optimization
- GitHub Actions CI and README Badges
- Issue and PR templates
- SECURITY.md

### Fixed
- Signal service SQL injection prevention (T1)
- User subscription SQLite persistence + callback whitelist verification (T2)
- Singleton thread-safe double-check lock (T3)
- Exception logging instead of silent swallowing (T4)
- Cooldown state SQLite persistence (T5)
- Log level correction debug->warning (T6)
- Token query and AI analysis keyboard response
- Bare except changed to except Exception (multiple services)

### Changed
- Clean up old signal files (engine.py/pusher.py/rules.py)
- Architecture diagram to Mermaid format

### Documentation
- Complete English README_EN.md
- WSL2 configuration guide (10GB memory + mirrored network)
- AI analysis details (Wyckoff methodology/professional prompts/DeepSeek)

---

## [0.1.9] - 2026-01-03

### Added
- **AI Service** - Complete AI analysis service with Wyckoff methodology
- Shared symbols management module
- Proxy manager (runtime retry + 1 hour cooldown)
- SQLite connection pool optimization
- IO/CPU split executor
- TimescaleDB compression strategy optimization
- Environment variable configuration management
- Symbol group management (main4/main6/main20/auto/all)
- High priority configuration - indicators/cards/interval switches
- Data-service backfill configuration
- FUNDING.yml for GitHub Sponsors

### Fixed
- Remove all hardcoded absolute paths
- Unified database default connection string to postgres:postgres
- Remove hardcoded proxy, use HTTP_PROXY environment variable
- Fix .env loading path for all services

### Changed
- Unified configuration management to config/.env
- Simplify resource flow card _load_rows
- Move install.sh to scripts directory
- Indicator safety refactoring - return results with status for insufficient data

### Performance
- SQLite connection reuse
- Batch K-line read/write optimization

---

## [0.1.8] - 2026-01-02

### Added
- Microservice initialization script
- Requirements.txt for all services
- SQLite append write + history retention + ranking deduplication
- Startup daemon script

### Changed
- Delete CSV read logic, unify to SQLite
- Remove libs/common, services fully independent
- Unified database location to libs/database/services/telegram-service/
- Remove telegram-service cross-service dependencies
- Rename crypto_trading_bot.py → main.py
- Delete unused realtime_service/kline_manager/kline_listener
- Remove wide table write logic, keep only market_data.db

### Fixed
- Path audit fixes
- Order-service config directory structure
- DB __init__.py import fixes

---

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

---

[Unreleased]: https://github.com/tukuaiai/tradecat/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/tukuaiai/tradecat/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/tukuaiai/tradecat/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/tukuaiai/tradecat/compare/v0.2.9...v0.3.0
[0.2.9]: https://github.com/tukuaiai/tradecat/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/tukuaiai/tradecat/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/tukuaiai/tradecat/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/tukuaiai/tradecat/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/tukuaiai/tradecat/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/tukuaiai/tradecat/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/tukuaiai/tradecat/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/tukuaiai/tradecat/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/tukuaiai/tradecat/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/tukuaiai/tradecat/compare/v0.1.9...v0.2.0
[0.1.9]: https://github.com/tukuaiai/tradecat/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/tukuaiai/tradecat/compare/v0.1.0...v0.1.8
[0.1.0]: https://github.com/tukuaiai/tradecat/releases/tag/v0.1.0

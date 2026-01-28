-- ============================================================
-- AL Brooks Trading Console - Database Initialization
-- ============================================================
-- Based on TradeCat schema design (MIT License)
-- ============================================================

-- Create schemas
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS agg;
CREATE SCHEMA IF NOT EXISTS quality;
CREATE SCHEMA IF NOT EXISTS market_data;

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================
-- Raw Layer: 1-minute K-line data
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.crypto_kline_1m (
    symbol VARCHAR(20) NOT NULL,
    open_time TIMESTAMPTZ NOT NULL,
    open NUMERIC(20, 8) NOT NULL,
    high NUMERIC(20, 8) NOT NULL,
    low NUMERIC(20, 8) NOT NULL,
    close NUMERIC(20, 8) NOT NULL,
    volume NUMERIC(30, 8) NOT NULL,
    quote_volume NUMERIC(30, 8) NOT NULL,
    trades INTEGER NOT NULL,
    taker_buy_volume NUMERIC(30, 8),
    taker_buy_quote_volume NUMERIC(30, 8),
    batch_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, open_time)
);

-- Convert to hypertable
SELECT create_hypertable('raw.crypto_kline_1m', 'open_time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ============================================================
-- Raw Layer: Futures metrics (5-minute)
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.futures_metrics_5m (
    symbol VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    open_interest NUMERIC(30, 8),
    open_interest_value NUMERIC(30, 2),
    long_short_ratio NUMERIC(10, 4),
    top_trader_long_short_account NUMERIC(10, 4),
    top_trader_long_short_position NUMERIC(10, 4),
    funding_rate NUMERIC(20, 10),
    liquidation_long NUMERIC(30, 2),
    liquidation_short NUMERIC(30, 2),
    batch_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, timestamp)
);

SELECT create_hypertable('raw.futures_metrics_5m', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ============================================================
-- Aggregated Layer: Multi-timeframe K-lines
-- ============================================================
CREATE TABLE IF NOT EXISTS agg.crypto_kline (
    symbol VARCHAR(20) NOT NULL,
    interval VARCHAR(10) NOT NULL,
    open_time TIMESTAMPTZ NOT NULL,
    open NUMERIC(20, 8) NOT NULL,
    high NUMERIC(20, 8) NOT NULL,
    low NUMERIC(20, 8) NOT NULL,
    close NUMERIC(20, 8) NOT NULL,
    volume NUMERIC(30, 8) NOT NULL,
    quote_volume NUMERIC(30, 8) NOT NULL,
    trades INTEGER NOT NULL,
    taker_buy_volume NUMERIC(30, 8),
    taker_buy_quote_volume NUMERIC(30, 8),
    sma_20 NUMERIC(20, 8),
    ema_20 NUMERIC(20, 8),
    rsi_14 NUMERIC(10, 4),
    macd NUMERIC(20, 8),
    macd_signal NUMERIC(20, 8),
    macd_hist NUMERIC(20, 8),
    bb_upper NUMERIC(20, 8),
    bb_middle NUMERIC(20, 8),
    bb_lower NUMERIC(20, 8),
    atr_14 NUMERIC(20, 8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, interval, open_time)
);

SELECT create_hypertable('agg.crypto_kline', 'open_time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- ============================================================
-- Quality Layer: Data lineage and batch tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS quality.batch_runs (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    rows_processed INTEGER DEFAULT 0,
    rows_failed INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS quality.data_quality_checks (
    check_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES quality.batch_runs(batch_id),
    check_name VARCHAR(100) NOT NULL,
    check_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    passed BOOLEAN NOT NULL,
    details JSONB
);

-- ============================================================
-- Market Data Layer: TradeCat data-service compatible tables
-- ============================================================

-- K线数据表 (data-service 使用的表结构)
CREATE TABLE IF NOT EXISTS market_data.candles_1m (
    exchange VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    bucket_ts TIMESTAMPTZ NOT NULL,
    open NUMERIC(20, 8) NOT NULL,
    high NUMERIC(20, 8) NOT NULL,
    low NUMERIC(20, 8) NOT NULL,
    close NUMERIC(20, 8) NOT NULL,
    volume NUMERIC(30, 8) NOT NULL,
    quote_volume NUMERIC(30, 8),
    trade_count INTEGER,
    is_closed BOOLEAN DEFAULT TRUE,
    source VARCHAR(50),
    taker_buy_volume NUMERIC(30, 8),
    taker_buy_quote_volume NUMERIC(30, 8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (exchange, symbol, bucket_ts)
);

SELECT create_hypertable('market_data.candles_1m', 'bucket_ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- 期货指标数据表 (Binance Futures metrics)
CREATE TABLE IF NOT EXISTS market_data.binance_futures_metrics_5m (
    symbol VARCHAR(20) NOT NULL,
    exchange VARCHAR(50) NOT NULL DEFAULT 'binance_futures_um',
    create_time TIMESTAMPTZ NOT NULL,
    sum_open_interest NUMERIC(30, 8),
    sum_open_interest_value NUMERIC(30, 2),
    count_toptrader_long_short_ratio NUMERIC(10, 4),
    sum_toptrader_long_short_ratio NUMERIC(10, 4),
    count_long_short_ratio NUMERIC(10, 4),
    sum_taker_long_short_vol_ratio NUMERIC(10, 4),
    source VARCHAR(50) DEFAULT 'binance_api',
    is_closed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, create_time)
);

SELECT create_hypertable('market_data.binance_futures_metrics_5m', 'create_time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ============================================================
-- Indexes for common queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_raw_kline_symbol ON raw.crypto_kline_1m (symbol);
CREATE INDEX IF NOT EXISTS idx_agg_kline_symbol_interval ON agg.crypto_kline (symbol, interval);
CREATE INDEX IF NOT EXISTS idx_futures_symbol ON raw.futures_metrics_5m (symbol);

-- ============================================================
-- Views for easy querying
-- ============================================================
CREATE OR REPLACE VIEW market_data.latest_prices AS
SELECT DISTINCT ON (symbol)
    symbol,
    close as price,
    open_time as timestamp,
    volume,
    quote_volume
FROM raw.crypto_kline_1m
ORDER BY symbol, open_time DESC;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA raw TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA agg TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA quality TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA market_data TO postgres;
GRANT USAGE ON ALL SCHEMAS TO postgres;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'AL Brooks Trading Console database initialized successfully!';
END $$;

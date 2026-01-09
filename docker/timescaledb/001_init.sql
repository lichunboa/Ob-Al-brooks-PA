-- =============================================================================
-- TradeCat TimescaleDB 初始化脚本（对齐生产库 5433）
-- 版本: 2026-01-09
-- 依赖: TimescaleDB 2.x+
-- =============================================================================

-- 启用 TimescaleDB 扩展
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 创建 schema
CREATE SCHEMA IF NOT EXISTS market_data;

-- =============================================================================
-- 1. 核心表: candles_1m (1分钟K线)
-- =============================================================================
CREATE TABLE IF NOT EXISTS market_data.candles_1m (
    exchange               TEXT                     NOT NULL,
    symbol                 TEXT                     NOT NULL,
    bucket_ts              TIMESTAMPTZ              NOT NULL,
    open                   NUMERIC(38,12)           NOT NULL,
    high                   NUMERIC(38,12)           NOT NULL,
    low                    NUMERIC(38,12)           NOT NULL,
    close                  NUMERIC(38,12)           NOT NULL,
    volume                 NUMERIC(38,12)           NOT NULL,
    quote_volume           NUMERIC(38,12),
    trade_count            BIGINT,
    is_closed              BOOLEAN                  NOT NULL DEFAULT FALSE,
    source                 TEXT                     NOT NULL DEFAULT 'binance_ws',
    ingested_at            TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    taker_buy_volume       NUMERIC(38,12),
    taker_buy_quote_volume NUMERIC(38,12),
    CONSTRAINT candles_1m_bucket_ts_check CHECK (bucket_ts = date_trunc('minute', bucket_ts)),
    CONSTRAINT candles_1m_exchange_check CHECK (exchange = 'binance_futures_um'),
    PRIMARY KEY (exchange, symbol, bucket_ts)
);

-- 转换为 hypertable
SELECT create_hypertable(
    'market_data.candles_1m',
    'bucket_ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- =============================================================================
-- 2. 核心表: binance_futures_metrics_5m (期货指标)
-- =============================================================================
CREATE TABLE IF NOT EXISTS market_data.binance_futures_metrics_5m (
    create_time                      TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    symbol                           TEXT                        NOT NULL,
    sum_open_interest                NUMERIC,
    sum_open_interest_value          NUMERIC,
    count_toptrader_long_short_ratio NUMERIC,
    sum_toptrader_long_short_ratio   NUMERIC,
    count_long_short_ratio           NUMERIC,
    sum_taker_long_short_vol_ratio   NUMERIC,
    exchange                         TEXT NOT NULL DEFAULT 'binance_futures_um',
    source                           TEXT NOT NULL DEFAULT 'binance_zip',
    is_closed                        BOOLEAN NOT NULL DEFAULT TRUE,
    ingested_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_metrics_5m_bucket CHECK (
        create_time = date_trunc('minute', create_time)
        AND (EXTRACT(MINUTE FROM create_time)::int % 5 = 0)
    )
);

SELECT create_hypertable(
    'market_data.binance_futures_metrics_5m',
    'create_time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- 唯一约束
DO $$
BEGIN
    ALTER TABLE market_data.binance_futures_metrics_5m
        ADD CONSTRAINT uq_metrics_5m UNIQUE (symbol, create_time);
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_metrics_5m_symbol_time
    ON market_data.binance_futures_metrics_5m(symbol, create_time DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_5m_exchange_symbol_time
    ON market_data.binance_futures_metrics_5m(exchange, symbol, create_time DESC);

-- =============================================================================
-- 3. 辅助表: ingest_offsets (断点续传)
-- =============================================================================
CREATE TABLE IF NOT EXISTS market_data.ingest_offsets (
    exchange            TEXT        NOT NULL,
    symbol              TEXT        NOT NULL,
    interval            TEXT        NOT NULL
                        CHECK (interval IN (
                            '1m','3m','5m','15m','30m',
                            '1h','2h','4h','6h','12h',
                            '1d','1w','1M'
                        )),
    last_closed_ts      TIMESTAMPTZ,
    last_partial_ts     TIMESTAMPTZ,
    last_reconciled_at  TIMESTAMPTZ,
    PRIMARY KEY (exchange, symbol, interval)
);

-- =============================================================================
-- 4. 辅助表: missing_intervals (缺口追踪)
-- =============================================================================
CREATE TABLE IF NOT EXISTS market_data.missing_intervals (
    id           BIGSERIAL PRIMARY KEY,
    exchange     TEXT        NOT NULL,
    symbol       TEXT        NOT NULL,
    interval     TEXT        NOT NULL,
    gap_start    TIMESTAMPTZ NOT NULL,
    gap_end      TIMESTAMPTZ NOT NULL,
    detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status       TEXT        NOT NULL DEFAULT 'pending',
    retry_count  INTEGER     NOT NULL DEFAULT 0,
    last_error   TEXT
);

CREATE INDEX IF NOT EXISTS idx_missing_intervals_status
    ON market_data.missing_intervals(status, detected_at);

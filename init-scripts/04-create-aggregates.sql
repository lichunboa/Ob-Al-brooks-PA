-- ============================================================
-- Continuous Aggregates for Multi-Timeframe Candles
-- ============================================================

-- 5 Minute Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS market_data.candles_5m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', bucket_ts) AS bucket_ts,
    symbol,
    exchange,
    first(open, bucket_ts) as open,
    max(high) as high,
    min(low) as low,
    last(close, bucket_ts) as close,
    sum(volume) as volume,
    sum(quote_volume) as quote_volume,
    sum(trade_count) as trade_count,
    sum(taker_buy_volume) as taker_buy_volume,
    sum(taker_buy_quote_volume) as taker_buy_quote_volume,
    bool_and(is_closed) as is_closed
FROM market_data.candles_1m
GROUP BY time_bucket('5 minutes', bucket_ts), symbol, exchange;

-- Policy: Refresh last 1 hour every 1 minute
SELECT add_continuous_aggregate_policy('market_data.candles_5m',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '0 minutes',
    schedule_interval => INTERVAL '1 minute');

-- 15 Minute Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS market_data.candles_15m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('15 minutes', bucket_ts) AS bucket_ts,
    symbol,
    exchange,
    first(open, bucket_ts) as open,
    max(high) as high,
    min(low) as low,
    last(close, bucket_ts) as close,
    sum(volume) as volume,
    sum(quote_volume) as quote_volume,
    sum(trade_count) as trade_count,
    sum(taker_buy_volume) as taker_buy_volume,
    sum(taker_buy_quote_volume) as taker_buy_quote_volume,
    bool_and(is_closed) as is_closed
FROM market_data.candles_1m
GROUP BY time_bucket('15 minutes', bucket_ts), symbol, exchange;

SELECT add_continuous_aggregate_policy('market_data.candles_15m',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '0 minutes',
    schedule_interval => INTERVAL '1 minute');

-- 1 Hour Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS market_data.candles_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', bucket_ts) AS bucket_ts,
    symbol,
    exchange,
    first(open, bucket_ts) as open,
    max(high) as high,
    min(low) as low,
    last(close, bucket_ts) as close,
    sum(volume) as volume,
    sum(quote_volume) as quote_volume,
    sum(trade_count) as trade_count,
    sum(taker_buy_volume) as taker_buy_volume,
    sum(taker_buy_quote_volume) as taker_buy_quote_volume,
    bool_and(is_closed) as is_closed
FROM market_data.candles_1m
GROUP BY time_bucket('1 hour', bucket_ts), symbol, exchange;

SELECT add_continuous_aggregate_policy('market_data.candles_1h',
    start_offset => INTERVAL '12 hours',
    end_offset => INTERVAL '0 minutes',
    schedule_interval => INTERVAL '10 minutes');

-- 4 Hour Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS market_data.candles_4h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('4 hours', bucket_ts) AS bucket_ts,
    symbol,
    exchange,
    first(open, bucket_ts) as open,
    max(high) as high,
    min(low) as low,
    last(close, bucket_ts) as close,
    sum(volume) as volume,
    sum(quote_volume) as quote_volume,
    sum(trade_count) as trade_count,
    sum(taker_buy_volume) as taker_buy_volume,
    sum(taker_buy_quote_volume) as taker_buy_quote_volume,
    bool_and(is_closed) as is_closed
FROM market_data.candles_1m
GROUP BY time_bucket('4 hours', bucket_ts), symbol, exchange;

SELECT add_continuous_aggregate_policy('market_data.candles_4h',
    start_offset => INTERVAL '2 days',
    end_offset => INTERVAL '0 minutes',
    schedule_interval => INTERVAL '30 minutes');

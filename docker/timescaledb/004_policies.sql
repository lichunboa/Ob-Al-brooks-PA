-- =============================================================================
-- TradeCat TimescaleDB 策略配置（对齐生产库）
-- 压缩策略 + 保留策略
-- =============================================================================

-- =============================================================================
-- 压缩策略（生产配置：30天后压缩）
-- =============================================================================

-- candles_1m 压缩配置
ALTER TABLE IF EXISTS market_data.candles_1m
    SET (timescaledb.compress = TRUE,
         timescaledb.compress_segmentby = 'exchange,symbol',
         timescaledb.compress_orderby = 'bucket_ts');

DO $$
BEGIN
    PERFORM add_compression_policy('market_data.candles_1m', INTERVAL '30 days');
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- binance_futures_metrics_5m 压缩配置
ALTER TABLE IF EXISTS market_data.binance_futures_metrics_5m
    SET (timescaledb.compress = TRUE,
         timescaledb.compress_segmentby = 'symbol',
         timescaledb.compress_orderby = 'create_time DESC');

DO $$
BEGIN
    PERFORM add_compression_policy('market_data.binance_futures_metrics_5m', INTERVAL '30 days');
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

-- =============================================================================
-- 保留策略（生产配置：各周期不同保留时长）
-- =============================================================================

-- 注意：保留策略应用于连续聚合的物化表
-- 生产库实际配置如下：

DO $$
DECLARE
    cfg RECORD;
BEGIN
    FOR cfg IN
        SELECT * FROM (VALUES
            ('candles_3m',  '25 hours'::interval),
            ('candles_5m',  '1 day 17 hours 40 minutes'::interval),
            ('candles_15m', '5 days 5 hours'::interval),
            ('candles_30m', '10 days 10 hours'::interval),
            ('candles_1h',  '20 days 20 hours'::interval),
            ('candles_2h',  '41 days 16 hours'::interval),
            ('candles_4h',  '83 days 8 hours'::interval),
            ('candles_6h',  '125 days'::interval),
            ('candles_8h',  '166 days 16 hours'::interval),
            ('candles_12h', '250 days'::interval),
            ('candles_1d',  '500 days'::interval),
            ('candles_3d',  '1500 days'::interval),
            ('candles_1w',  '3500 days'::interval),
            ('candles_1M',  '15000 days'::interval)  -- ~41 years
        ) AS t(view_name, drop_after)
    LOOP
        BEGIN
            EXECUTE format(
                'SELECT add_retention_policy(''market_data.%I'', %L::interval);',
                cfg.view_name, cfg.drop_after
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END LOOP;
END$$;

-- =============================================================================
-- 数据质量视图
-- =============================================================================
CREATE OR REPLACE VIEW market_data.candle_data_quality AS
SELECT
    exchange,
    source,
    date(bucket_ts) AS data_date,
    count(*) AS total_records,
    count(*) FILTER (WHERE trade_count IS NOT NULL) AS non_null_trade_count,
    count(*) FILTER (WHERE taker_buy_volume IS NOT NULL) AS non_null_taker_buy_volume,
    count(*) FILTER (WHERE taker_buy_quote_volume IS NOT NULL) AS non_null_taker_buy_quote_volume,
    round(100.0 * count(*) FILTER (WHERE taker_buy_quote_volume IS NOT NULL) / count(*), 2) AS taker_buy_quote_volume_completeness,
    round(100.0 * count(*) FILTER (WHERE taker_buy_quote_volume > 0) / count(*), 2) AS taker_buy_quote_volume_nonzero_rate,
    min(bucket_ts) AS earliest_record,
    max(bucket_ts) AS latest_record
FROM market_data.candles_1m
WHERE exchange = 'binance_futures_um'
GROUP BY exchange, source, date(bucket_ts)
ORDER BY date(bucket_ts) DESC, exchange, source;

-- =============================================================================
-- 验证查询（可选执行）
-- =============================================================================
-- SELECT view_name FROM timescaledb_information.continuous_aggregates WHERE view_schema = 'market_data';
-- SELECT hypertable_name, config FROM timescaledb_information.jobs WHERE proc_name = 'policy_compression';
-- SELECT hypertable_name, config FROM timescaledb_information.jobs WHERE proc_name = 'policy_retention';

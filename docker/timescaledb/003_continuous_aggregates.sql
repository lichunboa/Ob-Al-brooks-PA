-- =============================================================================
-- TradeCat 连续聚合视图（对齐生产库）
-- K线: candles_3m ~ candles_1M (14个)
-- 指标: binance_futures_metrics_*_last (5个)
-- =============================================================================

SET search_path TO market_data, public;

-- =============================================================================
-- K线连续聚合创建函数
-- =============================================================================
CREATE OR REPLACE FUNCTION market_data._创建K线连续聚合(
    p_view_name       TEXT,
    p_bucket_interval INTERVAL,
    p_start_offset    INTERVAL,
    p_end_offset      INTERVAL,
    p_schedule        INTERVAL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    view_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM timescaledb_information.continuous_aggregates
        WHERE view_schema = 'market_data' AND view_name = p_view_name
    ) INTO view_exists;

    IF NOT view_exists THEN
        EXECUTE format($fmt$
            CREATE MATERIALIZED VIEW market_data.%I
            WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
            SELECT
                exchange,
                symbol,
                time_bucket(%L::interval, bucket_ts)           AS bucket_ts,
                first(open, bucket_ts)                         AS open,
                max(high)                                      AS high,
                min(low)                                       AS low,
                last(close, bucket_ts)                         AS close,
                sum(volume)                                    AS volume,
                sum(quote_volume)                              AS quote_volume,
                sum(trade_count)                               AS trade_count,
                bool_and(is_closed)                            AS is_closed,
                'cagg'                                         AS source,
                max(ingested_at)                               AS ingested_at,
                max(updated_at)                                AS updated_at,
                sum(taker_buy_volume)                          AS taker_buy_volume,
                sum(taker_buy_quote_volume)                    AS taker_buy_quote_volume
            FROM market_data.candles_1m
            GROUP BY exchange, symbol, time_bucket(%L::interval, bucket_ts);
        $fmt$, p_view_name, p_bucket_interval, p_bucket_interval);
    END IF;

    BEGIN
        EXECUTE format(
            'SELECT add_continuous_aggregate_policy(''market_data.%I'', start_offset => %L::interval, end_offset => %L::interval, schedule_interval => %L::interval);',
            p_view_name, p_start_offset, p_end_offset, p_schedule
        );
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END;
$$;

-- =============================================================================
-- 创建 K线连续聚合视图（生产配置：全部 1分钟调度，end_offset 1分钟）
-- =============================================================================
DO $$
DECLARE
    cfg RECORD;
BEGIN
    FOR cfg IN
        SELECT * FROM (VALUES
            ('candles_3m',  '3 minutes'::interval,  '7 days'::interval,   '1 minute'::interval,   '1 minute'::interval),
            ('candles_5m',  '5 minutes',            '7 days',             '1 minute',             '1 minute'),
            ('candles_15m', '15 minutes',           '7 days',             '1 minute',             '1 minute'),
            ('candles_30m', '30 minutes',           '7 days',             '1 minute',             '1 minute'),
            ('candles_1h',  '1 hour',               '7 days',             '1 minute',             '1 minute'),
            ('candles_2h',  '2 hours',              '7 days',             '1 minute',             '1 minute'),
            ('candles_4h',  '4 hours',              '7 days',             '1 minute',             '1 minute'),
            ('candles_6h',  '6 hours',              '7 days',             '1 minute',             '1 minute'),
            ('candles_8h',  '8 hours',              '7 days',             '1 minute',             '1 minute'),
            ('candles_12h', '12 hours',             '7 days',             '1 minute',             '1 minute'),
            ('candles_1d',  '1 day',                '14 days',            '1 minute',             '1 minute'),
            ('candles_3d',  '3 days',               '14 days',            '1 minute',             '1 minute'),
            ('candles_1w',  '7 days',               '30 days',            '1 minute',             '1 minute'),
            ('candles_1M',  '1 month',              '90 days',            '1 minute',             '1 minute')
        ) AS t(view_name, bucket_interval, start_offset, end_offset, schedule_interval)
    LOOP
        PERFORM market_data._创建K线连续聚合(cfg.view_name, cfg.bucket_interval, cfg.start_offset, cfg.end_offset, cfg.schedule_interval);
    END LOOP;
END$$;

-- =============================================================================
-- 指标连续聚合创建函数（生产命名：binance_futures_metrics_*_last）
-- =============================================================================
CREATE OR REPLACE FUNCTION market_data._create_metrics_cagg(
    p_view_name    TEXT,
    p_bucket       INTERVAL,
    p_start_offset INTERVAL,
    p_end_offset   INTERVAL,
    p_schedule     INTERVAL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    view_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM timescaledb_information.continuous_aggregates
        WHERE view_schema = 'market_data' AND view_name = p_view_name
    ) INTO view_exists;

    IF NOT view_exists THEN
        EXECUTE format($fmt$
            CREATE MATERIALIZED VIEW market_data.%I
            WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
            SELECT
                time_bucket(%L::interval, create_time) AS bucket,
                symbol,
                last(sum_open_interest, create_time)       AS sum_open_interest,
                last(sum_open_interest_value, create_time) AS sum_open_interest_value,
                sum(count_toptrader_long_short_ratio)      AS count_toptrader_long_short_ratio,
                sum(sum_toptrader_long_short_ratio)        AS sum_toptrader_long_short_ratio,
                sum(count_long_short_ratio)                AS count_long_short_ratio,
                sum(sum_taker_long_short_vol_ratio)        AS sum_taker_long_short_vol_ratio,
                count(*)                                   AS points,
                bool_and(is_closed)                        AS complete
            FROM market_data.binance_futures_metrics_5m
            GROUP BY 1, 2
            WITH NO DATA;
        $fmt$, p_view_name, p_bucket);

        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_bucket_symbol ON market_data.%I(bucket, symbol);', p_view_name, p_view_name);
    END IF;

    BEGIN
        EXECUTE format(
            'SELECT add_continuous_aggregate_policy(''market_data.%I'', start_offset => %L::interval, end_offset => %L::interval, schedule_interval => %L::interval);',
            p_view_name, p_start_offset, p_end_offset, p_schedule
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END;
$$;

-- =============================================================================
-- 创建指标连续聚合视图（生产配置）
-- =============================================================================
DO $$
DECLARE
    cfg RECORD;
BEGIN
    FOR cfg IN
        SELECT * FROM (VALUES
            ('binance_futures_metrics_15m_last', '15 minutes'::interval, '7 days'::interval,  '1 minute'::interval,  '5 minutes'::interval),
            ('binance_futures_metrics_1h_last',  '1 hour'::interval,     '7 days'::interval,  '1 minute'::interval,  '5 minutes'::interval),
            ('binance_futures_metrics_4h_last',  '4 hours'::interval,    '7 days'::interval,  '1 minute'::interval,  '5 minutes'::interval),
            ('binance_futures_metrics_1d_last',  '1 day'::interval,      '14 days'::interval, '1 minute'::interval,  '5 minutes'::interval),
            ('binance_futures_metrics_1w_last',  '7 days'::interval,     '30 days'::interval, '1 minute'::interval,  '5 minutes'::interval)
        ) AS t(view_name, bucket_interval, start_offset, end_offset, schedule_interval)
    LOOP
        PERFORM market_data._create_metrics_cagg(cfg.view_name, cfg.bucket_interval, cfg.start_offset, cfg.end_offset, cfg.schedule_interval);
    END LOOP;
END$$;

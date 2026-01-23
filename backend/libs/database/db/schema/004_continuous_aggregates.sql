-- 连续聚合视图：由 1m 基础数据实时合成 3m~1M
-- 任何节点只需执行一次即可建好全部 Timescale Continuous Aggregate

SET search_path TO market_data, public;

CREATE OR REPLACE FUNCTION market_data._创建连续聚合(
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

DO $$
DECLARE
    cfg RECORD;
BEGIN
    FOR cfg IN
        SELECT * FROM (VALUES
            -- 生产环境实际策略：全部视图 1 分钟调度，end_offset 固定 1 分钟
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
        PERFORM market_data._创建连续聚合(cfg.view_name, cfg.bucket_interval, cfg.start_offset, cfg.end_offset, cfg.schedule_interval);
    END LOOP;
END$$;

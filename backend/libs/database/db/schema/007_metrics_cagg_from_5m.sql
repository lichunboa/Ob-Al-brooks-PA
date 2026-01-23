-- 连续聚合视图：由 5m 指标表上推合成 15m/1h/4h/1d/1w
-- 仅需执行一次；视图名固定为 market_data.metrics_{interval}

SET search_path TO market_data, public;

CREATE OR REPLACE FUNCTION market_data._创建指标连续聚合(
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
                time_bucket(%L::interval, create_time) AS create_time,
                last(sum_open_interest, create_time) AS sum_open_interest,
                last(sum_open_interest_value, create_time) AS sum_open_interest_value,
                sum(count_toptrader_long_short_ratio) AS count_toptrader_long_short_ratio,
                sum(sum_toptrader_long_short_ratio) AS sum_toptrader_long_short_ratio,
                sum(count_long_short_ratio) AS count_long_short_ratio,
                sum(sum_taker_long_short_vol_ratio) AS sum_taker_long_short_vol_ratio,
                last(source, create_time) AS source,
                bool_and(is_closed) AS is_closed,
                max(ingested_at) AS ingested_at,
                max(updated_at) AS updated_at
            FROM market_data.binance_futures_metrics_5m
            GROUP BY exchange, symbol, time_bucket(%L::interval, create_time);
        $fmt$, p_view_name, p_bucket_interval, p_bucket_interval);
    END IF;

    -- 索引：非唯一，避免 Timescale 约束限制
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON market_data.%I (create_time, exchange, symbol);',
        'idx_' || p_view_name || '_time_exchange_symbol', p_view_name
    );

    -- 连续聚合刷新策略
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

-- 注册各周期视图（均基于 5m 物理表）
DO $$
DECLARE
    cfg RECORD;
BEGIN
    FOR cfg IN
        SELECT * FROM (VALUES
            ('metrics_15m', '15 minutes'::interval, '14 days'::interval,  '5 minutes'::interval,  '5 minutes'::interval),
            ('metrics_1h',  '1 hour'::interval,     '30 days'::interval,  '5 minutes'::interval,  '10 minutes'::interval),
            ('metrics_4h',  '4 hours'::interval,    '60 days'::interval,  '5 minutes'::interval,  '15 minutes'::interval),
            ('metrics_1d',  '1 day'::interval,      '180 days'::interval, '15 minutes'::interval, '30 minutes'::interval),
            ('metrics_1w',  '7 days'::interval,     '365 days'::interval, '30 minutes'::interval, '1 hour'::interval)
        ) AS t(view_name, bucket_interval, start_offset, end_offset, schedule_interval)
    LOOP
        PERFORM market_data._创建指标连续聚合(cfg.view_name, cfg.bucket_interval, cfg.start_offset, cfg.end_offset, cfg.schedule_interval);
    END LOOP;
END$$;

-- 可选：初始化填充
-- REFRESH MATERIALIZED VIEW CONCURRENTLY market_data.metrics_15m WITH NO DATA;
-- SELECT refresh_continuous_aggregate('market_data.metrics_15m', now() - INTERVAL '30 days', now());

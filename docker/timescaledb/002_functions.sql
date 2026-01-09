-- =============================================================================
-- TradeCat 函数定义（对齐生产库）
-- =============================================================================

-- =============================================================================
-- 数据质量验证触发器函数
-- =============================================================================
CREATE OR REPLACE FUNCTION market_data.validate_candle_quality() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.symbol IS NULL OR TRIM(NEW.symbol) = '' THEN
        RAISE EXCEPTION 'symbol不能为空或空白';
    END IF;

    IF NEW.exchange IS NULL OR TRIM(NEW.exchange) = '' THEN
        RAISE EXCEPTION 'exchange不能为空或空白';
    END IF;

    IF NEW.source IS NULL OR TRIM(NEW.source) = '' THEN
        RAISE EXCEPTION 'source不能为空或空白';
    END IF;

    IF NEW.open IS NULL THEN RAISE EXCEPTION 'open价格不能为NULL'; END IF;
    IF NEW.high IS NULL THEN RAISE EXCEPTION 'high价格不能为NULL'; END IF;
    IF NEW.low IS NULL THEN RAISE EXCEPTION 'low价格不能为NULL'; END IF;
    IF NEW.close IS NULL THEN RAISE EXCEPTION 'close价格不能为NULL'; END IF;
    IF NEW.volume IS NULL THEN RAISE EXCEPTION 'volume不能为NULL'; END IF;
    IF NEW.bucket_ts IS NULL THEN RAISE EXCEPTION 'bucket_ts不能为NULL'; END IF;

    IF NEW.high < NEW.low THEN
        RAISE EXCEPTION 'high价格(%)不能低于low价格(%)', NEW.high, NEW.low;
    END IF;

    IF NEW.open < NEW.low OR NEW.open > NEW.high THEN
        RAISE EXCEPTION 'open价格(%)必须在[low(%), high(%)]范围内', NEW.open, NEW.low, NEW.high;
    END IF;

    IF NEW.close < NEW.low OR NEW.close > NEW.high THEN
        RAISE EXCEPTION 'close价格(%)必须在[low(%), high(%)]范围内', NEW.close, NEW.low, NEW.high;
    END IF;

    IF NEW.volume < 0 THEN RAISE EXCEPTION 'volume不能为负数: %', NEW.volume; END IF;
    IF NEW.quote_volume < 0 THEN RAISE EXCEPTION 'quote_volume不能为负数: %', NEW.quote_volume; END IF;
    IF NEW.trade_count < 0 THEN RAISE EXCEPTION 'trade_count不能为负数: %', NEW.trade_count; END IF;
    IF NEW.taker_buy_volume < 0 THEN RAISE EXCEPTION 'taker_buy_volume不能为负数: %', NEW.taker_buy_volume; END IF;
    IF NEW.taker_buy_quote_volume < 0 THEN RAISE EXCEPTION 'taker_buy_quote_volume不能为负数: %', NEW.taker_buy_quote_volume; END IF;

    IF NEW.taker_buy_volume > NEW.volume THEN
        RAISE WARNING 'taker_buy_volume(%)不应超过volume(%)', NEW.taker_buy_volume, NEW.volume;
    END IF;

    IF NEW.taker_buy_quote_volume > NEW.quote_volume THEN
        RAISE WARNING 'taker_buy_quote_volume(%)不应超过quote_volume(%)', NEW.taker_buy_quote_volume, NEW.quote_volume;
    END IF;

    RETURN NEW;
END;
$$;

-- 创建触发器
DROP TRIGGER IF EXISTS validate_candle_quality_insert ON market_data.candles_1m;
CREATE TRIGGER validate_candle_quality_insert 
    BEFORE INSERT ON market_data.candles_1m 
    FOR EACH ROW EXECUTE FUNCTION market_data.validate_candle_quality();

DROP TRIGGER IF EXISTS validate_candle_quality_update ON market_data.candles_1m;
CREATE TRIGGER validate_candle_quality_update 
    BEFORE UPDATE ON market_data.candles_1m 
    FOR EACH ROW EXECUTE FUNCTION market_data.validate_candle_quality();

-- =============================================================================
-- 通知函数
-- =============================================================================
CREATE OR REPLACE FUNCTION market_data.notify_candle_1m_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM pg_notify('candle_1m_update', json_build_object(
        'symbol', NEW.symbol,
        'bucket_ts', NEW.bucket_ts,
        'open', NEW.open,
        'high', NEW.high,
        'low', NEW.low,
        'close', NEW.close,
        'volume', NEW.volume,
        'is_closed', NEW.is_closed
    )::text);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION market_data.notify_metrics_5m_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    payload JSON;
BEGIN
    payload := json_build_object(
        'symbol', NEW.symbol,
        'create_time', NEW.create_time,
        'is_closed', NEW.is_closed
    );
    PERFORM pg_notify('metrics_5m_update', payload::text);
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 数据质量统计函数
-- =============================================================================
CREATE OR REPLACE FUNCTION market_data.get_candle_quality_summary(
    p_exchange TEXT DEFAULT 'binance_futures_um',
    p_days INTEGER DEFAULT 7
) RETURNS TABLE(
    exchange TEXT,
    total_records BIGINT,
    completeness_rate NUMERIC,
    null_taker_buy_quote_volume BIGINT,
    zero_taker_buy_quote_volume BIGINT,
    non_zero_taker_buy_quote_volume BIGINT
)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.exchange::TEXT,
        COUNT(*)::BIGINT as total_records,
        ROUND(100.0 * COUNT(*) FILTER (WHERE c.taker_buy_quote_volume IS NOT NULL) / COUNT(*), 2) as completeness_rate,
        COUNT(*) FILTER (WHERE c.taker_buy_quote_volume IS NULL)::BIGINT as null_values,
        COUNT(*) FILTER (WHERE c.taker_buy_quote_volume = 0)::BIGINT as zero_values,
        COUNT(*) FILTER (WHERE c.taker_buy_quote_volume > 0)::BIGINT as non_zero_values
    FROM market_data.candles_1m c
    WHERE c.exchange = p_exchange
      AND c.bucket_ts >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY c.exchange;
END;
$$;

-- =============================================================================
-- Upsert 函数: candles_1m
-- =============================================================================
CREATE OR REPLACE FUNCTION market_data.upsert_candle_1m(
    p_exchange TEXT, p_symbol TEXT, p_bucket_ts TIMESTAMPTZ,
    p_open NUMERIC, p_high NUMERIC, p_low NUMERIC, p_close NUMERIC,
    p_volume NUMERIC, p_quote_volume NUMERIC DEFAULT NULL,
    p_trade_count BIGINT DEFAULT NULL, p_is_closed BOOLEAN DEFAULT FALSE,
    p_source TEXT DEFAULT 'ccxt',
    p_taker_buy_volume NUMERIC DEFAULT NULL,
    p_taker_buy_quote_volume NUMERIC DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO market_data.candles_1m AS t (
        exchange, symbol, bucket_ts, open, high, low, close,
        volume, quote_volume, trade_count,
        taker_buy_volume, taker_buy_quote_volume,
        is_closed, source, ingested_at, updated_at
    ) VALUES (
        p_exchange, p_symbol, p_bucket_ts, p_open, p_high, p_low, p_close,
        p_volume, p_quote_volume, p_trade_count,
        p_taker_buy_volume, p_taker_buy_quote_volume,
        p_is_closed, p_source, NOW(), NOW()
    )
    ON CONFLICT (exchange, symbol, bucket_ts)
    DO UPDATE SET
        open        = CASE WHEN t.is_closed AND NOT EXCLUDED.is_closed THEN t.open ELSE EXCLUDED.open END,
        high        = GREATEST(t.high, EXCLUDED.high),
        low         = LEAST(t.low, EXCLUDED.low),
        close       = EXCLUDED.close,
        volume      = EXCLUDED.volume,
        quote_volume= COALESCE(EXCLUDED.quote_volume, t.quote_volume),
        trade_count = COALESCE(EXCLUDED.trade_count, t.trade_count),
        taker_buy_volume = COALESCE(EXCLUDED.taker_buy_volume, t.taker_buy_volume),
        taker_buy_quote_volume = COALESCE(EXCLUDED.taker_buy_quote_volume, t.taker_buy_quote_volume),
        is_closed   = t.is_closed OR EXCLUDED.is_closed,
        source      = EXCLUDED.source,
        updated_at  = NOW();
END;
$$;

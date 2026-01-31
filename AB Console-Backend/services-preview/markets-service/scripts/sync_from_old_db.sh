#!/bin/bash
# ============================================================
# 从老库 (5433) 同步数据到新库 (5434)
# ============================================================

set -e

OLD_HOST="localhost"
OLD_PORT="5433"
OLD_DB="market_data"
OLD_USER="postgres"
OLD_PASS="postgres"

NEW_HOST="localhost"
NEW_PORT="5434"
NEW_DB="market_data"
NEW_USER="postgres"
NEW_PASS="postgres"

BATCH_SIZE=1000000  # 每批 100万条

echo "=============================================="
echo "数据同步: 5433 -> 5434"
echo "=============================================="

# 同步 K线数据 (增量)
sync_klines() {
    echo ""
    echo "[K线同步] 检查增量..."
    
    # 获取新库最大时间
    MAX_TIME=$(PGPASSWORD=$NEW_PASS psql -h $NEW_HOST -p $NEW_PORT -U $NEW_USER -d $NEW_DB -t -c "
        SELECT COALESCE(MAX(open_time), '1970-01-01'::timestamptz) FROM raw.kline_1m;
    " | tr -d ' ')
    
    echo "[K线同步] 新库最大时间: $MAX_TIME"
    
    # 统计需要同步的数量
    COUNT=$(PGPASSWORD=$OLD_PASS psql -h $OLD_HOST -p $OLD_PORT -U $OLD_USER -d $OLD_DB -t -c "
        SELECT count(*) FROM market_data.candles_1m WHERE bucket_ts > '$MAX_TIME';
    " | tr -d ' ')
    
    echo "[K线同步] 需要同步: $COUNT 条"
    
    if [ "$COUNT" -eq "0" ]; then
        echo "[K线同步] 无新数据"
        return
    fi
    
    # 分批同步
    OFFSET=0
    while [ $OFFSET -lt $COUNT ]; do
        echo "[K线同步] 同步 $OFFSET / $COUNT ..."
        
        PGPASSWORD=$NEW_PASS psql -h $NEW_HOST -p $NEW_PORT -U $NEW_USER -d $NEW_DB -c "
        INSERT INTO raw.kline_1m (
            exchange, symbol, open_time, close_time,
            open, high, low, close, volume, quote_volume,
            trades, taker_buy_volume, taker_buy_quote_volume,
            is_closed, source, ingest_batch_id, ingested_at, updated_at
        )
        SELECT 
            exchange, symbol, bucket_ts, NULL,
            open, high, low, close, volume, quote_volume,
            trade_count, taker_buy_volume, taker_buy_quote_volume,
            is_closed, source, 0, ingested_at, updated_at
        FROM dblink(
            'host=$OLD_HOST port=$OLD_PORT dbname=$OLD_DB user=$OLD_USER password=$OLD_PASS',
            'SELECT exchange, symbol, bucket_ts, open, high, low, close, volume, quote_volume,
                    trade_count, taker_buy_volume, taker_buy_quote_volume, is_closed, source, ingested_at, updated_at
             FROM market_data.candles_1m 
             WHERE bucket_ts > ''$MAX_TIME''
             ORDER BY bucket_ts
             LIMIT $BATCH_SIZE OFFSET $OFFSET'
        ) AS t(
            exchange text, symbol text, bucket_ts timestamptz,
            open numeric, high numeric, low numeric, close numeric,
            volume numeric, quote_volume numeric, trade_count bigint,
            taker_buy_volume numeric, taker_buy_quote_volume numeric,
            is_closed boolean, source text, ingested_at timestamptz, updated_at timestamptz
        )
        ON CONFLICT (exchange, symbol, open_time) DO NOTHING;
        " 2>&1 | grep -E "INSERT|ERROR" || true
        
        OFFSET=$((OFFSET + BATCH_SIZE))
    done
    
    echo "[K线同步] 完成"
}

# 同步期货指标 (增量)
sync_metrics() {
    echo ""
    echo "[期货指标同步] 检查增量..."
    
    MAX_TIME=$(PGPASSWORD=$NEW_PASS psql -h $NEW_HOST -p $NEW_PORT -U $NEW_USER -d $NEW_DB -t -c "
        SELECT COALESCE(MAX(timestamp), '1970-01-01'::timestamptz) FROM raw.futures_metrics;
    " | tr -d ' ')
    
    echo "[期货指标同步] 新库最大时间: $MAX_TIME"
    
    COUNT=$(PGPASSWORD=$OLD_PASS psql -h $OLD_HOST -p $OLD_PORT -U $OLD_USER -d $OLD_DB -t -c "
        SELECT count(*) FROM market_data.binance_futures_metrics_5m WHERE create_time > '$MAX_TIME';
    " | tr -d ' ')
    
    echo "[期货指标同步] 需要同步: $COUNT 条"
    
    if [ "$COUNT" -eq "0" ]; then
        echo "[期货指标同步] 无新数据"
        return
    fi
    
    OFFSET=0
    while [ $OFFSET -lt $COUNT ]; do
        echo "[期货指标同步] 同步 $OFFSET / $COUNT ..."
        
        PGPASSWORD=$NEW_PASS psql -h $NEW_HOST -p $NEW_PORT -U $NEW_USER -d $NEW_DB -c "
        INSERT INTO raw.futures_metrics (
            exchange, symbol, timestamp,
            \"sumOpenInterest\", \"sumOpenInterestValue\",
            \"topAccountLongShortRatio\", \"topPositionLongShortRatio\",
            \"globalLongShortRatio\", \"takerBuySellRatio\",
            source, is_closed, ingest_batch_id, ingested_at, updated_at
        )
        SELECT 
            exchange, symbol, create_time,
            sum_open_interest, sum_open_interest_value,
            sum_toptrader_long_short_ratio, NULL,
            count_long_short_ratio, sum_taker_long_short_vol_ratio,
            source, is_closed, 0, ingested_at, updated_at
        FROM dblink(
            'host=$OLD_HOST port=$OLD_PORT dbname=$OLD_DB user=$OLD_USER password=$OLD_PASS',
            'SELECT exchange, symbol, create_time, sum_open_interest, sum_open_interest_value,
                    sum_toptrader_long_short_ratio, count_long_short_ratio, sum_taker_long_short_vol_ratio,
                    source, is_closed, ingested_at, updated_at
             FROM market_data.binance_futures_metrics_5m
             WHERE create_time > ''$MAX_TIME''
             ORDER BY create_time
             LIMIT $BATCH_SIZE OFFSET $OFFSET'
        ) AS t(
            exchange text, symbol text, create_time timestamptz,
            sum_open_interest numeric, sum_open_interest_value numeric,
            sum_toptrader_long_short_ratio numeric, count_long_short_ratio numeric,
            sum_taker_long_short_vol_ratio numeric,
            source text, is_closed boolean, ingested_at timestamptz, updated_at timestamptz
        )
        ON CONFLICT (exchange, symbol, timestamp) DO NOTHING;
        " 2>&1 | grep -E "INSERT|ERROR" || true
        
        OFFSET=$((OFFSET + BATCH_SIZE))
    done
    
    echo "[期货指标同步] 完成"
}

# 执行同步
sync_klines
sync_metrics

echo ""
echo "=============================================="
echo "同步完成!"
echo "=============================================="

# 验证
PGPASSWORD=$NEW_PASS psql -h $NEW_HOST -p $NEW_PORT -U $NEW_USER -d $NEW_DB -c "
SELECT 'raw.kline_1m' as tbl, count(*) as rows FROM raw.kline_1m
UNION ALL SELECT 'raw.futures_metrics', count(*) FROM raw.futures_metrics;
"

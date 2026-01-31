#!/bin/bash
# TimescaleDB 压缩策略管理
# 用法: ./scripts/timescaledb_compression.sh [status|compress-now]

set -e

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5433/market_data}"

case "${1:-status}" in
    status)
        echo "=== TimescaleDB 压缩状态 ==="
        psql "$DB_URL" << 'SQL'
-- 压缩策略
SELECT hypertable_name, config->>'compress_after' as compress_after
FROM timescaledb_information.jobs
WHERE proc_name = 'policy_compression';

-- 表大小
SELECT hypertable_name,
       pg_size_pretty(hypertable_size(format('%I.%I', 'market_data', hypertable_name))) as size
FROM timescaledb_information.hypertables
WHERE hypertable_schema = 'market_data';

-- Chunk 压缩情况
SELECT hypertable_name, 
       count(*) as total_chunks,
       count(*) FILTER (WHERE is_compressed) as compressed
FROM timescaledb_information.chunks
WHERE hypertable_schema = 'market_data'
GROUP BY hypertable_name;
SQL
        ;;
    
    compress-now)
        echo "=== 手动触发压缩 ==="
        psql "$DB_URL" << 'SQL'
-- 压缩超过30天的数据
CALL run_job((SELECT job_id FROM timescaledb_information.jobs WHERE proc_name = 'policy_compression' AND hypertable_name = 'candles_1m'));
CALL run_job((SELECT job_id FROM timescaledb_information.jobs WHERE proc_name = 'policy_compression' AND hypertable_name = 'binance_futures_metrics_5m'));
\echo '✓ 压缩任务已触发'
SQL
        ;;
    
    *)
        echo "用法: $0 [status|compress-now]"
        exit 1
        ;;
esac

#!/bin/bash
# TimescaleDB 数据导出脚本 (COPY + zstd)
# 针对 hypertable 使用 COPY 导出

set -e

# 自动获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

DB_HOST="localhost"
DB_PORT="5433"
DB_USER="postgres"
DB_PASS="postgres"
DB_NAME="market_data"
OUTPUT_DIR="${PROJECT_ROOT}/backups/timescaledb"
LOG_FILE="$OUTPUT_DIR/export.log"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$OUTPUT_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

export PGPASSWORD="$DB_PASS"

log "========== 开始导出 =========="
log "输出目录: $OUTPUT_DIR"

# 导出 K线数据 (COPY BINARY + zstd)
log "导出 candles_1m (3.73亿行, 99GB -> ~15GB)..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
COPY (SELECT * FROM market_data.candles_1m ORDER BY symbol, bucket_ts) 
TO STDOUT WITH (FORMAT binary)
" 2>>"$LOG_FILE" | zstd -19 -T10 > "$OUTPUT_DIR/candles_1m_$DATE.bin.zst" &
PID_CANDLES=$!

# 导出期货数据
log "导出 futures_metrics (9457万行, 5GB -> ~800MB)..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
COPY (SELECT * FROM market_data.binance_futures_metrics_5m ORDER BY symbol, create_time) 
TO STDOUT WITH (FORMAT binary)
" 2>>"$LOG_FILE" | zstd -19 -T10 > "$OUTPUT_DIR/futures_metrics_$DATE.bin.zst" &
PID_FUTURES=$!

# 导出 schema
log "导出 schema..."
pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
    --schema-only -n market_data 2>>"$LOG_FILE" | zstd -19 > "$OUTPUT_DIR/schema_$DATE.sql.zst"

# 等待完成
log "等待数据导出完成..."
log "candles_1m PID: $PID_CANDLES"
log "futures_metrics PID: $PID_FUTURES"

wait $PID_CANDLES
log "candles_1m 完成: $(ls -lh "$OUTPUT_DIR/candles_1m_$DATE.bin.zst" | awk '{print $5}')"

wait $PID_FUTURES
log "futures_metrics 完成: $(ls -lh "$OUTPUT_DIR/futures_metrics_$DATE.bin.zst" | awk '{print $5}')"

log "========== 导出完成 =========="
ls -lh "$OUTPUT_DIR"/*_$DATE.* | tee -a "$LOG_FILE"
log "总大小: $(du -sh "$OUTPUT_DIR" | awk '{print $1}')"

# 生成恢复脚本
cat > "$OUTPUT_DIR/restore_$DATE.sh" << 'EOF'
#!/bin/bash
# 恢复脚本
DB_HOST="localhost"
DB_PORT="5433"
DB_USER="postgres"
DB_PASS="postgres"
DB_NAME="market_data"

export PGPASSWORD="$DB_PASS"

# 恢复 schema
zstd -d schema_*.sql.zst -c | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME

# 恢复 candles_1m
zstd -d candles_1m_*.bin.zst -c | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "COPY market_data.candles_1m FROM STDIN WITH (FORMAT binary)"

# 恢复 futures_metrics
zstd -d futures_metrics_*.bin.zst -c | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "COPY market_data.binance_futures_metrics_5m FROM STDIN WITH (FORMAT binary)"
EOF
chmod +x "$OUTPUT_DIR/restore_$DATE.sh"
log "恢复脚本: restore_$DATE.sh"

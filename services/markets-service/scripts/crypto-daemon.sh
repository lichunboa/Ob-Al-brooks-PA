#!/usr/bin/env bash
# crypto 模块守护程序
# 用法: ./scripts/crypto-daemon.sh {start|stop|status|restart}
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$(dirname "$SERVICE_DIR")")"
LOG_DIR="$SERVICE_DIR/logs"
PID_DIR="$SERVICE_DIR/pids"

mkdir -p "$LOG_DIR" "$PID_DIR"

# 加载统一配置 (含代理)
if [ -f "$PROJECT_ROOT/config/.env" ]; then
    set -a
    source "$PROJECT_ROOT/config/.env"
    set +a
fi

# 默认 legacy 模式，可通过环境变量覆盖
export CRYPTO_WRITE_MODE="${CRYPTO_WRITE_MODE:-legacy}"
export MARKETS_SERVICE_DATABASE_URL="${MARKETS_SERVICE_DATABASE_URL:-postgresql://postgres:postgres@localhost:5433/market_data}"

cd "$SERVICE_DIR"

# 激活虚拟环境
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# PID 文件
PID_WS="$PID_DIR/crypto-ws.pid"
PID_METRICS="$PID_DIR/crypto-metrics.pid"

start_ws() {
    if [ -f "$PID_WS" ] && kill -0 $(cat "$PID_WS") 2>/dev/null; then
        echo "⚠ crypto-ws 已在运行 (PID: $(cat $PID_WS))"
        return 1
    fi
    echo "启动 crypto-ws (模式: $CRYPTO_WRITE_MODE)..."
    nohup python -m src crypto-ws > "$LOG_DIR/crypto-ws.log" 2>&1 &
    echo $! > "$PID_WS"
    echo "✓ crypto-ws 已启动 (PID: $!)"
}

start_metrics() {
    if [ -f "$PID_METRICS" ] && kill -0 $(cat "$PID_METRICS") 2>/dev/null; then
        echo "⚠ crypto-metrics 已在运行 (PID: $(cat $PID_METRICS))"
        return 1
    fi
    echo "启动 crypto-metrics 定时采集..."
    # 每 5 分钟采集一次期货指标
    nohup bash -c 'while true; do python -m src crypto-metrics >> "'$LOG_DIR'/crypto-metrics.log" 2>&1; sleep 300; done' &
    echo $! > "$PID_METRICS"
    echo "✓ crypto-metrics 已启动 (PID: $!)"
}

# 健康检查: 检测数据是否超过 10 分钟未更新
health_check() {
    local max_stale_minutes=${1:-10}
    local result=$(PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d market_data -t -c "
        SELECT CASE WHEN MAX(bucket_ts) < NOW() - INTERVAL '${max_stale_minutes} minutes' THEN 'STALE' ELSE 'OK' END
        FROM market_data.candles_1m WHERE bucket_ts > NOW() - INTERVAL '1 day';
    " 2>/dev/null | tr -d ' ')
    
    if [ "$result" = "STALE" ]; then
        echo "⚠ 数据超过 ${max_stale_minutes} 分钟未更新，重启 WebSocket..."
        stop_process "crypto-ws" "$PID_WS"
        sleep 2
        start_ws
        return 1
    fi
    return 0
}

# 守护模式: 持续监控并自动重启
daemon_mode() {
    echo "启动守护模式 (每 60 秒检查一次)..."
    while true; do
        # 检查进程是否存活
        if [ -f "$PID_WS" ] && ! kill -0 $(cat "$PID_WS") 2>/dev/null; then
            echo "[$(date)] crypto-ws 进程死亡，重启..."
            start_ws
        fi
        
        # 健康检查 (数据是否更新)
        health_check 10
        
        sleep 60
    done
}

stop_process() {
    local name=$1
    local pid_file=$2
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            kill $pid 2>/dev/null
            sleep 1
            kill -9 $pid 2>/dev/null
            echo "✓ $name 已停止"
        fi
        rm -f "$pid_file"
    fi
}

status_process() {
    local name=$1
    local pid_file=$2
    if [ -f "$pid_file" ] && kill -0 $(cat "$pid_file") 2>/dev/null; then
        echo "✓ $name 运行中 (PID: $(cat $pid_file))"
        return 0
    else
        echo "✗ $name 未运行"
        return 1
    fi
}

case "${1:-help}" in
    start)
        echo "=== Crypto 守护程序启动 ==="
        echo "代理: ${HTTP_PROXY:-未设置}"
        echo "模式: $CRYPTO_WRITE_MODE"
        echo "数据库: ${MARKETS_SERVICE_DATABASE_URL:0:50}..."
        echo ""
        start_ws
        start_metrics
        ;;
    stop)
        echo "=== 停止 Crypto 守护程序 ==="
        stop_process "crypto-ws" "$PID_WS"
        stop_process "crypto-metrics" "$PID_METRICS"
        # 清理子进程
        pkill -f "python -m src crypto-" 2>/dev/null || true
        ;;
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    status)
        echo "=== Crypto 守护程序状态 ==="
        echo "模式: $CRYPTO_WRITE_MODE"
        echo "代理: ${HTTP_PROXY:-未设置}"
        echo ""
        status_process "crypto-ws" "$PID_WS"
        status_process "crypto-metrics" "$PID_METRICS"
        ;;
    logs)
        echo "=== 最近日志 ==="
        tail -20 "$LOG_DIR/crypto-ws.log" 2>/dev/null || echo "无 ws 日志"
        ;;
    daemon)
        echo "=== Crypto 守护程序启动 (守护模式) ==="
        echo "代理: ${HTTP_PROXY:-未设置}"
        echo "模式: $CRYPTO_WRITE_MODE"
        start_ws
        start_metrics
        daemon_mode
        ;;
    health)
        echo "=== 健康检查 ==="
        health_check 10 && echo "✓ 数据正常" || echo "⚠ 已触发重启"
        ;;
    *)
        echo "Crypto 模块守护程序"
        echo ""
        echo "用法: $0 {start|stop|restart|status|logs|daemon|health}"
        echo ""
        echo "命令:"
        echo "  start   启动服务"
        echo "  stop    停止服务"
        echo "  restart 重启服务"
        echo "  status  查看状态"
        echo "  logs    查看日志"
        echo "  daemon  守护模式 (自动重启)"
        echo "  health  健康检查"
        echo ""
        echo "环境变量:"
        echo "  CRYPTO_WRITE_MODE    写入模式 (legacy/raw, 默认 legacy)"
        echo "  MARKETS_SERVICE_DATABASE_URL  数据库连接"
        ;;
esac

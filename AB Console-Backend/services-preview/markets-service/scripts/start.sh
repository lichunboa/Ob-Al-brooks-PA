#!/usr/bin/env bash
# markets-service 启动脚本
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$(dirname "$SERVICE_DIR")")"
LOG_DIR="$SERVICE_DIR/logs"
PID_DIR="$SERVICE_DIR/pids"

mkdir -p "$LOG_DIR" "$PID_DIR"

# 加载配置
if [ -f "$PROJECT_ROOT/config/.env" ]; then
    set -a
    source "$PROJECT_ROOT/config/.env"
    set +a
fi

cd "$SERVICE_DIR"

# 激活虚拟环境
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

case "${1:-help}" in
    start)
        echo "启动 markets-service..."
        nohup python -m src collect > "$LOG_DIR/collect.log" 2>&1 &
        echo $! > "$PID_DIR/collect.pid"
        echo "✓ 已启动 (PID: $!)"
        ;;
    stop)
        if [ -f "$PID_DIR/collect.pid" ]; then
            kill $(cat "$PID_DIR/collect.pid") 2>/dev/null && echo "✓ 已停止"
            rm -f "$PID_DIR/collect.pid"
        fi
        ;;
    status)
        if [ -f "$PID_DIR/collect.pid" ] && kill -0 $(cat "$PID_DIR/collect.pid") 2>/dev/null; then
            echo "✓ 运行中 (PID: $(cat "$PID_DIR/collect.pid"))"
        else
            echo "✗ 未运行"
        fi
        ;;
    test)
        python -m src test --provider "${2:-yfinance}" --symbol "${3:-AAPL}"
        ;;
    *)
        echo "用法: $0 {start|stop|status|test [provider] [symbol]}"
        ;;
esac

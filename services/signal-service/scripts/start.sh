#!/usr/bin/env bash
# signal-service 启动脚本

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$(dirname "$PROJECT_DIR")")"
PID_FILE="$PROJECT_DIR/logs/signal-service.pid"
LOG_FILE="$PROJECT_DIR/logs/signal-service.log"

# 加载配置
ENV_FILE="$REPO_ROOT/config/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

# 确保虚拟环境存在
VENV_DIR="$PROJECT_DIR/.venv"
if [[ ! -d "$VENV_DIR" ]]; then
    echo "创建虚拟环境..."
    python3 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install -q --upgrade pip
    if [[ -f "$PROJECT_DIR/requirements.txt" ]]; then
        "$VENV_DIR/bin/pip" install -q -r "$PROJECT_DIR/requirements.txt"
    fi
fi

PYTHON="$VENV_DIR/bin/python"
mkdir -p "$PROJECT_DIR/logs"

start() {
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "signal-service 已在运行 (PID: $(cat "$PID_FILE"))"
        return 1
    fi
    
    echo "启动 signal-service..."
    cd "$PROJECT_DIR"
    nohup "$PYTHON" -m src --all >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "signal-service 已启动 (PID: $!)"
}

stop() {
    if [[ -f "$PID_FILE" ]]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "停止 signal-service (PID: $PID)..."
            kill "$PID"
            rm -f "$PID_FILE"
            echo "signal-service 已停止"
        else
            echo "signal-service 未运行"
            rm -f "$PID_FILE"
        fi
    else
        echo "signal-service 未运行"
    fi
}

status() {
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "signal-service 运行中 (PID: $(cat "$PID_FILE"))"
    else
        echo "signal-service 未运行"
    fi
}

case "${1:-status}" in
    start)   start ;;
    stop)    stop ;;
    status)  status ;;
    restart) stop; sleep 1; start ;;
    *)
        echo "用法: $0 {start|stop|status|restart}"
        exit 1
        ;;
esac

#!/bin/bash
# ============================================================
# AB Console - 自动启动脚本（macOS LaunchAgent 用）
# 开机登录后自动启动所有交易系统服务
# 崩溃后自动重启
# ============================================================

BACKEND_DIR="/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend"
LOG_FILE="/tmp/ab-autostart.log"

log() { echo "[$(date '+%H:%M:%S')] $1" >> "$LOG_FILE"; }

# 清空旧日志
echo "=== AB Console 自动启动 $(date) ===" > "$LOG_FILE"

# Docker Desktop socket
if [ -S "$HOME/.docker/run/docker.sock" ]; then
    export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
elif [ -S "/var/run/docker.sock" ]; then
    export DOCKER_HOST="unix:///var/run/docker.sock"
fi

# 等待网络就绪（最多 30 秒）
WAIT=0
while ! curl -s --max-time 2 https://api.binance.com/api/v3/ping > /dev/null 2>&1 && [ $WAIT -lt 30 ]; do
    sleep 2
    WAIT=$((WAIT + 2))
done
log "网络就绪 (${WAIT}s)"

# --- 辅助函数 ---
start_if_not_running() {
    local port=$1
    local name=$2
    local start_cmd=$3

    if lsof -i :$port -sTCP:LISTEN > /dev/null 2>&1; then
        log "$name 已在运行 (端口 $port)"
        return 0
    fi

    log "启动 $name..."
    eval "$start_cmd"
    sleep 3

    if lsof -i :$port -sTCP:LISTEN > /dev/null 2>&1; then
        log "$name 启动成功"
        return 0
    else
        log "$name 启动失败"
        return 1
    fi
}

# ============================================================
# 1. Docker + TimescaleDB
# ============================================================
if command -v docker &> /dev/null; then
    if ! docker info > /dev/null 2>&1; then
        log "启动 Docker Desktop..."
        open /Applications/Docker.app 2>/dev/null
        WAIT=0
        while ! docker info > /dev/null 2>&1 && [ $WAIT -lt 90 ]; do
            sleep 3
            WAIT=$((WAIT + 3))
        done
        # 重新检测 socket
        if [ -S "$HOME/.docker/run/docker.sock" ]; then
            export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
        fi
    fi

    if docker info > /dev/null 2>&1; then
        if ! docker ps 2>/dev/null | grep -q ab-timescaledb; then
            docker start ab-timescaledb > /dev/null 2>&1 || true
            sleep 3
        fi
        log "TimescaleDB: $(docker ps --format '{{.Status}}' --filter name=ab-timescaledb 2>/dev/null || echo '未运行')"
    fi
fi

# ============================================================
# 2. API Service (8088)
# ============================================================
API_DIR="$BACKEND_DIR/services-preview/api-service"
if [ -d "$API_DIR" ]; then
    start_if_not_running 8088 "API Service" \
        "cd '$API_DIR' && ./scripts/start.sh start >> '$LOG_FILE' 2>&1"
fi

# ============================================================
# 3. Signal Service (8083)
# ============================================================
SIGNAL_DIR="$BACKEND_DIR/services/signal-service"
if [ -d "$SIGNAL_DIR/.venv" ]; then
    start_if_not_running 8083 "Signal Service" \
        "cd '$SIGNAL_DIR' && ./scripts/start.sh start >> '$LOG_FILE' 2>&1"
fi

# ============================================================
# 4. Execution Service (8092) - 交易核心
# ============================================================
EXEC_DIR="$BACKEND_DIR/services/execution-service"
if [ -d "$EXEC_DIR/src" ]; then
    start_if_not_running 8092 "Execution Service" \
        "cd '$EXEC_DIR' && mkdir -p logs && nohup python3 -m src --port 8092 > logs/execution.log 2>&1 & echo \$! > logs/execution.pid"
fi

# ============================================================
# 5. Web Dashboard (3000)
# ============================================================
WEB_DIR="$BACKEND_DIR/web"
if [ -d "$WEB_DIR/.next" ]; then
    start_if_not_running 3000 "Web Dashboard" \
        "cd '$WEB_DIR' && nohup npx next start -p 3000 > /tmp/ab-web-dashboard.log 2>&1 &"
fi

# ============================================================
# 6. OpenClaw Gateway (18789)
# ============================================================
if ! lsof -i :18789 -sTCP:LISTEN > /dev/null 2>&1; then
    if launchctl list 2>/dev/null | grep -q "ai.openclaw.gateway"; then
        launchctl kickstart -k "gui/$(id -u)/ai.openclaw.gateway" 2>/dev/null
        log "OpenClaw Gateway: kickstart"
    fi
fi

# ============================================================
# 状态总结
# ============================================================
log "=== 启动完成 ==="
log "API Service (8088):      $(lsof -i :8088 -sTCP:LISTEN > /dev/null 2>&1 && echo 'OK' || echo 'FAIL')"
log "Signal Service (8083):   $(lsof -i :8083 -sTCP:LISTEN > /dev/null 2>&1 && echo 'OK' || echo 'FAIL')"
log "Execution Service (8092):$(lsof -i :8092 -sTCP:LISTEN > /dev/null 2>&1 && echo 'OK' || echo 'FAIL')"
log "Web Dashboard (3000):    $(lsof -i :3000 -sTCP:LISTEN > /dev/null 2>&1 && echo 'OK' || echo 'FAIL')"
log "OpenClaw (18789):        $(lsof -i :18789 -sTCP:LISTEN > /dev/null 2>&1 && echo 'OK' || echo 'FAIL')"

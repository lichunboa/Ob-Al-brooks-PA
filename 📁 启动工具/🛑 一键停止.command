#!/bin/bash
# ============================================================
# AB Console - 一键停止工具
# 停止所有服务（支持 Docker Compose 和本地模式）
# ============================================================

cd "$(dirname "$0")/.."
BACKEND_DIR="$(pwd)/AB Console-Backend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Docker Desktop on macOS - 智能检测 socket
setup_docker_host() {
    if [ -S "$HOME/.docker/run/docker.sock" ]; then
        export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
    elif [ -S "/var/run/docker.sock" ]; then
        export DOCKER_HOST="unix:///var/run/docker.sock"
    fi
}
setup_docker_host

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          AB Console - 一键停止工具                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Docker Compose 模式
if [ -f "$BACKEND_DIR/docker-compose.yml" ] && docker info > /dev/null 2>&1; then
    log_info "停止 Docker Compose 服务..."
    cd "$BACKEND_DIR"
    docker compose stop 2>/dev/null
    log_success "Docker Compose 服务已停止"
    echo ""
fi

# 停止 API Service（可能本地运行）
log_info "停止 API Service..."
cd "$BACKEND_DIR/services-preview/api-service" 2>/dev/null && ./scripts/start.sh stop 2>/dev/null
pkill -f "api-service" 2>/dev/null
log_success "API Service 已停止"

# 停止 Sync Service（可能本地运行）
echo ""
log_info "停止 Sync Service..."
SYNC_PID_FILE="$BACKEND_DIR/services/sync-service/logs/sync.pid"
if [ -f "$SYNC_PID_FILE" ]; then
    kill "$(cat "$SYNC_PID_FILE")" 2>/dev/null
    rm -f "$SYNC_PID_FILE"
fi
pkill -f "sync-service" 2>/dev/null
log_success "Sync Service 已停止"

# 停止 Telegram Bot（可能本地运行）
echo ""
log_info "停止 Telegram Bot..."
cd "$BACKEND_DIR/services/telegram-service" 2>/dev/null && ./scripts/start.sh stop 2>/dev/null
log_success "Telegram Bot 已停止"

# 停止 data-service
echo ""
log_info "停止 data-service..."
DATA_PID_FILE="$BACKEND_DIR/services/data-service/logs/ws.pid"
if [ -f "$DATA_PID_FILE" ]; then
    kill "$(cat "$DATA_PID_FILE")" 2>/dev/null
    rm -f "$DATA_PID_FILE"
fi
pkill -f "src --ws" 2>/dev/null
log_success "data-service 已停止"

# 停止 signal-service
echo ""
log_info "停止 signal-service..."
cd "$BACKEND_DIR/services/signal-service" 2>/dev/null && ./scripts/start.sh stop 2>/dev/null
log_success "signal-service 已停止"

# 停止 trading-service
echo ""
log_info "停止 trading-service..."
TRADING_PID_FILE="$BACKEND_DIR/services/trading-service/logs/trading.pid"
if [ -f "$TRADING_PID_FILE" ]; then
    kill "$(cat "$TRADING_PID_FILE")" 2>/dev/null
    rm -f "$TRADING_PID_FILE"
fi
pkill -f "src --once" 2>/dev/null
log_success "trading-service 已停止"

# 停止 execution-service (V2.6.0 新增)
echo ""
log_info "停止 Execution Service..."
EXEC_PID_FILE="$BACKEND_DIR/services/execution-service/logs/execution.pid"
if [ -f "$EXEC_PID_FILE" ]; then
    kill "$(cat "$EXEC_PID_FILE")" 2>/dev/null
    rm -f "$EXEC_PID_FILE"
fi
pkill -f "execution-service" 2>/dev/null
pkill -f "src --port 8092" 2>/dev/null
log_success "Execution Service 已停止"

# 停止 Web Dashboard
echo ""
log_info "停止 Web Dashboard..."
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
log_success "Web Dashboard 已停止"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    所有服务已停止                           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 残留进程检查
echo "【残留进程检查】"
REMAINING=$(pgrep -f "(api-service|data-service|signal-service|trading-service|sync-service|execution-service|telegram.*bot)" 2>/dev/null | wc -l)
if [ "$REMAINING" -eq 0 ]; then
    log_success "无残留进程"
else
    echo -e "${YELLOW}[WARN]${NC} 发现 $REMAINING 个残留进程"
    pgrep -af "(api-service|data-service|signal-service|trading-service|sync-service|execution-service|telegram.*bot)" | head -5
fi

# Docker 容器状态
echo ""
echo "【Docker 容器状态】"
if docker info > /dev/null 2>&1; then
    RUNNING=$(docker ps --format "{{.Names}}" 2>/dev/null | grep "ab-" | wc -l)
    if [ "$RUNNING" -eq 0 ]; then
        log_success "所有 ab-* 容器已停止"
    else
        echo -e "${YELLOW}[INFO]${NC} 以下容器仍在运行 (数据库可保持):"
        docker ps --format "  {{.Names}}\t{{.Status}}" 2>/dev/null | grep "ab-"
    fi
fi

echo ""

if [ -t 0 ]; then
    read -p "按 Enter 键关闭..."
fi

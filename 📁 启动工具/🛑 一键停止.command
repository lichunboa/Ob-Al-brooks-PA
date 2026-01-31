#!/bin/bash
# ============================================================
# AB Console - 一键停止工具
# 停止所有服务
# ============================================================

cd "$(dirname "$0")/.."
BACKEND_DIR="$(pwd)/AB Console-Backend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          AB Console - 一键停止工具                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 停止 API Service
log_info "停止 API Service..."
cd "$BACKEND_DIR/services-preview/api-service" 2>/dev/null && ./scripts/start.sh stop 2>/dev/null
pkill -f "api-service" 2>/dev/null
log_success "API Service 已停止"

# 停止 Telegram Bot
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
REMAINING=$(pgrep -f "(api-service|data-service|signal-service|trading-service|telegram.*bot)" 2>/dev/null | wc -l)
if [ "$REMAINING" -eq 0 ]; then
    log_success "无残留进程"
else
    echo -e "${YELLOW}[WARN]${NC} 发现 $REMAINING 个残留进程"
    pgrep -af "(api-service|data-service|signal-service|trading-service|telegram.*bot)" | head -5
fi

echo ""

if [ -t 0 ]; then
    read -p "按 Enter 键关闭..."
fi

#!/bin/bash
# =============================================================================
# TradeCat Docker 入口脚本
# 用法:
#   docker run tradecat all           # 启动所有服务
#   docker run tradecat data          # 只启动 data-service
#   docker run tradecat trading       # 只启动 trading-service
#   docker run tradecat telegram      # 只启动 telegram-service
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 等待数据库就绪
wait_for_db() {
    if [ -z "$DATABASE_URL" ]; then
        log_warn "DATABASE_URL not set, skipping database check"
        return 0
    fi

    log_info "Waiting for database..."
    
    # 解析 DATABASE_URL
    DB_HOST=$(echo $DATABASE_URL | sed -E 's|.*@([^:/]+).*|\1|')
    DB_PORT=$(echo $DATABASE_URL | sed -E 's|.*:([0-9]+)/.*|\1|')
    
    for i in $(seq 1 30); do
        if python -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(1)
try:
    s.connect(('$DB_HOST', $DB_PORT))
    s.close()
    exit(0)
except:
    exit(1)
" 2>/dev/null; then
            log_info "Database is ready!"
            return 0
        fi
        log_info "Waiting for database... ($i/30)"
        sleep 2
    done
    
    log_error "Database connection timeout"
    return 1
}

# 启动 data-service
start_data_service() {
    log_info "Starting data-service..."
    cd /app/services/data-service
    python -m src "$@" &
    DATA_PID=$!
    echo $DATA_PID > /app/pids/data-service.pid
    log_info "data-service started (PID: $DATA_PID)"
}

# 启动 trading-service
start_trading_service() {
    log_info "Starting trading-service..."
    cd /app/services/trading-service
    python -m src.simple_scheduler "$@" &
    TRADING_PID=$!
    echo $TRADING_PID > /app/pids/trading-service.pid
    log_info "trading-service started (PID: $TRADING_PID)"
}

# 启动 telegram-service
start_telegram_service() {
    log_info "Starting telegram-service..."
    cd /app/services/telegram-service
    python -m src.main "$@" &
    TELEGRAM_PID=$!
    echo $TELEGRAM_PID > /app/pids/telegram-service.pid
    log_info "telegram-service started (PID: $TELEGRAM_PID)"
}

# 主函数
main() {
    local SERVICE="${1:-all}"
    shift || true

    log_info "TradeCat Docker Container Starting..."
    log_info "Service: $SERVICE"
    
    # 等待数据库
    wait_for_db || exit 1

    case "$SERVICE" in
        all)
            start_data_service
            sleep 5  # 等待数据服务初始化
            start_trading_service
            sleep 2
            start_telegram_service
            ;;
        data)
            start_data_service "$@"
            ;;
        trading)
            start_trading_service "$@"
            ;;
        telegram)
            start_telegram_service "$@"
            ;;
        shell|bash)
            exec /bin/bash
            ;;
        *)
            log_error "Unknown service: $SERVICE"
            log_info "Available: all, data, trading, telegram, shell"
            exit 1
            ;;
    esac

    # 保持容器运行
    log_info "All services started. Waiting..."
    
    # 捕获信号，优雅退出
    trap 'log_info "Shutting down..."; kill $(cat /app/pids/*.pid 2>/dev/null) 2>/dev/null; exit 0' SIGTERM SIGINT
    
    # 等待子进程
    wait
}

main "$@"

#!/bin/bash
# =============================================================================
# TradeCat Docker 入口脚本
# 用法:
#   docker run tradecat all           # 启动所有服务
#   docker run tradecat data          # 只启动 data-service
#   docker run tradecat trading       # 只启动 trading-service
#   docker run tradecat telegram      # 只启动 telegram-service
# =============================================================================

# 严格模式：未定义变量报错、管道失败立即退出
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# 环境设置
# =============================================================================
# 固定 PYTHONPATH，防止 .env 注入覆盖
export PYTHONPATH="/app:/app/libs"
# 固定 PATH，防止恶意覆盖
export PATH="/usr/local/bin:/usr/bin:/bin"

# 确保 config/.env 存在
if [ ! -f /app/config/.env ]; then
    if [ -f /app/config/.env.example ]; then
        log_warn "config/.env not found, copying from .env.example"
        cp /app/config/.env.example /app/config/.env
    else
        log_error "config/.env not found and no .env.example available"
        exit 1
    fi
fi

# 白名单加载环境变量（只导入已知安全的变量）
# 修复：正确解析 KEY=VALUE 格式，支持值中包含 = 的情况
load_env_whitelist() {
    local env_file="$1"
    local whitelist=(
        "BOT_TOKEN" "DATABASE_URL" "HTTP_PROXY" "HTTPS_PROXY"
        "SYMBOLS_GROUPS" "INTERVALS" "DEFAULT_LOCALE" "SUPPORTED_LOCALES"
        "BACKFILL_MODE" "BACKFILL_DAYS" "MAX_WORKERS" "MAX_CONCURRENT"
        "BINANCE_API_DISABLED" "INDICATORS_ENABLED" "INDICATORS_DISABLED"
        "POSTGRES_USER" "POSTGRES_PASSWORD"
    )
    
    local loaded_count=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        # 跳过空行和注释
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        
        # 去除行首空格
        line="${line#"${line%%[![:space:]]*}"}"
        
        # 必须包含 = 才是有效的键值对
        [[ "$line" != *"="* ]] && continue
        
        # 分割 KEY 和 VALUE（VALUE 可能包含 =）
        local key="${line%%=*}"
        local value="${line#*=}"
        
        # 去除 key 的空格
        key="${key%"${key##*[![:space:]]}"}"
        key="${key#"${key%%[![:space:]]*}"}"
        
        # 去除 value 首尾空格和引号
        value="${value%"${value##*[![:space:]]}"}"
        value="${value#"${value%%[![:space:]]*}"}"
        # 去除首尾引号（单引号或双引号）
        if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
            value="${BASH_REMATCH[1]}"
        fi
        
        # 只导入白名单中的变量
        for allowed in "${whitelist[@]}"; do
            if [[ "$key" == "$allowed" ]]; then
                export "$key=$value"
                ((loaded_count++))
                log_info "  Loaded: $key"
                break
            fi
        done
    done < "$env_file"
    
    log_info "Loaded $loaded_count whitelisted variables from $env_file"
}

log_info "Loading config/.env (whitelist mode)"
load_env_whitelist /app/config/.env

# =============================================================================
# 必需变量校验
# =============================================================================
validate_required_vars() {
    local missing=()
    local service="${1:-all}"
    
    # BOT_TOKEN 是 telegram-service 必需的
    if [[ "$service" == "all" || "$service" == "telegram" ]]; then
        if [ -z "${BOT_TOKEN:-}" ]; then
            missing+=("BOT_TOKEN")
        fi
    fi
    
    # DATABASE_URL 是 data-service 和 trading-service 必需的
    if [[ "$service" == "all" || "$service" == "data" || "$service" == "trading" ]]; then
        if [ -z "${DATABASE_URL:-}" ]; then
            missing+=("DATABASE_URL")
        fi
    fi
    
    # 检查 POSTGRES_PASSWORD 不能是默认弱密码
    if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
        local weak_passwords=("postgres" "password" "123456" "tradecat_change_me_in_production")
        for weak in "${weak_passwords[@]}"; do
            if [[ "${POSTGRES_PASSWORD}" == "$weak" ]]; then
                log_error "POSTGRES_PASSWORD is set to a weak default value: '$weak'"
                log_error "Please set a strong password via: export POSTGRES_PASSWORD=your_secure_password"
                exit 1
            fi
        done
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required environment variables: ${missing[*]}"
        log_error "Please set them in config/.env"
        exit 1
    fi
    
    log_info "Required variables validated for service: $service"
}

# =============================================================================
# 等待数据库就绪
# =============================================================================
wait_for_db() {
    if [ -z "$DATABASE_URL" ]; then
        log_warn "DATABASE_URL not set, skipping database check"
        return 0
    fi

    log_info "Waiting for database..."
    
    # 解析 DATABASE_URL: postgresql://user:pass@host:port/db
    # 支持无端口情况（默认 5432）
    DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
    DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*@[^:]+:([0-9]+)/.*|\1|')
    
    # 如果没有端口，默认 5432
    if [ -z "$DB_PORT" ] || [ "$DB_PORT" = "$DATABASE_URL" ]; then
        DB_PORT=5432
    fi
    
    log_info "Database: $DB_HOST:$DB_PORT"
    
    # 阶段 1：等待 TCP 连通
    for i in $(seq 1 60); do
        if python -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(2)
try:
    s.connect(('$DB_HOST', $DB_PORT))
    s.close()
    exit(0)
except:
    exit(1)
" 2>/dev/null; then
            log_info "Database TCP connection ready!"
            break
        fi
        log_info "Waiting for database TCP... ($i/60)"
        sleep 2
        
        if [ "$i" -eq 60 ]; then
            log_error "Database TCP connection timeout"
            return 1
        fi
    done
    
    # 阶段 2：等待 schema 就绪（验证核心表存在）
    log_info "Waiting for database schema initialization..."
    for i in $(seq 1 30); do
        if python -c "
import psycopg
import os
try:
    conn = psycopg.connect(os.environ.get('DATABASE_URL'))
    cur = conn.cursor()
    # 验证核心表存在
    cur.execute(\"SELECT 1 FROM information_schema.tables WHERE table_schema='market_data' AND table_name='candles_1m'\")
    if cur.fetchone():
        conn.close()
        exit(0)
    conn.close()
except Exception as e:
    pass
exit(1)
" 2>/dev/null; then
            log_info "Database schema is ready!"
            return 0
        fi
        log_info "Waiting for schema initialization... ($i/30)"
        sleep 3
    done
    
    log_warn "Database schema not fully initialized, proceeding anyway..."
    return 0
}

# =============================================================================
# 启动服务
# =============================================================================

# 启动 data-service
start_data_service() {
    log_info "Starting data-service..."
    cd /app/services/data-service
    export PYTHONPATH="src:$PYTHONPATH"
    # --all 启动所有采集器（ws + metrics）
    python -m src --all &
    DATA_PID=$!
    echo $DATA_PID > /app/pids/data-service.pid
    log_info "data-service started (PID: $DATA_PID)"
}

# 启动 trading-service
start_trading_service() {
    log_info "Starting trading-service..."
    cd /app/services/trading-service
    export PYTHONPATH="src:$PYTHONPATH"
    python -m src.simple_scheduler &
    TRADING_PID=$!
    echo $TRADING_PID > /app/pids/trading-service.pid
    log_info "trading-service started (PID: $TRADING_PID)"
}

# 启动 telegram-service
start_telegram_service() {
    log_info "Starting telegram-service..."
    cd /app/services/telegram-service
    export PYTHONPATH="src:$PYTHONPATH"
    python -m src.main &
    TELEGRAM_PID=$!
    echo $TELEGRAM_PID > /app/pids/telegram-service.pid
    log_info "telegram-service started (PID: $TELEGRAM_PID)"
}

# =============================================================================
# 进程监督（检查子进程存活，任一退出则容器退出）
# =============================================================================
supervise_processes() {
    log_info "Starting process supervision..."
    
    while true; do
        sleep 10
        
        local failed=()
        
        # 检查各服务进程
        if [ -f /app/pids/data-service.pid ]; then
            local pid=$(cat /app/pids/data-service.pid 2>/dev/null)
            if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
                failed+=("data-service")
            fi
        fi
        
        if [ -f /app/pids/trading-service.pid ]; then
            local pid=$(cat /app/pids/trading-service.pid 2>/dev/null)
            if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
                failed+=("trading-service")
            fi
        fi
        
        if [ -f /app/pids/telegram-service.pid ]; then
            local pid=$(cat /app/pids/telegram-service.pid 2>/dev/null)
            if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
                failed+=("telegram-service")
            fi
        fi
        
        # 如果有服务退出，记录并退出容器
        if [ ${#failed[@]} -gt 0 ]; then
            log_error "Service(s) died: ${failed[*]}"
            log_error "Container will exit to trigger restart"
            cleanup_and_exit 1
        fi
    done
}

# 清理并退出
cleanup_and_exit() {
    local exit_code="${1:-0}"
    log_info "Cleaning up..."
    
    # 终止所有子进程
    for pidfile in /app/pids/*.pid; do
        if [ -f "$pidfile" ]; then
            local pid=$(cat "$pidfile" 2>/dev/null)
            if [ -n "$pid" ]; then
                kill "$pid" 2>/dev/null || true
            fi
        fi
    done
    
    # 等待子进程退出
    sleep 2
    
    exit "$exit_code"
}

# 主函数
main() {
    local SERVICE="${1:-all}"
    shift || true

    log_info "TradeCat Docker Container Starting..."
    log_info "Service mode: $SERVICE"
    
    # 记录运行模式（供健康检查使用）
    echo "$SERVICE" > /app/pids/service_mode
    
    # 校验必需变量（根据服务类型）
    validate_required_vars "$SERVICE"
    
    # 等待数据库（telegram-only 模式可跳过）
    if [[ "$SERVICE" != "telegram" ]]; then
        wait_for_db || exit 1
    fi

    # 捕获信号，优雅退出
    trap 'log_info "Received shutdown signal"; cleanup_and_exit 0' SIGTERM SIGINT

    case "$SERVICE" in
        all)
            start_data_service
            sleep 5  # 等待数据服务初始化
            start_trading_service
            sleep 2
            start_telegram_service
            # 启动进程监督
            supervise_processes
            ;;
        data)
            start_data_service
            wait
            ;;
        trading)
            start_trading_service
            wait
            ;;
        telegram)
            start_telegram_service
            wait
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
}

main "$@"

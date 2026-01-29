#!/usr/bin/env bash
# ab-console macOS 兼容启动脚本
# 修复了 grep -P 兼容性问题

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 核心服务
SERVICES=(ai-service data-service signal-service telegram-service trading-service)

# 守护进程配置
DAEMON_PID="$ROOT/run/daemon.pid"
DAEMON_LOG="$ROOT/logs/daemon.log"
MAX_RESTART_ATTEMPTS=5
RESTART_WINDOW=300
BASE_BACKOFF=10
MAX_BACKOFF=300
CHECK_INTERVAL=30

mkdir -p "$ROOT/run" "$ROOT/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$DAEMON_LOG"
}

# ==================== macOS 兼容的数据库检查 ====================
check_database() {
    local config_file="$ROOT/config/.env"
    if [ ! -f "$config_file" ]; then
        return 0
    fi
    
    local db_url=$(grep "^DATABASE_URL=" "$config_file" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
    if [ -z "$db_url" ]; then
        return 0
    fi
    
    # macOS 兼容的端口解析 (不使用 grep -P)
    local db_host=$(echo "$db_url" | sed -n 's|.*@\([^:/]*\).*|\1|p')
    local db_port="5432"
    
    # 使用 sed 替代 grep -P 来提取端口
    if echo "$db_url" | grep -q ":[0-9]*/"; then
        db_port=$(echo "$db_url" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
    fi
    
    [ -z "$db_host" ] && db_host="localhost"
    [ -z "$db_port" ] && db_port="5432"
    
    if command -v pg_isready &>/dev/null; then
        if ! pg_isready -h "$db_host" -p "$db_port" -q -t 3 2>/dev/null; then
            echo -e "\033[0;31m✗ 数据库未就绪: $db_host:$db_port\033[0m"
            echo "  请确保 TimescaleDB 已启动后重试"
            return 1
        fi
    fi
    return 0
}

# ==================== 启动所有服务 ====================
start_all() {
    echo "=== 启动全部服务 ==="
    
    if ! check_database; then
        echo "服务启动已取消"
        return 1
    fi
    
    for svc in "${SERVICES[@]}"; do
        local svc_dir="$ROOT/services/$svc"
        if [ -d "$svc_dir" ]; then
            cd "$svc_dir"
            if [ -x "./scripts/start.sh" ]; then
                ./scripts/start.sh start 2>&1 | sed "s/^/  [$svc] /"
            else
                echo "  [$svc] 启动脚本不存在或无权限"
            fi
        else
            echo "  [$svc] 目录不存在，跳过"
        fi
    done
}

# ==================== 停止所有服务 ====================
stop_all() {
    echo "=== 停止全部服务 ==="
    for svc in "${SERVICES[@]}"; do
        local svc_dir="$ROOT/services/$svc"
        if [ -d "$svc_dir" ]; then
            cd "$svc_dir"
            if [ -x "./scripts/start.sh" ]; then
                ./scripts/start.sh stop 2>&1 | sed "s/^/  [$svc] /"
            fi
        fi
    done
}

# ==================== 状态查询 ====================
status_all() {
    echo "=== 服务状态 ==="
    for svc in "${SERVICES[@]}"; do
        local svc_dir="$ROOT/services/$svc"
        if [ -d "$svc_dir" ]; then
            cd "$svc_dir"
            if [ -x "./scripts/start.sh" ]; then
                ./scripts/start.sh status 2>&1 | sed "s/^/  [$svc] /"
                echo ""
            else
                echo "  [$svc] 启动脚本不存在"
            fi
        fi
    done
}

# ==================== 入口 ====================
case "${1:-status}" in
    start)       start_all ;;
    stop)        stop_all ;;
    status)      status_all ;;
    restart)     stop_all; sleep 2; start_all ;;
    *)
        echo "用法: $0 {start|stop|status|restart}"
        echo ""
        echo "命令说明:"
        echo "  start   - 启动所有核心服务"
        echo "  stop    - 停止所有核心服务"
        echo "  status  - 查看服务状态"
        echo "  restart - 重启所有服务"
        exit 1
        ;;
esac

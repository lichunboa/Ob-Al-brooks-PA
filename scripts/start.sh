#!/usr/bin/env bash
# tradecat 统一启动脚本
# 用法: ./scripts/start.sh {start|stop|status|restart|daemon|daemon-stop}

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 核心服务（与 init.sh 保持一致）
# ai-service 作为 telegram-service 子模块运行，signal-service 为独立服务
SERVICES=(data-service trading-service telegram-service)

# 可选：启用全部核心服务（含 ai-service, signal-service）
# SERVICES=(data-service trading-service telegram-service ai-service signal-service)

# 守护进程配置
DAEMON_PID="$ROOT/daemon.pid"
DAEMON_LOG="$ROOT/daemon.log"
MAX_RESTART_ATTEMPTS=5          # 每个服务最大连续重启次数
RESTART_WINDOW=300              # 重启计数重置窗口（秒）
BASE_BACKOFF=10                 # 基础退避时间（秒）
MAX_BACKOFF=300                 # 最大退避时间（秒）
CHECK_INTERVAL=30               # 检查间隔（秒）

# ==================== 工具函数 ====================
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$DAEMON_LOG"
}

# ==================== 数据库就绪检查 ====================
check_database() {
    local config_file="$ROOT/config/.env"
    if [ ! -f "$config_file" ]; then
        return 0  # 无配置，跳过检查
    fi
    
    local db_url=$(grep "^DATABASE_URL=" "$config_file" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
    if [ -z "$db_url" ]; then
        return 0  # 无 DATABASE_URL，跳过检查
    fi
    
    # 解析连接信息
    local db_host=$(echo "$db_url" | sed -n 's|.*@\([^:/]*\).*|\1|p')
    local db_port=$(echo "$db_url" | grep -oP ':\K\d+(?=/)' || echo "5432")
    [ -z "$db_host" ] && db_host="localhost"
    
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
    
    # 数据库就绪检查（仅对 data-service 和 trading-service）
    if ! check_database; then
        echo "服务启动已取消"
        return 1
    fi
    
    for svc in "${SERVICES[@]}"; do
        local svc_dir="$ROOT/services/$svc"
        if [ -d "$svc_dir" ]; then
            cd "$svc_dir"
            ./scripts/start.sh start 2>&1 | sed "s/^/  [$svc] /"
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
            ./scripts/start.sh stop 2>&1 | sed "s/^/  [$svc] /"
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
            ./scripts/start.sh status 2>&1 | sed "s/^/  [$svc] /"
            echo ""
        fi
    done
}

# ==================== 守护进程（带重试上限和指数退避）====================
daemon_all() {
    echo "=== 启动守护进程模式 ==="
    
    # 检查是否已运行
    if [ -f "$DAEMON_PID" ] && kill -0 "$(cat "$DAEMON_PID")" 2>/dev/null; then
        echo "守护进程已运行 (PID: $(cat "$DAEMON_PID"))"
        return 0
    fi
    
    # 数据库就绪检查
    if ! check_database; then
        echo "守护进程启动已取消"
        return 1
    fi
    
    # 先启动所有服务
    start_all
    
    # 启动守护循环（子进程）
    (
        # 每个服务的重启计数和时间戳
        declare -A restart_counts
        declare -A last_restart_time
        declare -A backoff_time
        declare -A limit_logged  # 防止日志风暴：是否已记录达到上限
        
        for svc in "${SERVICES[@]}"; do
            restart_counts[$svc]=0
            last_restart_time[$svc]=0
            backoff_time[$svc]=$BASE_BACKOFF
            limit_logged[$svc]=0
        done
        
        log "守护进程启动 (检查间隔: ${CHECK_INTERVAL}s, 最大重试: $MAX_RESTART_ATTEMPTS)"
        
        while true; do
            sleep $CHECK_INTERVAL
            current_time=$(date +%s)
            
            for svc in "${SERVICES[@]}"; do
                local svc_dir="$ROOT/services/$svc"
                [ ! -d "$svc_dir" ] && continue
                
                cd "$svc_dir"
                
                # 检查服务状态（使用退出码）
                if ./scripts/start.sh status >/dev/null 2>&1; then
                    # 服务运行中，重置计数
                    if [ "${restart_counts[$svc]}" -gt 0 ]; then
                        log "$svc: 恢复正常，重置重启计数"
                        restart_counts[$svc]=0
                        backoff_time[$svc]=$BASE_BACKOFF
                    fi
                    continue
                fi
                
                # 服务未运行
                local time_since_last=$((current_time - ${last_restart_time[$svc]}))
                
                # 如果超过重置窗口，重置计数
                if [ $time_since_last -gt $RESTART_WINDOW ]; then
                    restart_counts[$svc]=0
                    backoff_time[$svc]=$BASE_BACKOFF
                fi
                
                # 检查是否超过重试上限
                if [ "${restart_counts[$svc]}" -ge $MAX_RESTART_ATTEMPTS ]; then
                    if [ $time_since_last -lt $RESTART_WINDOW ]; then
                        # 仅首次记录，防止日志风暴
                        if [ "${limit_logged[$svc]}" -eq 0 ]; then
                            log "⚠️ $svc: 达到重试上限 ($MAX_RESTART_ATTEMPTS)，暂停重启 ${RESTART_WINDOW}s"
                            echo "$(date '+%Y-%m-%d %H:%M:%S') ⚠️ $svc 达到重试上限" >> "$ROOT/alerts.log"
                            limit_logged[$svc]=1
                        fi
                        continue
                    else
                        # 重置计数，允许新一轮重试
                        log "$svc: 重试窗口已过，重置计数"
                        restart_counts[$svc]=0
                        backoff_time[$svc]=$BASE_BACKOFF
                        limit_logged[$svc]=0
                    fi
                fi
                
                # 检查退避时间
                if [ $time_since_last -lt "${backoff_time[$svc]}" ]; then
                    continue
                fi
                
                # 执行重启
                restart_counts[$svc]=$((${restart_counts[$svc]} + 1))
                last_restart_time[$svc]=$current_time
                
                log "$svc: 未运行，重启 (尝试 ${restart_counts[$svc]}/$MAX_RESTART_ATTEMPTS)"
                ./scripts/start.sh start >> "$DAEMON_LOG" 2>&1
                
                # 指数退避（翻倍，但不超过最大值）
                backoff_time[$svc]=$((${backoff_time[$svc]} * 2))
                if [ "${backoff_time[$svc]}" -gt $MAX_BACKOFF ]; then
                    backoff_time[$svc]=$MAX_BACKOFF
                fi
                
                # 重启失败告警
                if [ "${restart_counts[$svc]}" -ge $MAX_RESTART_ATTEMPTS ]; then
                    log "⚠️ $svc: 连续重启 $MAX_RESTART_ATTEMPTS 次失败，请人工检查！"
                    echo "$(date '+%Y-%m-%d %H:%M:%S') ⚠️ $svc 连续重启失败" >> "$ROOT/alerts.log"
                fi
            done
        done
    ) &
    
    local daemon_pid=$!
    echo $daemon_pid > "$DAEMON_PID"
    echo "守护进程已启动 (PID: $daemon_pid)"
    log "守护进程 PID: $daemon_pid"
}

# ==================== 停止守护进程 ====================
daemon_stop() {
    echo "=== 停止守护进程 ==="
    
    if [ -f "$DAEMON_PID" ]; then
        local pid=$(cat "$DAEMON_PID")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            echo "守护进程已停止 (PID: $pid)"
            log "守护进程已停止 (PID: $pid)"
        else
            echo "守护进程未运行"
        fi
        rm -f "$DAEMON_PID"
    else
        echo "守护进程未运行"
    fi
    
    # 停止所有服务
    stop_all
}

# ==================== 入口 ====================
case "${1:-status}" in
    start)       start_all ;;
    stop)        stop_all ;;
    status)      status_all ;;
    restart)     stop_all; sleep 2; start_all ;;
    daemon)      daemon_all ;;
    daemon-stop) daemon_stop ;;
    *)
        echo "用法: $0 {start|stop|status|restart|daemon|daemon-stop}"
        echo ""
        echo "命令说明:"
        echo "  start       - 启动所有核心服务"
        echo "  stop        - 停止所有核心服务"
        echo "  status      - 查看服务状态"
        echo "  restart     - 重启所有服务"
        echo "  daemon      - 启动守护进程模式（自动重启崩溃的服务）"
        echo "  daemon-stop - 停止守护进程和所有服务"
        exit 1
        ;;
esac

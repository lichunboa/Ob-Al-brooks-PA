#!/usr/bin/env bash
# tradecat 统一启动脚本
# 用法: ./scripts/start.sh {start|stop|status|restart}

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICES=(data-service trading-service telegram-service)

start_all() {
    echo "=== 启动全部服务（守护模式）==="
    for svc in "${SERVICES[@]}"; do
        cd "$ROOT/services/$svc"
        # data-service 使用 daemon 命令启动守护进程
        if [ "$svc" = "data-service" ]; then
            ./scripts/start.sh start 2>&1 | sed "s/^/  [$svc] /"
        else
            ./scripts/start.sh start 2>&1 | sed "s/^/  [$svc] /"
        fi
    done
}

stop_all() {
    echo "=== 停止全部服务 ==="
    for svc in "${SERVICES[@]}"; do
        cd "$ROOT/services/$svc"
        ./scripts/start.sh stop 2>&1 | sed "s/^/  [$svc] /"
    done
}

status_all() {
    echo "=== 服务状态 ==="
    for svc in "${SERVICES[@]}"; do
        cd "$ROOT/services/$svc"
        ./scripts/start.sh status 2>&1 | sed "s/^/  [$svc] /"
        echo ""
    done
}

daemon_all() {
    echo "=== 启动守护进程模式 ==="
    # 启动项目级守护进程
    DAEMON_PID="$ROOT/daemon.pid"
    DAEMON_LOG="$ROOT/daemon.log"
    
    if [ -f "$DAEMON_PID" ] && kill -0 "$(cat "$DAEMON_PID")" 2>/dev/null; then
        echo "守护进程已运行 (PID: $(cat "$DAEMON_PID"))"
        return 0
    fi
    
    # 先启动所有服务
    start_all
    
    # 启动守护循环
    (
        while true; do
            sleep 30
            for svc in "${SERVICES[@]}"; do
                cd "$ROOT/services/$svc"
                # 使用退出码判断服务状态（0=运行中，非0=未运行）
                # 比字符串匹配更可靠，不受输出语言/格式变化影响
                if ! ./scripts/start.sh status >/dev/null 2>&1; then
                    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 检测到 $svc 未运行（退出码非0），重启..." >> "$DAEMON_LOG"
                    ./scripts/start.sh start >> "$DAEMON_LOG" 2>&1
                fi
            done
        done
    ) &
    echo $! > "$DAEMON_PID"
    echo "守护进程已启动 (PID: $!)"
}

daemon_stop() {
    echo "=== 停止守护进程 ==="
    DAEMON_PID="$ROOT/daemon.pid"
    
    if [ -f "$DAEMON_PID" ]; then
        local pid=$(cat "$DAEMON_PID")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            echo "守护进程已停止 (PID: $pid)"
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

case "${1:-status}" in
    start)       start_all ;;
    stop)        stop_all ;;
    status)      status_all ;;
    restart)     stop_all; sleep 2; start_all ;;
    daemon)      daemon_all ;;
    daemon-stop) daemon_stop ;;
    *)
        echo "用法: $0 {start|stop|status|restart|daemon|daemon-stop}"
        exit 1
        ;;
esac

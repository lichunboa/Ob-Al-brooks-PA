#!/bin/bash
# AB Console 服务守护脚本 - 自动重启停止的服务
# 用法: ./service-daemon.sh [start|stop|status]

PROJECT_ROOT="/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend"
DAEMON_LOG="$PROJECT_ROOT/logs/service-daemon.log"
PID_FILE="$PROJECT_ROOT/logs/service-daemon.pid"

# 确保日志目录存在
mkdir -p "$PROJECT_ROOT/logs"

# 检查服务是否运行
check_service() {
    local name=$1
    local pattern=$2
    if ps aux | grep -v grep | grep -q "$pattern"; then
        return 0
    else
        return 1
    fi
}

# 启动单个服务
start_service() {
    local service=$1
    local port=$2
    echo "$(date '+%Y-%m-%d %H:%M:%S') - 启动 $service..." >> "$DAEMON_LOG"
    
    case $service in
        telegram-service)
            cd "$PROJECT_ROOT/services/telegram-service"
            source .venv/bin/activate
            nohup python src/bot/app.py >> telegram.log 2>&1 &
            ;;
        signal-service)
            cd "$PROJECT_ROOT/services/signal-service"
            make run >> signal.log 2>&1 &
            ;;
        data-service)
            cd "$PROJECT_ROOT/services/data-service"
            source .venv/bin/activate
            nohup python -m src >> data.log 2>&1 &
            ;;
        trading-service)
            cd "$PROJECT_ROOT/services/trading-service"
            make run-async >> trading.log 2>&1 &
            ;;
    esac
    sleep 3
}

# 守护进程主循环
daemon_loop() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - 服务守护进程启动" >> "$DAEMON_LOG"
    
    while true; do
        # 检查并重启 telegram-service
        if ! check_service "telegram-service" "python.*bot/app.py"; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - telegram-service 已停止，正在重启..." >> "$DAEMON_LOG"
            start_service "telegram-service"
        fi
        
        # 检查并重启 signal-service
        if ! check_service "signal-service" "python.*signal-service.*--"; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - signal-service 已停止，正在重启..." >> "$DAEMON_LOG"
            start_service "signal-service"
        fi
        
        # 检查 Clawdbot
        if ! pgrep -f "clawdbot-gateway" > /dev/null; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - Clawdbot 已停止，正在重启..." >> "$DAEMON_LOG"
            ~/.nvm/versions/node/v24.7.0/bin/clawdbot gateway >> /dev/null 2>&1 &
        fi
        
        # 每30秒检查一次
        sleep 30
    done
}

# 显示状态
show_status() {
    echo "=== 服务守护进程状态 ==="
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "守护进程: 运行中 (PID: $(cat $PID_FILE))"
    else
        echo "守护进程: 已停止"
    fi
    echo ""
    echo "最近日志:"
    tail -10 "$DAEMON_LOG" 2>/dev/null || echo "暂无日志"
}

# 启动守护进程
start_daemon() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "守护进程已在运行 (PID: $(cat $PID_FILE))"
        exit 0
    fi
    
    daemon_loop &
    echo $! > "$PID_FILE"
    echo "服务守护进程已启动 (PID: $!)"
    echo "日志: $DAEMON_LOG"
}

# 停止守护进程
stop_daemon() {
    if [ -f "$PID_FILE" ]; then
        kill $(cat "$PID_FILE") 2>/dev/null
        rm -f "$PID_FILE"
        echo "服务守护进程已停止"
    else
        echo "守护进程未运行"
    fi
}

# 主命令
case "${1:-status}" in
    start)
        start_daemon
        ;;
    stop)
        stop_daemon
        ;;
    status)
        show_status
        ;;
    *)
        echo "用法: $0 [start|stop|status]"
        exit 1
        ;;
esac

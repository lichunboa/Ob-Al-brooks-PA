#!/bin/bash
# AB Console 服务监控脚本
# 用法: ./service-monitor.sh [status|start|stop|restart]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend"

# 服务列表
SERVICES=(
    "data-service:8000:Data Service"
    "signal-service:::Signal Service (127 rules)"
    "telegram-service:8090:Telegram Bot (@catbo26bot)"
    "trading-service:::Trading Service (38 indicators)"
    "sync-service:::Sync Service"
)

# 检查端口是否监听
check_port() {
    local port=$1
    if [ -z "$port" ]; then
        echo "N/A"
        return
    fi
    if python3 -c "import socket; s=socket.socket(); s.settimeout(1); result=s.connect_ex(('127.0.0.1',$port)); s.close(); exit(result)" 2>/dev/null; then
        echo "open"
    else
        echo "closed"
    fi
}

# 检查进程
check_process() {
    local service=$1
    local pattern=$2
    if ps aux | grep -v grep | grep -q "$pattern"; then
        echo "running"
    else
        echo "stopped"
    fi
}

# 显示状态
show_status() {
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}              AB Console 服务状态监控面板${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    printf "%-20s %-10s %-10s %-15s %-20s\n" "服务" "端口" "端口状态" "进程状态" "说明"
    echo "────────────────────────────────────────────────────────────────"
    
    for service_info in "${SERVICES[@]}"; do
        IFS=':' read -r service port description <<< "$service_info"
        
        # 检查端口
        port_status=$(check_port "$port")
        
        # 检查进程
        if [ "$service" == "telegram-service" ]; then
            proc_status=$(check_process "$service" "python.*bot/app.py")
        elif [ "$service" == "signal-service" ]; then
            proc_status=$(check_process "$service" "python.*signal-service")
        elif [ "$service" == "data-service" ]; then
            proc_status=$(check_process "$service" "python.*data-service")
        elif [ "$service" == "trading-service" ]; then
            proc_status=$(check_process "$service" "python.*trading-service")
        else
            proc_status=$(check_process "$service" "$service")
        fi
        
        # 颜色显示
        if [ "$proc_status" == "running" ]; then
            proc_color="${GREEN}"
        else
            proc_color="${RED}"
        fi
        
        if [ "$port_status" == "open" ] || [ -z "$port" ]; then
            port_color="${GREEN}"
        else
            port_color="${RED}"
        fi
        
        port_display=${port:-"-"}
        printf "%-20s ${port_color}%-10s${NC} ${port_color}%-10s${NC} ${proc_color}%-15s${NC} %-20s\n" \
            "$service" "$port_display" "$port_status" "$proc_status" "$description"
    done
    
    echo "────────────────────────────────────────────────────────────────"
    
    # Clawdbot 状态
    echo -e "\n${YELLOW}Clawdbot 状态:${NC}"
    if pgrep -f "clawdbot-gateway" > /dev/null; then
        echo -e "  Gateway: ${GREEN}运行中${NC} (PID: $(pgrep -f "clawdbot-gateway"))"
    else
        echo -e "  Gateway: ${RED}已停止${NC}"
    fi
    
    if curl -s http://127.0.0.1:18789/hooks/al-brooks-signal?token=test 2>/dev/null | grep -q "ok"; then
        echo -e "  Webhook: ${GREEN}正常${NC} (port: 18789)"
    else
        echo -e "  Webhook: ${YELLOW}待测试${NC} (port: 18789)"
    fi
    
    # API 转发接口状态
    echo -e "\n${YELLOW}API 转发接口:${NC}"
    if curl -s http://127.0.0.1:8090/api/health 2>/dev/null | grep -q "ok"; then
        echo -e "  Catbo Forward: ${GREEN}正常${NC} (port: 8090)"
    else
        echo -e "  Catbo Forward: ${RED}异常${NC} (port: 8090)"
    fi
    
    echo -e "\n${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "监控时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
}

# 启动所有服务
start_all() {
    echo -e "${YELLOW}正在启动所有服务...${NC}"
    cd "$PROJECT_ROOT"
    make start
}

# 停止所有服务
stop_all() {
    echo -e "${YELLOW}正在停止所有服务...${NC}"
    cd "$PROJECT_ROOT"
    make stop
}

# 重启所有服务
restart_all() {
    echo -e "${YELLOW}正在重启所有服务...${NC}"
    cd "$PROJECT_ROOT"
    make restart
}

# 主命令
case "${1:-status}" in
    status)
        show_status
        ;;
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    restart)
        restart_all
        ;;
    *)
        echo "用法: $0 [status|start|stop|restart]"
        echo ""
        echo "命令:"
        echo "  status   显示所有服务状态（默认）"
        echo "  start    启动所有服务"
        echo "  stop     停止所有服务"
        echo "  restart  重启所有服务"
        exit 1
        ;;
esac

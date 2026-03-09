#!/bin/bash
#
# AB Patrol-Agent 一键启动脚本
#
# 用法：
#   ./start.sh              # 启动所有服务
#   ./start.sh --runtime    # 只启动 runtime
#   ./start.sh --web        # 只启动 web
#   ./start.sh --stop       # 停止所有服务
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$PROJECT_ROOT/AB Patrol-Agent"
WEB_DIR="$PROJECT_ROOT/AB Patrol-Web"

# PID 文件
RUNTIME_PID="$AGENT_DIR/runtime.pid"
WEB_PID="$WEB_DIR/web.pid"

# 日志文件
LOG_DIR="$AGENT_DIR/logs"
RUNTIME_LOG="$LOG_DIR/runtime.log"
WEB_LOG="$LOG_DIR/web.log"

# 创建日志目录
mkdir -p "$LOG_DIR"

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查进程是否运行
is_running() {
    local pid_file=$1
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# 停止服务
stop_service() {
    local name=$1
    local pid_file=$2

    if is_running "$pid_file"; then
        local pid=$(cat "$pid_file")
        print_info "停止 $name (PID: $pid)..."
        kill "$pid" 2>/dev/null || true

        # 等待进程结束
        local count=0
        while ps -p "$pid" > /dev/null 2>&1 && [ $count -lt 10 ]; do
            sleep 1
            count=$((count + 1))
        done

        # 如果还没结束，强制杀死
        if ps -p "$pid" > /dev/null 2>&1; then
            print_warning "$name 未响应，强制停止..."
            kill -9 "$pid" 2>/dev/null || true
        fi

        rm -f "$pid_file"
        print_success "$name 已停止"
    else
        print_info "$name 未运行"
    fi
}

# 启动 Runtime
start_runtime() {
    print_info "启动 AB Patrol-Agent Runtime..."

    if is_running "$RUNTIME_PID"; then
        print_warning "Runtime 已在运行 (PID: $(cat $RUNTIME_PID))"
        return
    fi

    cd "$AGENT_DIR"

    # 检查 .env 文件
    if [ ! -f "config/.env" ]; then
        print_error "config/.env 文件不存在"
        print_info "请先复制 config/.env.example 到 config/.env 并配置"
        exit 1
    fi

    # 启动 runtime
    nohup python3 runtime/pa_runtime.py > "$RUNTIME_LOG" 2>&1 &
    local pid=$!
    echo $pid > "$RUNTIME_PID"

    # 等待启动
    sleep 2

    if is_running "$RUNTIME_PID"; then
        print_success "Runtime 已启动 (PID: $pid)"
        print_info "日志文件: $RUNTIME_LOG"
    else
        print_error "Runtime 启动失败"
        print_info "查看日志: tail -f $RUNTIME_LOG"
        exit 1
    fi
}

# 启动 Web
start_web() {
    print_info "启动 AB Patrol-Web..."

    if is_running "$WEB_PID"; then
        print_warning "Web 已在运行 (PID: $(cat $WEB_PID))"
        return
    fi

    cd "$WEB_DIR"

    # 检查是否已构建
    if [ ! -d ".next" ]; then
        print_info "首次运行，正在构建..."
        npm run build
    fi

    # 启动 web
    nohup npm run start > "$WEB_LOG" 2>&1 &
    local pid=$!
    echo $pid > "$WEB_PID"

    # 等待启动
    sleep 3

    if is_running "$WEB_PID"; then
        print_success "Web 已启动 (PID: $pid)"
        print_info "访问地址: http://localhost:3000"
        print_info "日志文件: $WEB_LOG"
    else
        print_error "Web 启动失败"
        print_info "查看日志: tail -f $WEB_LOG"
        exit 1
    fi
}

# 停止所有服务
stop_all() {
    print_info "停止所有服务..."
    stop_service "Runtime" "$RUNTIME_PID"
    stop_service "Web" "$WEB_PID"
    print_success "所有服务已停止"
}

# 启动所有服务
start_all() {
    print_info "启动所有服务..."
    start_runtime
    start_web
    print_success "所有服务已启动"
    echo ""
    print_info "查看状态: ./start.sh --status"
    print_info "停止服务: ./start.sh --stop"
}

# 查看状态
show_status() {
    echo ""
    echo "=========================================="
    echo "  AB Patrol-Agent 服务状态"
    echo "=========================================="
    echo ""

    # Runtime 状态
    if is_running "$RUNTIME_PID"; then
        local pid=$(cat "$RUNTIME_PID")
        echo -e "${GREEN}✓${NC} Runtime: 运行中 (PID: $pid)"
    else
        echo -e "${RED}✗${NC} Runtime: 未运行"
    fi

    # Web 状态
    if is_running "$WEB_PID"; then
        local pid=$(cat "$WEB_PID")
        echo -e "${GREEN}✓${NC} Web: 运行中 (PID: $pid)"
        echo "  访问地址: http://localhost:3000"
    else
        echo -e "${RED}✗${NC} Web: 未运行"
    fi

    echo ""
}

# 查看日志
show_logs() {
    local service=$1

    if [ "$service" = "runtime" ]; then
        tail -f "$RUNTIME_LOG"
    elif [ "$service" = "web" ]; then
        tail -f "$WEB_LOG"
    else
        print_error "未知服务: $service"
        print_info "用法: ./start.sh --logs [runtime|web]"
        exit 1
    fi
}

# 重启服务
restart_service() {
    local service=$1

    if [ "$service" = "runtime" ]; then
        stop_service "Runtime" "$RUNTIME_PID"
        start_runtime
    elif [ "$service" = "web" ]; then
        stop_service "Web" "$WEB_PID"
        start_web
    elif [ "$service" = "all" ]; then
        stop_all
        start_all
    else
        print_error "未知服务: $service"
        print_info "用法: ./start.sh --restart [runtime|web|all]"
        exit 1
    fi
}

# 显示帮助
show_help() {
    cat << EOF
AB Patrol-Agent 一键启动脚本

用法:
  ./start.sh [选项]

选项:
  (无参数)           启动所有服务
  --runtime          只启动 Runtime
  --web              只启动 Web
  --stop             停止所有服务
  --status           查看服务状态
  --logs [service]   查看日志 (runtime|web)
  --restart [service] 重启服务 (runtime|web|all)
  --help             显示此帮助信息

示例:
  ./start.sh                    # 启动所有服务
  ./start.sh --runtime          # 只启动 Runtime
  ./start.sh --stop             # 停止所有服务
  ./start.sh --logs runtime     # 查看 Runtime 日志
  ./start.sh --restart all      # 重启所有服务

EOF
}

# 主函数
main() {
    case "${1:-}" in
        --runtime)
            start_runtime
            ;;
        --web)
            start_web
            ;;
        --stop)
            stop_all
            ;;
        --status)
            show_status
            ;;
        --logs)
            show_logs "${2:-}"
            ;;
        --restart)
            restart_service "${2:-all}"
            ;;
        --help|-h)
            show_help
            ;;
        "")
            start_all
            show_status
            ;;
        *)
            print_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"

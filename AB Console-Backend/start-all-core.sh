#!/bin/bash
# =============================================================================
# AB Console 核心服务一键启动脚本
# 启动顺序: data-service → trading-service → signal-service → telegram-service
# =============================================================================

cd "$(dirname "$0")"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=============================================================================${NC}"
echo -e "${GREEN}🚀 AB Console 核心服务一键启动脚本${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""

# 检查数据库
echo -e "${BLUE}[准备] 检查数据库连接...${NC}"
if ! python3 -c "import psycopg; conn = psycopg.connect('postgresql://postgres:postgres@localhost:5434/market_data', connect_timeout=3); conn.close()" 2>/dev/null; then
    echo -e "${RED}❌ 无法连接到 PostgreSQL (5434)${NC}"
    echo "请确保 Docker 中的 TimescaleDB 正在运行:"
    echo "  docker ps | grep timescale"
    exit 1
fi
echo -e "${GREEN}✅ 数据库连接正常${NC}"
echo ""

# 停止旧进程
echo -e "${BLUE}[准备] 清理旧进程...${NC}"
pkill -f "python.*data-service" 2>/dev/null || true
pkill -f "python.*trading-service" 2>/dev/null || true
pkill -f "python.*signal-service" 2>/dev/null || true
pkill -f "python.*telegram-service" 2>/dev/null || true
# execution-service: 只在需要重启时才杀（避免误杀正在运行的服务）
# lsof -ti :8092 | xargs kill 2>/dev/null || true
# web dashboard: 同上
# lsof -ti :3001 | xargs kill 2>/dev/null || true
sleep 2
echo -e "${GREEN}✅ 清理完成${NC}"
echo ""

# 启动服务的函数
start_service() {
    local service=$1
    local service_dir="services/$service"
    local extra_args="${2:-}"
    
    echo -e "${BLUE}[启动] $service...${NC}"
    
    if [ ! -d "$service_dir" ]; then
        echo -e "${RED}❌ $service 目录不存在${NC}"
        return 1
    fi
    
    cd "$service_dir"
    source .venv/bin/activate
    
    # 创建必要的目录
    mkdir -p logs run
    
    # 后台启动
    if [ "$service" = "telegram-service" ]; then
        # telegram-service 使用新 Token
        export BOT_TOKEN="8375182106:AAFqQZ6jg5qtdKBi65Ahj2skMwoo5d1OV3Y"
        nohup python src/bot/app.py --token "$BOT_TOKEN" > logs/$service.log 2>&1 &
    elif [ -n "$extra_args" ]; then
        nohup python -m src $extra_args > logs/$service.log 2>&1 &
    else
        nohup python -m src > logs/$service.log 2>&1 &
    fi
    
    local new_pid=$!
    echo $new_pid > run/$service.pid
    
    echo -e "${GREEN}✅ $service 已启动 (PID: $new_pid)${NC}"
    cd ../..
    
    # 等待服务初始化
    sleep 3
    return 0
}

# 1. data-service (数据采集)
start_service "data-service"
echo ""

# 2. trading-service (指标计算) - 等待 data-service 先写入一些数据
echo -e "${YELLOW}⏳ 等待 5 秒让 data-service 初始化...${NC}"
sleep 5
start_service "trading-service"
echo ""

# 3. signal-service (信号检测)
start_service "signal-service" "--all"
echo ""

# 4. telegram-service (Bot 服务)
start_service "telegram-service"
echo ""

# 5. execution-service (交易执行 — 系统 Python, 无 venv)
echo -e "${BLUE}[启动] execution-service...${NC}"
if lsof -i :8092 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "${GREEN}✅ execution-service 已在运行 (端口 8092)，跳过${NC}"
else
    EXEC_DIR="services/execution-service"
    mkdir -p "$EXEC_DIR/logs" "$EXEC_DIR/run"
    cd "$EXEC_DIR"
    nohup python3 -m src --port 8092 > logs/execution-service.log 2>&1 &
    EXEC_PID=$!
    echo $EXEC_PID > run/execution-service.pid
    echo -e "${GREEN}✅ execution-service 已启动 (PID: $EXEC_PID)${NC}"
    cd ../..
    sleep 3
fi
echo ""

# 6. web dashboard (Next.js, 端口 3001)
echo -e "${BLUE}[启动] web dashboard...${NC}"
if lsof -i :3001 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "${GREEN}✅ web dashboard 已在运行 (端口 3001)，跳过${NC}"
else
    cd web
    nohup npm run dev > ../services/execution-service/logs/web-dashboard.log 2>&1 &
    WEB_PID=$!
    echo $WEB_PID > ../services/execution-service/run/web-dashboard.pid
    echo -e "${GREEN}✅ web dashboard 已启动 (PID: $WEB_PID, http://localhost:3001)${NC}"
    cd ..
    sleep 3
fi
echo ""

# 显示状态
echo -e "${BLUE}=============================================================================${NC}"
echo -e "${GREEN}✅ 所有核心服务已启动${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""
echo "服务状态:"
for service in data-service trading-service signal-service telegram-service execution-service; do
    pid_file="services/$service/run/$service.pid"
    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file" 2>/dev/null)
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "  ✅ $service: 运行中 (PID: $pid)"
        else
            echo -e "  ❌ $service: 已停止"
        fi
    else
        echo -e "  ⚪ $service: 未启动"
    fi
done
# web dashboard
web_pid_file="services/execution-service/run/web-dashboard.pid"
if [ -f "$web_pid_file" ]; then
    web_pid=$(cat "$web_pid_file" 2>/dev/null)
    if ps -p "$web_pid" > /dev/null 2>&1; then
        echo -e "  ✅ web-dashboard: 运行中 (PID: $web_pid, http://localhost:3001)"
    else
        echo -e "  ❌ web-dashboard: 已停止"
    fi
else
    echo -e "  ⚪ web-dashboard: 未启动"
fi
echo ""
echo -e "${YELLOW}查看实时日志:${NC}"
echo "  tail -f services/data-service/logs/data-service.log"
echo "  tail -f services/trading-service/logs/trading-service.log"
echo "  tail -f services/signal-service/logs/signal-service.log"
echo "  tail -f services/telegram-service/logs/telegram-service.log"
echo "  tail -f services/execution-service/logs/execution-service.log"
echo "  tail -f services/execution-service/logs/web-dashboard.log"
echo ""
echo -e "${YELLOW}停止所有服务:${NC}"
echo "  pkill -f 'python.*data-service|python.*trading-service|python.*signal-service|python.*telegram-service'"

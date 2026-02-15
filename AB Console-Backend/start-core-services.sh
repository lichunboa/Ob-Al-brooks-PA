#!/bin/bash
# =============================================================================
# AB Console 核心服务一键启动脚本
# 启动顺序: data-service → trading-service → signal-service → telegram-service
# =============================================================================

cd "$(dirname "$0")"
set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=============================================================================${NC}"
echo -e "${GREEN}🚀 AB Console 核心服务启动脚本${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""

# 检查数据库
echo -e "${BLUE}[准备] 检查数据库连接...${NC}"
if ! python3 -c "import psycopg2; conn = psycopg2.connect('postgresql://postgres:postgres@localhost:5434/market_data'); conn.close()" 2>/dev/null; then
    echo -e "${RED}❌ 无法连接到 PostgreSQL (5434)${NC}"
    echo "请确保 Docker 中的 TimescaleDB 正在运行:"
    echo "  docker ps | grep timescale"
    exit 1
fi
echo -e "${GREEN}✅ 数据库连接正常${NC}"
echo ""

# 启动服务的函数
start_service() {
    local service=$1
    local service_dir="services/$service"
    
    echo -e "${BLUE}[启动] $service...${NC}"
    
    if [ ! -d "$service_dir" ]; then
        echo -e "${RED}❌ $service 目录不存在${NC}"
        return 1
    fi
    
    # 检查是否已在运行
    local pid_file="$service_dir/run/$service.pid"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file" 2>/dev/null)
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  $service 已在运行 (PID: $pid)${NC}"
            return 0
        fi
    fi
    
    # 启动服务
    cd "$service_dir"
    source .venv/bin/activate
    
    # 创建必要的目录
    mkdir -p logs run
    
    # 后台启动
    nohup python -m src > logs/$service.log 2>&1 &
    local new_pid=$!
    
    # 保存 PID
    echo $new_pid > run/$service.pid
    
    echo -e "${GREEN}✅ $service 已启动 (PID: $new_pid)${NC}"
    cd ../..
    
    # 等待服务初始化
    sleep 2
    return 0
}

# 按顺序启动核心服务
echo -e "${YELLOW}按顺序启动核心服务...${NC}"
echo ""

# 1. data-service (数据采集)
start_service "data-service"
echo ""

# 2. trading-service (指标计算)
start_service "trading-service"
echo ""

# 3. signal-service (信号检测)
start_service "signal-service"
echo ""

# 3.5. execution-service (交易执行 + 进化系统 + 持仓巡检)
echo -e "${BLUE}[启动] execution-service...${NC}"
EXEC_DIR="services/execution-service"
if [ -d "$EXEC_DIR" ]; then
    EXEC_PID_FILE="$EXEC_DIR/run/execution-service.pid"
    mkdir -p "$EXEC_DIR/logs" "$EXEC_DIR/run"
    if [ -f "$EXEC_PID_FILE" ]; then
        EXEC_OLD_PID=$(cat "$EXEC_PID_FILE" 2>/dev/null)
        if ps -p "$EXEC_OLD_PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  execution-service 已在运行 (PID: $EXEC_OLD_PID)${NC}"
        else
            cd "$EXEC_DIR"
            nohup python3 -m src --port 8092 > logs/execution-service.log 2>&1 &
            EXEC_PID=$!
            echo $EXEC_PID > run/execution-service.pid
            echo -e "${GREEN}✅ execution-service 已启动 (PID: $EXEC_PID) 端口 8092${NC}"
            cd ../..
        fi
    else
        cd "$EXEC_DIR"
        nohup python3 -m src --port 8092 > logs/execution-service.log 2>&1 &
        EXEC_PID=$!
        echo $EXEC_PID > run/execution-service.pid
        echo -e "${GREEN}✅ execution-service 已启动 (PID: $EXEC_PID) 端口 8092${NC}"
        cd ../..
    fi
else
    echo -e "${YELLOW}⚠️  execution-service 目录不存在，跳过${NC}"
fi
echo ""

# 4. vis-service (可视化服务 - VPVR/K线包络)
echo -e "${BLUE}[启动] vis-service...${NC}"
VIS_DIR="services-preview/vis-service"
if [ -d "$VIS_DIR" ]; then
    cd "$VIS_DIR"
    if [ -d ".venv" ]; then
        source .venv/bin/activate
    fi
    mkdir -p logs run
    VIS_PID_FILE="run/vis-service.pid"
    if [ -f "$VIS_PID_FILE" ]; then
        VIS_OLD_PID=$(cat "$VIS_PID_FILE" 2>/dev/null)
        if ps -p "$VIS_OLD_PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  vis-service 已在运行 (PID: $VIS_OLD_PID)${NC}"
            cd ../..
        else
            nohup python -m src > logs/vis-service.log 2>&1 &
            VIS_PID=$!
            echo $VIS_PID > "$VIS_PID_FILE"
            echo -e "${GREEN}✅ vis-service 已启动 (PID: $VIS_PID) 端口 8087${NC}"
            cd ../..
        fi
    else
        nohup python -m src > logs/vis-service.log 2>&1 &
        VIS_PID=$!
        echo $VIS_PID > "$VIS_PID_FILE"
        echo -e "${GREEN}✅ vis-service 已启动 (PID: $VIS_PID) 端口 8087${NC}"
        cd ../..
    fi
else
    echo -e "${YELLOW}⚠️  vis-service 目录不存在，跳过${NC}"
fi
echo ""

# 5. telegram-service (Bot 服务)
echo -e "${BLUE}[启动] telegram-service...${NC}"
cd services/telegram-service
source .venv/bin/activate
mkdir -p logs run

# 使用新 Token 启动
export BOT_TOKEN="8375182106:AAFqQZ6jg5qtdKBi65Ahj2skMwoo5d1OV3Y"
nohup python src/bot/app.py --token "$BOT_TOKEN" > logs/telegram-service.log 2>&1 &
TG_PID=$!
echo $TG_PID > run/telegram-service.pid
echo -e "${GREEN}✅ telegram-service 已启动 (PID: $TG_PID)${NC}"
echo -e "${YELLOW}   使用 Token: @abconsole_pro_bot${NC}"
cd ../..
echo ""

# 显示状态
echo -e "${BLUE}=============================================================================${NC}"
echo -e "${GREEN}✅ 所有核心服务已启动${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""
echo "服务状态:"
for service in data-service trading-service signal-service execution-service vis-service telegram-service; do
    if [ "$service" = "vis-service" ]; then
        pid_file="services-preview/$service/run/$service.pid"
    else
        pid_file="services/$service/run/$service.pid"
    fi
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
echo ""
echo "查看日志:"
echo "  tail -f services/{service}/logs/{service}.log"
echo ""
echo "停止服务:"
echo "  ./scripts/start.sh stop"

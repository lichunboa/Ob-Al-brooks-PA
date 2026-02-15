#!/bin/bash
# =============================================================================
# AB Console 核心服务一键启动脚本 (V3.9.4)
# Docker 管理: data/trading/signal/telegram/vis/api/sync/timescaledb
# 本地管理:   execution-service (8092) + web dashboard (3001)
# =============================================================================

cd "$(dirname "$0")"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=============================================================================${NC}"
echo -e "${GREEN}🚀 AB Console 核心服务一键启动脚本 (V3.9.4)${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""

# ========== 第一阶段: Docker 服务 ==========
echo -e "${BLUE}[Docker] 检查 Docker 容器...${NC}"
DOCKER_RUNNING=$(docker ps --format "{{.Names}}" 2>/dev/null | grep "^ab-" | wc -l | tr -d ' ')
if [ "$DOCKER_RUNNING" -ge 7 ]; then
    echo -e "${GREEN}✅ Docker: ${DOCKER_RUNNING} 个容器运行中${NC}"
    docker ps --format "  {{.Names}}: {{.Status}}" 2>/dev/null | grep "^  ab-"
else
    echo -e "${YELLOW}⚠️ Docker 容器不足 (${DOCKER_RUNNING}/9)，正在启动...${NC}"
    docker compose up -d 2>&1 | tail -5
    sleep 10
    echo -e "${GREEN}✅ Docker 容器已启动${NC}"
fi
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

# 清理可能存在的冲突本地进程（Docker 已接管这些服务）
echo -e "${BLUE}[准备] 清理冲突的本地进程...${NC}"
pkill -f "python.*data-service" 2>/dev/null || true
pkill -f "python.*trading-service" 2>/dev/null || true
pkill -f "python.*signal-service" 2>/dev/null || true
pkill -f "python.*telegram-service" 2>/dev/null || true
sleep 1
echo -e "${GREEN}✅ 清理完成${NC}"
echo ""

# ========== 第二阶段: 本地服务 ==========

# 1. execution-service (交易执行 — 系统 Python, 无 venv)
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
echo -e "${BLUE}Docker 服务:${NC}"
for container in ab-data-service ab-trading-service ab-signal-service ab-telegram-service ab-vis-service ab-api-service ab-sync-service ab-timescaledb ab-autoheal; do
    status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}N/A{{end}}' "$container" 2>/dev/null)
    if [ "$status" = "running" ]; then
        echo -e "  ✅ $container: 运行中 ($health)"
    else
        echo -e "  ❌ $container: $status"
    fi
done
echo ""
echo -e "${BLUE}本地服务:${NC}"
# execution-service
if lsof -i :8092 -sTCP:LISTEN > /dev/null 2>&1; then
    exec_pid=$(lsof -ti :8092 2>/dev/null | head -1)
    echo -e "  ✅ execution-service: 运行中 (PID: $exec_pid, http://localhost:8092)"
else
    echo -e "  ❌ execution-service: 未运行"
fi
# web dashboard
if lsof -i :3001 -sTCP:LISTEN > /dev/null 2>&1; then
    web_pid=$(lsof -ti :3001 2>/dev/null | head -1)
    echo -e "  ✅ web-dashboard: 运行中 (PID: $web_pid, http://localhost:3001)"
else
    echo -e "  ❌ web-dashboard: 未运行"
fi
echo ""
echo -e "${YELLOW}查看日志:${NC}"
echo "  Docker:          docker logs -f ab-signal-service"
echo "  execution-service: tail -f /tmp/execution-service.log"
echo "  web-dashboard:    tail -f /tmp/web-dashboard.log"
echo ""
echo -e "${YELLOW}停止本地服务:${NC}"
echo "  lsof -ti :8092 | xargs kill   # execution-service"
echo "  lsof -ti :3001 | xargs kill   # web dashboard"

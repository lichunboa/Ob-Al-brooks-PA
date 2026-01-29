#!/bin/bash
# AL-Brooks Console 本地开发启动脚本
# 不使用 Docker，直接本地运行

cd "$(dirname "$0")/.."

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    🦁 AL-Brooks Console 本地开发启动   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# 检查端口
if lsof -i :3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  端口 3000 被占用，尝试释放...${NC}"
    lsof -ti:3000 | xargs kill 2>/dev/null
fi

if lsof -i :8089 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  端口 8089 被占用，尝试释放...${NC}"
    lsof -ti:8089 | xargs kill 2>/dev/null
fi

# 启动 Sync Service
echo -e "${GREEN}▶ 启动 Sync Service (localhost:8089)...${NC}"
cd "AB Console-Backend/services/sync-service"
source venv/bin/activate 2>/dev/null || python3 -m venv venv && source venv/bin/activate && pip install -q -r requirements.txt
python -m src > /tmp/sync-service.log 2>&1 &
SYNC_PID=$!
cd ../../..

# 等待 sync-service 启动
sleep 3
if curl -s http://localhost:8089/api/v1/health > /dev/null; then
    echo -e "${GREEN}✅ Sync Service 运行中 (PID: $SYNC_PID)${NC}"
else
    echo -e "${YELLOW}⚠️  Sync Service 启动中，可能需要更长时间...${NC}"
fi

# 启动 Web Dashboard
echo ""
echo -e "${GREEN}▶ 启动 Web Dashboard (localhost:3000)...${NC}"
cd "AB Console-Web/tradecat-dashboard"
npm run dev > /tmp/web-dashboard.log 2>&1 &
WEB_PID=$!
cd ../..

sleep 3

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     🎉 所有服务启动成功！              ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Web Dashboard: http://localhost:3000  ║${NC}"
echo -e "${GREEN}║  Sync API:     http://localhost:8089   ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  日志文件:                             ║${NC}"
echo -e "${GREEN}║    /tmp/sync-service.log               ║${NC}"
echo -e "${GREEN}║    /tmp/web-dashboard.log              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待信号
trap "echo ''; echo '正在停止服务...'; kill $SYNC_PID $WEB_PID 2>/dev/null; exit 0" INT
wait

#!/bin/bash
# AB Console 全系统停止脚本

echo "🛑 AB Console 停止脚本"
echo "===================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 停止 Web Dashboard
echo "🌐 停止 Web Dashboard..."
cd "$SCRIPT_DIR/tradecat-dashboard"
docker-compose --profile dev down 2>/dev/null || docker-compose down 2>/dev/null

# 停止 WebSocket 服务
echo "📡 停止 WebSocket 服务..."
cd "$SCRIPT_DIR/backend/tradecat-core/services/websocket-service"
if [ -f "stop.sh" ]; then
    ./stop.sh
else
    docker-compose down 2>/dev/null
fi

echo ""
echo "===================="
echo "✅ 所有服务已停止"
echo "===================="

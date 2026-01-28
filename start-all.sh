#!/bin/bash
# AB Console 全系统启动脚本

echo "🦁 AB Console 启动脚本"
echo "===================="
echo ""

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 创建共享网络
if ! docker network ls | grep -q "tradecat-network"; then
    echo "📡 创建 Docker 网络..."
    docker network create tradecat-network
fi

# 启动 WebSocket 服务
echo ""
echo "📡 启动 WebSocket 服务..."
cd "$SCRIPT_DIR/backend/tradecat-core/services/websocket-service"
if [ -f "start.sh" ]; then
    ./start.sh
else
    echo "⚠️  WebSocket 服务启动脚本不存在，跳过"
fi

# 等待 WebSocket 服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 5

# 检查 WebSocket 服务状态
if curl -s http://localhost:8088/health > /dev/null 2>&1; then
    echo "✅ WebSocket 服务运行正常"
else
    echo "⚠️  WebSocket 服务可能未完全启动"
fi

# 启动 Web Dashboard
echo ""
echo "🌐 启动 Web Dashboard..."
cd "$SCRIPT_DIR/tradecat-dashboard"
docker-compose --profile dev up -d dashboard-dev

# 等待 Dashboard 启动
echo ""
echo "⏳ 等待 Dashboard 启动..."
sleep 3

# 显示访问信息
echo ""
echo "===================="
echo "✅ 服务启动完成！"
echo "===================="
echo ""
echo "🌐 Web Dashboard:  http://localhost:3000"
echo "📡 WebSocket:       ws://localhost:8088"
echo "🏥 健康检查:        http://localhost:8088/health"
echo ""
echo "常用命令:"
echo "  查看 WebSocket 日志: docker-compose -f backend/tradecat-core/services/websocket-service/docker-compose.yml logs -f"
echo "  查看 Dashboard 日志: docker-compose -f tradecat-dashboard/docker-compose.yml logs -f"
echo "  停止所有服务:        ./stop-all.sh"
echo ""

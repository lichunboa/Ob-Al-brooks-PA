#!/bin/bash
# dev-server.sh - 局域网开发服务器启动脚本
# 用法: ./dev-server.sh [port]

set -e

PORT=${1:-3000}

echo "🔍 检测网络配置..."

# 获取本机IP地址
if command -v ipconfig &> /dev/null; then
    IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1)
elif command -v hostname &> /dev/null; then
    IP=$(hostname -I | awk '{print $1}')
else
    IP="$(python3 -c "import socket; print(socket.gethostbyname(socket.gethostname()))")"
fi

if [ -z "$IP" ]; then
    echo "❌ 无法获取本机IP地址"
    exit 1
fi

echo ""
echo "============================================"
echo "  AB Console 开发服务器"
echo "============================================"
echo ""
echo "📱 本机访问:    http://localhost:$PORT"
echo "🌐 局域网访问:  http://$IP:$PORT"
echo ""
echo "请确保手机连接同一WiFi，然后访问:"
echo "    http://$IP:$PORT"
echo ""
echo "============================================"
echo ""

# 检查防火墙状态
if command -v /usr/libexec/ApplicationFirewall/socketfilterfw &> /dev/null; then
    FW_STATE=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>&1)
    if echo "$FW_STATE" | grep -q "enabled"; then
        echo "⚠️  警告: macOS防火墙已启用，可能阻止手机访问"
        echo "   临时关闭: sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off"
        echo ""
    fi
fi

# 启动开发服务器
echo "🚀 启动 Next.js 开发服务器..."
echo ""
exec npx next dev -H 0.0.0.0 -p "$PORT"

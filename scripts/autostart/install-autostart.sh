#!/bin/bash
# TradeCat 自动启动配置安装脚本
# 安装后会开机自动启动 TradeCat 服务

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.tradecat.daemon.plist"
PLIST_SOURCE="$SCRIPT_DIR/$PLIST_NAME"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCHD_DIR/$PLIST_NAME"

echo "=== TradeCat 自动启动配置 ==="
echo ""

# 检查源文件是否存在
if [ ! -f "$PLIST_SOURCE" ]; then
    echo "❌ 错误: 找不到 $PLIST_SOURCE"
    exit 1
fi

# 创建 LaunchAgents 目录（如果不存在）
mkdir -p "$LAUNCHD_DIR"

# 复制 plist 文件
cp "$PLIST_SOURCE" "$PLIST_DEST"

# 替换用户名（如果是其他用户）
sed -i '' "s|mitchellcb|$USER|g" "$PLIST_DEST"

echo "✅ 配置文件已复制到: $PLIST_DEST"

# 加载服务
launchctl load "$PLIST_DEST" 2>/dev/null || true

echo ""
echo "=== 安装完成 ==="
echo ""
echo "📋 使用说明:"
echo "  • 开机自动启动: 已启用"
echo "  • 手动启动: launchctl start com.tradecat.daemon"
echo "  • 手动停止: launchctl stop com.tradecat.daemon"
echo "  • 查看状态: launchctl list | grep tradecat"
echo "  • 卸载自动启动: rm $PLIST_DEST"
echo ""
echo "📝 日志位置:"
echo "  • 输出日志: ~/Desktop/Obsidian/Al-brooks-PA/backend/tradecat-core/logs/launchd.out.log"
echo "  • 错误日志: ~/Desktop/Obsidian/Al-brooks-PA/backend/tradecat-core/logs/launchd.err.log"
echo ""
echo "⚠️  注意: 确保后端配置正确 (config/.env)"
echo ""

# 询问是否立即启动
read -p "是否立即启动服务? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "启动 TradeCat 服务..."
    cd "$(dirname "$SCRIPT_DIR")"
    ./scripts/start.sh daemon
    echo "✅ 服务已启动"
fi

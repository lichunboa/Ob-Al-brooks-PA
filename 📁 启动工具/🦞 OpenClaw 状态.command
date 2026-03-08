#!/bin/bash

cd "$(dirname "$0")/.."

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                 OpenClaw 状态检查                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "[INFO] 版本"
openclaw --version
echo ""

echo "[INFO] 状态"
openclaw status
echo ""

echo "[INFO] 模型状态"
openclaw models status --json
echo ""

echo "[INFO] Gateway 健康"
openclaw health --json 2>/dev/null || openclaw health
echo ""

echo "[INFO] Control UI"
echo "请使用带鉴权入口打开 OpenClaw 控制台，不要直接访问 http://127.0.0.1:18789/overview"
echo "终端命令: openclaw dashboard"
echo "一键入口: bash \"📁 启动工具/🦞 打开 OpenClaw 控制台.command\""
echo ""

if [ -t 0 ]; then
    read -p "按 Enter 键关闭..."
fi

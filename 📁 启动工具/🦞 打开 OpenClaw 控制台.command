#!/bin/bash

cd "$(dirname "$0")/.."

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              OpenClaw 控制台（带鉴权）                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "[INFO] 将通过带 Gateway Token 的地址打开 OpenClaw Control UI。"
echo "[INFO] 请勿直接访问 http://127.0.0.1:18789/overview ，裸地址不会携带鉴权令牌。"
echo ""

openclaw dashboard

echo ""
echo "[INFO] 如浏览器未自动打开，可手动执行: openclaw dashboard --no-open"
echo ""

if [ -t 0 ]; then
    read -p "按 Enter 键关闭..."
fi

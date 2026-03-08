#!/bin/bash

cd "$(dirname "$0")/.."

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║             OpenClaw GPT-5.4 登录工具                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "[INFO] 当前 OpenClaw 版本:"
openclaw --version
echo ""
echo "[INFO] 将启动 OpenAI Codex OAuth 登录。"
echo "[INFO] 浏览器会打开 OpenAI 登录页，完成后会自动回调到 localhost:1455。"
echo ""

openclaw models auth login --provider openai-codex --method oauth --set-default

echo ""
echo "[INFO] 当前模型状态:"
openclaw models status --json
echo ""

if [ -t 0 ]; then
    read -p "按 Enter 键关闭..."
fi

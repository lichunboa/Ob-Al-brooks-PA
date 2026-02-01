#!/bin/bash
# 使用新 Token 启动 telegram-service

cd "$(dirname "$0")"

# 新 Bot Token
NEW_TOKEN="8375182106:AAFqQZ6jg5qtdKBi65Ahj2skMwoo5d1OV3Y"  # @abconsole_pro_bot

echo "🚀 使用 @abconsole_pro_bot 启动 telegram-service..."
echo "🔑 Token: ${NEW_TOKEN:0:15}...${NEW_TOKEN: -10}"

# 激活虚拟环境
source .venv/bin/activate

# 设置环境变量并启动
export BOT_TOKEN="$NEW_TOKEN"
export TELEGRAM_BOT_TOKEN="$NEW_TOKEN"

# 检查是否有现有进程
echo "🔍 检查现有进程..."
pkill -f "telegram-service" 2>/dev/null || true
sleep 2

# 启动
echo "🚀 启动中..."
python src/bot/app.py

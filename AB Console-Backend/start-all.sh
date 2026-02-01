#!/bin/bash
# AB Console 一键启动脚本
# 用法: ./start-all.sh

echo "🚀 启动 AB Console 所有服务..."
echo ""

cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend"

# 1. 启动 Signal Service
echo "1️⃣ 启动 Signal Service (127规则检测)..."
cd services/signal-service
make run > signal.log 2>&1 &
sleep 3
echo "   ✅ Signal Service 启动中 (PID: $!)"
cd ../..

# 2. 启动 Telegram Service
echo "2️⃣ 启动 Telegram Service (@catbo26bot)..."
cd services/telegram-service
source .venv/bin/activate
python src/bot/app.py > telegram.log 2>&1 &
sleep 3
echo "   ✅ Telegram Service 启动中 (PID: $!)"
cd ../..

# 3. 检查 Clawdbot
echo "3️⃣ 检查 Clawdbot Gateway..."
if pgrep -f "clawdbot-gateway" > /dev/null; then
    echo "   ✅ Clawdbot 已在运行"
else
    echo "   🔄 启动 Clawdbot..."
    ~/.nvm/versions/node/v24.7.0/bin/clawdbot gateway > /dev/null 2>&1 &
    echo "   ✅ Clawdbot 启动中"
fi

echo ""
echo "⏳ 等待服务初始化..."
sleep 5

echo ""
echo "📊 服务状态:"
./service-monitor.sh status 2>/dev/null || echo "   监控脚本运行中..."

echo ""
echo "🎉 所有服务启动完成!"
echo ""
echo "📱 双渠道推送:"
echo "   • 简版 → Clawdbot (我)"
echo "   • 详版 → @catbo26bot"
echo ""
echo "⏱️ 等待 60 秒后接收第一个信号..."

#!/bin/bash
# 停止所有本地开发服务

echo "🛑 停止本地开发服务..."

# 停止 Sync Service
pkill -f "python -m src" 2>/dev/null && echo "✅ Sync Service 已停止"

# 停止 Web Dashboard  
pkill -f "next dev" 2>/dev/null && echo "✅ Web Dashboard 已停止"

# 释放端口
kill $(lsof -ti:3000) 2>/dev/null
kill $(lsof -ti:8089) 2>/dev/null

echo "✅ 所有服务已停止"

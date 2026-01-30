#!/bin/bash
# Sync Service 本地启动脚本（无 Docker）

set -e

echo "🚀 启动 Sync Service（本地模式）"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 需要安装 Python 3"
    exit 1
fi

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
echo "📦 安装依赖..."
pip install -q -r requirements.txt

# 检查 PostgreSQL 连接
echo "🔍 检查 PostgreSQL..."
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5434}"
DB_NAME="${DB_NAME:-tradecat}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASSWORD:-tradecat123}"

export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# 等待数据库
for i in {1..10}; do
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" > /dev/null 2>&1; then
        echo "✅ PostgreSQL 已连接"
        break
    fi
    echo "⏳ 等待 PostgreSQL ($i/10)..."
    sleep 1
done

# 启动服务
echo "🌐 启动 API 服务: http://localhost:8089"
echo "   数据库: $DATABASE_URL"
echo ""

python -m src

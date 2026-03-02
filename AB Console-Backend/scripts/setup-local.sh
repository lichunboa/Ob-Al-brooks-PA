#!/bin/bash
# 本地开发环境一键设置脚本（无 Docker）

set -e
cd "$(dirname "$0")/.."

echo "🦁 AL-Brooks Console 本地环境设置"
echo "================================"

# 1. 检查 PostgreSQL
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL 客户端已安装"
else
    echo "📦 安装 PostgreSQL..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install postgresql@15
        brew services start postgresql@15
    else
        echo "请手动安装 PostgreSQL: https://www.postgresql.org/download/"
        exit 1
    fi
fi

# 2. 创建数据库
echo ""
echo "🗄️  设置数据库..."
if psql -lqt | cut -d \| -f 1 | grep -qw ab-console; then
    echo "✅ 数据库 'ab-console' 已存在"
else
    echo "创建数据库 'ab-console'..."
    createdb ab-console || echo "使用默认用户创建失败，尝试 postgres 用户..."
fi

# 3. 设置 Sync Service
echo ""
echo "🐍 设置 Sync Service..."
cd "AB Console-Backend/services/sync-service"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

# 创建环境文件
if [ ! -f ".env" ]; then
    cat > .env << EOF
DATABASE_URL=postgresql://localhost:5432/ab-console
API_HOST=0.0.0.0
API_PORT=8089
LOG_LEVEL=INFO
EOF
    echo "✅ 创建 .env 文件"
fi

cd ../../..

# 4. 设置 Web Dashboard
echo ""
echo "⚛️  设置 Web Dashboard..."
cd "AB Console-Backend/web"
if [ ! -d "node_modules" ]; then
    npm install
fi
cd ../..

echo ""
echo "================================"
echo "✅ 设置完成！"
echo ""
echo "启动命令:"
echo "  ./scripts/start-local-dev.sh"
echo ""
echo "或者分别启动:"
echo "  1. cd 'AB Console-Backend/services/sync-service' && source venv/bin/activate && python -m src"
echo "  2. cd 'AB Console-Backend/web' && npm run dev"
echo ""

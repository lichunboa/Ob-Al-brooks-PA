#!/bin/bash
# Signal Service PG 引擎启动脚本（修复版）

cd "$(dirname "$0")"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=============================================================================${NC}"
echo -e "${GREEN}🚀 Signal Service PG 引擎启动脚本${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""

# 检查虚拟环境
if [ ! -d ".venv" ]; then
    echo -e "${RED}❌ 虚拟环境不存在，请先运行: python -m venv .venv${NC}"
    exit 1
fi

source .venv/bin/activate

# 检查依赖
echo -e "${BLUE}[检查] 验证依赖...${NC}"
python -c "import psycopg" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  安装 psycopg...${NC}"
    pip install -q psycopg[binary]
}
echo -e "${GREEN}✅ 依赖检查通过${NC}"
echo ""

# 检查数据库
echo -e "${BLUE}[检查] 验证数据库连接...${NC}"
python -c "
import psycopg
import sys
try:
    conn = psycopg.connect('postgresql://postgres:postgres@localhost:5434/market_data', connect_timeout=5)
    conn.close()
    print('✅ PostgreSQL 连接正常')
except Exception as e:
    print(f'❌ 连接失败: {e}')
    sys.exit(1)
" || {
    echo -e "${RED}❌ 无法连接到 PostgreSQL (5434)${NC}"
    echo "请确保 Docker 中的 TimescaleDB 正在运行:"
    echo "  docker ps | grep timescale"
    exit 1
}
echo ""

# 创建必要目录
mkdir -p logs run

# 清理旧 PID 文件
rm -f run/signal-service.pid

echo -e "${GREEN}🚀 启动 PG 引擎...${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""

# 启动服务
exec python -m src --pg --interval 60 "$@"

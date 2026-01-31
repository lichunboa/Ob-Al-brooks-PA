#!/bin/bash
# TradeCat 官方后端完整启动脚本 (含 api-service)
# 适用于 macOS

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_DIR="$ROOT/AB Console-Backend"

echo "========================================"
echo "  TradeCat 官方后端启动脚本"
echo "========================================"

# 1. 检查并启动数据库
echo ""
echo "[1/5] 检查 TimescaleDB..."
if ! pg_isready -h localhost -p 5434 -q 2>/dev/null; then
    echo "  ⚠️  TimescaleDB 未在端口 5434 运行"
    echo "  请先启动数据库:"
    echo "    cd \"$BACKEND_DIR\" && ./scripts/init-db.sh"
    exit 1
fi
echo "  ✓ TimescaleDB 就绪"

# 2. 初始化 api-service 虚拟环境
echo ""
echo "[2/5] 初始化 api-service..."
cd "$BACKEND_DIR/services-preview/api-service"

if [ ! -d ".venv" ]; then
    echo "  创建虚拟环境..."
    python3 -m venv .venv
fi

echo "  安装依赖..."
source .venv/bin/activate
pip install -q -r requirements.txt

# 3. 启动 api-service
echo ""
echo "[3/5] 启动 api-service..."
./scripts/start.sh restart || ./scripts/start.sh start

# 4. 启动核心服务 (data-service, trading-service, etc.)
echo ""
echo "[4/5] 启动核心服务..."
cd "$BACKEND_DIR"

# 使用 macOS 兼容脚本启动服务
for svc in data-service trading-service signal-service telegram-service; do
    echo "  启动 $svc..."
    svc_dir="services/$svc"
    if [ -d "$svc_dir" ] && [ -x "$svc_dir/scripts/start.sh" ]; then
        cd "$svc_dir"
        ./scripts/start.sh start 2>&1 | sed "s/^/    /" || echo "    ⚠️ $svc 启动失败"
        cd "$BACKEND_DIR"
    else
        echo "    ⚠️ $svc 目录或启动脚本不存在"
    fi
done

# 5. 检查状态
echo ""
echo "[5/5] 服务状态检查..."
echo ""
echo "API Service (端口 8088):"
curl -s http://localhost:8088/api/health | head -1 || echo "  ✗ 无法连接"
echo ""

echo "========================================"
echo "  启动完成"
echo "========================================"
echo ""
echo "访问地址:"
echo "  API 文档: http://localhost:8088/docs"
echo "  健康检查: http://localhost:8088/api/health"
echo ""
echo "常用命令:"
echo "  查看日志: tail -f \"$BACKEND_DIR/services-preview/api-service/logs/api.log\""
echo "  停止服务: cd \"$BACKEND_DIR/services-preview/api-service\" && ./scripts/start.sh stop"
echo "  查看状态: cd \"$BACKEND_DIR/services-preview/api-service\" && ./scripts/start.sh status"
echo ""

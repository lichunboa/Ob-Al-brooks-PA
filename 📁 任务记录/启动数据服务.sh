#!/bin/bash
# 快速启动 data-service (macOS 兼容)

set -e

cd "$(dirname "$0")/../.."
BACKEND_DIR="AB Console-Backend"
SVC_DIR="$BACKEND_DIR/services/data-service"

echo "=== 启动 data-service ==="

if [ ! -d "$SVC_DIR/.venv" ]; then
    echo "创建虚拟环境..."
    cd "$SVC_DIR"
    python3 -m venv .venv
fi

cd "$SVC_DIR"
source .venv/bin/activate

# 检查依赖
if ! python -c "import requests" 2>/dev/null; then
    echo "安装依赖..."
    pip install -q -r requirements.txt
fi

# 创建必要的目录
mkdir -p logs pids

# 启动服务
echo "启动 data-service..."
python src/main.py &
echo $! > pids/data.pid
echo "✓ data-service 启动中 (PID: $!)"

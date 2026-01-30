#!/bin/bash
# ============================================================
# 🦁 AB Console - 一键启动工具
# 启动所有服务：API + 数据采集 + 指标计算 + 信号检测
# ============================================================

cd "$(dirname "$0")/.."
VAULT_ROOT="$(pwd)"
BACKEND_DIR="$VAULT_ROOT/AB Console-Backend"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查服务是否运行
check_service() {
    local port=$1
    local name=$2
    if lsof -i :$port -sTCP:LISTEN > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name (端口 $port)"
        return 0
    else
        echo -e "${RED}✗${NC} $name (端口 $port)"
        return 1
    fi
}

# 检查进程
check_process() {
    local pattern=$1
    local name=$2
    if pgrep -f "$pattern" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name"
        return 0
    else
        echo -e "${RED}✗${NC} $name"
        return 1
    fi
}

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          🦁 AB Console - 一键启动工具                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================
# 1. 检查数据库
# ============================================================
log_info "[1/6] 检查数据库..."
if command -v docker &> /dev/null && docker exec tradecat-timescaledb pg_isready -U postgres > /dev/null 2>&1; then
    log_success "TimescaleDB 已运行 (Docker)"
else
    log_info "TimescaleDB (Docker) 未运行，跳过 — 服务将使用 SQLite"
fi

# ============================================================
# 2. 启动 API Service
# ============================================================
echo ""
log_info "[2/6] 启动 API Service..."
cd "$BACKEND_DIR/services-preview/api-service"
if lsof -i :8088 -sTCP:LISTEN > /dev/null 2>&1; then
    log_success "API Service 已在运行"
else
    ./scripts/start.sh start 2>&1 | tail -3
    sleep 3
    if curl -s http://localhost:8088/health > /dev/null 2>&1; then
        log_success "API Service 启动成功"
    else
        log_error "API Service 启动失败"
    fi
fi

# ============================================================
# 3. 启动 data-service (实时数据采集)
# ============================================================
echo ""
log_info "[3/6] 启动 data-service (WebSocket 数据采集)..."
cd "$BACKEND_DIR/services/data-service"
if pgrep -f "data-service.*--ws" > /dev/null 2>&1; then
    log_success "data-service 已在运行"
else
    source .venv/bin/activate
    nohup python -m src --ws > logs/ws.log 2>&1 &
    sleep 5
    if pgrep -f "data-service.*--ws" > /dev/null 2>&1; then
        log_success "data-service 启动成功 (WebSocket)"
    else
        log_warn "data-service 可能需要初始化"
    fi
fi

# ============================================================
# 4. 启动 trading-service (指标计算)
# ============================================================
echo ""
log_info "[4/6] 启动 trading-service (指标计算)..."
# trading-service 是单次运行模式，计算一次后退出
# 检查最近是否有计算记录
cd "$BACKEND_DIR"
SQLITE_DB="libs/database/services/telegram-service/market_data.db"
if [ -f "$SQLITE_DB" ]; then
    TABLE_COUNT=$(sqlite3 "$SQLITE_DB" ".tables" 2>/dev/null | wc -w)
    if [ "$TABLE_COUNT" -gt 10 ]; then
        log_success "trading-service 指标已计算 ($TABLE_COUNT 张表)"
    else
        log_warn "指标数据不足，启动计算..."
        cd "$BACKEND_DIR/services/trading-service"
        source .venv/bin/activate
        python -m src --once > logs/indicator_run.log 2>&1 &
        log_info "指标计算后台运行中 (约需 30-60 秒)"
    fi
else
    log_warn "初始化指标数据库..."
    cd "$BACKEND_DIR/services/trading-service"
    source .venv/bin/activate
    python -m src --once > logs/indicator_run.log 2>&1 &
    log_info "指标计算后台运行中 (约需 30-60 秒)"
fi

# ============================================================
# 5. 启动 signal-service (信号检测)
# ============================================================
echo ""
log_info "[5/6] 启动 signal-service (交易信号检测)..."
cd "$BACKEND_DIR/services/signal-service"
if pgrep -f "signal-service.*--all" > /dev/null 2>&1; then
    log_success "signal-service 已在运行"
else
    source .venv/bin/activate
    nohup python -m src --all > logs/signal.log 2>&1 &
    sleep 3
    if pgrep -f "signal-service.*--all" > /dev/null 2>&1; then
        log_success "signal-service 启动成功 (127条规则)"
    else
        log_warn "signal-service 启动可能需要时间"
    fi
fi

# ============================================================
# 6. 启动 Web Dashboard (如果未运行)
# ============================================================
echo ""
log_info "[6/6] 启动 Web Dashboard..."
if lsof -i :3000 -sTCP:LISTEN > /dev/null 2>&1; then
    log_success "Web Dashboard 已在运行 (端口 3000)"
else
    cd "$BACKEND_DIR/web"
    nohup npm run dev > /tmp/ab-web-dashboard.log 2>&1 &
    sleep 8
    if lsof -i :3000 -sTCP:LISTEN > /dev/null 2>&1; then
        log_success "Web Dashboard 启动成功 (端口 3000)"
    else
        log_warn "Web Dashboard 启动中，请稍等..."
        log_info "查看日志: tail -f /tmp/ab-web-dashboard.log"
    fi
fi

# ============================================================
# 状态总结
# ============================================================
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                     📊 服务状态总结                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "【核心服务】"
check_service 8088 "API Service      "
check_service 3000 "Web Dashboard    "

echo ""
echo "【后台进程】"
check_process "data-service.*--ws"   "data-service     "
check_process "signal-service.*--all" "signal-service   "
check_process "trading-service"       "trading-service  "

echo ""
echo "【API 测试】"
if curl -s http://localhost:8088/health > /dev/null 2>&1; then
    BTC_PRICE=$(curl -s "http://localhost:8088/api/futures/ohlc/history?symbol=BTCUSDT&interval=1m&limit=1" 2>/dev/null | grep -o '"close":"[^"]*"' | cut -d'"' -f4 | cut -d'.' -f1)
    if [ -n "$BTC_PRICE" ]; then
        log_success "API 正常 | BTC: \$$BTC_PRICE"
    else
        log_success "API 正常"
    fi
else
    log_error "API 未响应"
fi

# Obsidian 同步状态
SYNC_STATUS=$(curl -s http://localhost:8088/api/v1/obsidian/sync/status 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
if [ "$SYNC_STATUS" = "active" ]; then
    STRATEGIES=$(curl -s http://localhost:8088/api/v1/obsidian/sync/status 2>/dev/null | grep -o '"strategies_count":[0-9]*' | cut -d':' -f2)
    TRADES=$(curl -s http://localhost:8088/api/v1/obsidian/sync/status 2>/dev/null | grep -o '"trades_count":[0-9]*' | cut -d':' -f2)
    log_success "Obsidian 同步正常 | 策略: $STRATEGIES | 交易: $TRADES"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                     🌐 访问地址                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "  📱 Web Dashboard:  http://localhost:3000/chart"
echo "  📡 API 文档:       http://localhost:8088/docs"
echo "  🔌 API 健康:      http://localhost:8088/health"
echo "  📊 Obsidian 同步: http://localhost:8088/api/v1/obsidian/sync/status"
echo ""
echo "【常用命令】"
echo "  查看日志:    tail -f 'AB Console-Backend/services/data-service/logs/ws.log'"
echo "  停止服务:    pkill -f 'python.*(data|signal|trading)'"
echo "  重启 API:    cd 'AB Console-Backend/services-preview/api-service' && ./scripts/start.sh restart"
echo ""
log_success "启动完成！"
echo ""

# 保持窗口打开（如果双击运行）
if [ -t 0 ]; then
    read -p "按 Enter 键关闭..."
fi

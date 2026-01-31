#!/bin/bash
# ============================================================
# AB Console - 一键启动工具
# 自动启动 Docker + 数据库 + 全部后端服务 + Web Dashboard
# ============================================================

cd "$(dirname "$0")/.."
VAULT_ROOT="$(pwd)"
BACKEND_DIR="$VAULT_ROOT/AB Console-Backend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

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

# PID 文件路径
BOT_PID_FILE="$BACKEND_DIR/services/telegram-service/pids/bot.pid"
SIGNAL_PID_FILE="$BACKEND_DIR/services/signal-service/logs/signal-service.pid"
DB_READY=false

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          AB Console - 一键启动工具                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================
# 1. Docker + TimescaleDB
# ============================================================
log_info "[1/8] 启动 Docker + TimescaleDB..."

if ! command -v docker &> /dev/null; then
    log_warn "Docker 未安装，跳过数据库 — 使用 SQLite 模式"
else
    # 检查 Docker Desktop 是否运行
    if ! docker info > /dev/null 2>&1; then
        log_info "启动 Docker Desktop..."
        open /Applications/Docker.app 2>/dev/null
        # 等待 Docker 就绪（最多 60 秒）
        WAIT=0
        while ! docker info > /dev/null 2>&1 && [ $WAIT -lt 60 ]; do
            sleep 2
            WAIT=$((WAIT + 2))
            printf "\r  等待 Docker 就绪... %ds" "$WAIT"
        done
        echo ""
        if docker info > /dev/null 2>&1; then
            log_success "Docker Desktop 已就绪"
        else
            log_warn "Docker 启动超时 (60s)，跳过数据库 — 使用 SQLite 模式"
        fi
    fi

    # Docker 已就绪，启动 TimescaleDB
    if docker info > /dev/null 2>&1; then
        if docker ps 2>/dev/null | grep -q timescaledb; then
            log_success "TimescaleDB 已在运行"
            DB_READY=true
        elif docker ps -a 2>/dev/null | grep -q timescaledb; then
            # 容器存在但已停止，重新启动
            log_info "启动 TimescaleDB 容器..."
            docker start ab-timescaledb > /dev/null 2>&1 || docker start tradecat-timescaledb > /dev/null 2>&1
            sleep 3
            if docker ps 2>/dev/null | grep -q timescaledb; then
                log_success "TimescaleDB 启动成功"
                DB_READY=true
            else
                log_warn "TimescaleDB 启动失败"
            fi
        else
            # 容器不存在，创建新的
            log_info "创建 TimescaleDB 容器..."
            docker run -d --name ab-timescaledb \
                -p 5434:5432 \
                -e POSTGRES_PASSWORD=postgres \
                -e POSTGRES_DB=market_data \
                -v ab-timescaledb-data:/var/lib/postgresql/data \
                timescale/timescaledb:latest-pg16 > /dev/null 2>&1
            sleep 5
            if docker ps 2>/dev/null | grep -q timescaledb; then
                log_success "TimescaleDB 创建并启动成功"
                DB_READY=true
            else
                log_warn "TimescaleDB 创建失败"
            fi
        fi
    fi
fi

# ============================================================
# 2. 启动 API Service (端口 8088)
# ============================================================
echo ""
log_info "[2/8] 启动 API Service..."
cd "$BACKEND_DIR/services-preview/api-service"
if lsof -i :8088 -sTCP:LISTEN > /dev/null 2>&1; then
    log_success "API Service 已在运行"
else
    ./scripts/start.sh start 2>&1 | tail -3
    sleep 3
    if lsof -i :8088 -sTCP:LISTEN > /dev/null 2>&1; then
        log_success "API Service 启动成功"
    else
        log_error "API Service 启动失败"
    fi
fi

# ============================================================
# 3. 启动 Telegram Bot
# ============================================================
echo ""
log_info "[3/8] 启动 Telegram Bot..."
cd "$BACKEND_DIR/services/telegram-service"
if [ -f "$BOT_PID_FILE" ] && kill -0 "$(cat "$BOT_PID_FILE")" 2>/dev/null; then
    log_success "Telegram Bot 已在运行"
else
    ./scripts/start.sh start 2>&1 | tail -3
    sleep 3
    if [ -f "$BOT_PID_FILE" ] && kill -0 "$(cat "$BOT_PID_FILE")" 2>/dev/null; then
        log_success "Telegram Bot 启动成功"
    else
        log_warn "Telegram Bot 启动可能需要时间"
    fi
fi

# ============================================================
# 4. 检查指标数据 (SQLite)
# ============================================================
echo ""
log_info "[4/8] 检查指标数据..."
cd "$BACKEND_DIR"
SQLITE_DB="libs/database/services/telegram-service/market_data.db"
if [ -f "$SQLITE_DB" ]; then
    TABLE_COUNT=$(sqlite3 "$SQLITE_DB" ".tables" 2>/dev/null | wc -w)
    if [ "$TABLE_COUNT" -gt 10 ]; then
        log_success "指标数据就绪 ($TABLE_COUNT 张表)"
    else
        log_warn "指标表较少 ($TABLE_COUNT 张)，部分排行榜可能为空"
    fi
else
    log_warn "指标数据库不存在，排行榜将使用币安 API 实时数据"
fi

# ============================================================
# 5. 启动 signal-service (信号检测)
# ============================================================
echo ""
log_info "[5/8] 启动信号检测..."
cd "$BACKEND_DIR/services/signal-service"
if [ -f "$SIGNAL_PID_FILE" ] && kill -0 "$(cat "$SIGNAL_PID_FILE")" 2>/dev/null; then
    log_success "signal-service 已在运行 (PID: $(cat "$SIGNAL_PID_FILE"))"
else
    if [ -d ".venv" ]; then
        ./scripts/start.sh start 2>&1 | tail -3
        sleep 2
        if [ -f "$SIGNAL_PID_FILE" ] && kill -0 "$(cat "$SIGNAL_PID_FILE")" 2>/dev/null; then
            log_success "signal-service 启动成功 (PID: $(cat "$SIGNAL_PID_FILE"))"
        else
            log_warn "signal-service 启动失败 (非关键)"
        fi
    else
        log_warn "signal-service 虚拟环境不存在，跳过"
    fi
fi

# ============================================================
# 6. 启动 data-service (实时数据采集)
# ============================================================
echo ""
log_info "[6/8] 启动 data-service..."
DATA_SVC_PID_FILE="$BACKEND_DIR/services/data-service/logs/ws.pid"
if [ "$DB_READY" = true ]; then
    cd "$BACKEND_DIR/services/data-service"
    # 检查是否已在运行（通过 PID 文件）
    if [ -f "$DATA_SVC_PID_FILE" ] && kill -0 "$(cat "$DATA_SVC_PID_FILE")" 2>/dev/null; then
        log_success "data-service 已在运行 (PID: $(cat "$DATA_SVC_PID_FILE"))"
    elif [ -d ".venv" ]; then
        mkdir -p logs
        source .venv/bin/activate 2>/dev/null
        nohup python -m src --ws > logs/ws.log 2>&1 &
        echo $! > "$DATA_SVC_PID_FILE"
        deactivate 2>/dev/null
        sleep 3
        if kill -0 "$(cat "$DATA_SVC_PID_FILE")" 2>/dev/null; then
            log_success "data-service 启动成功 (PID: $(cat "$DATA_SVC_PID_FILE"))"
        else
            log_warn "data-service 启动失败，查看: AB Console-Backend/services/data-service/logs/ws.log"
            rm -f "$DATA_SVC_PID_FILE"
        fi
    else
        log_warn "data-service 虚拟环境不存在，跳过"
    fi
else
    log_info "跳过 data-service (TimescaleDB 未就绪)"
fi

# ============================================================
# 7. 启动 trading-service (指标计算)
# ============================================================
echo ""
log_info "[7/8] 启动 trading-service..."
TRADING_SVC_PID_FILE="$BACKEND_DIR/services/trading-service/logs/trading.pid"
if [ "$DB_READY" = true ]; then
    cd "$BACKEND_DIR/services/trading-service"
    if [ -d ".venv" ]; then
        mkdir -p logs
        source .venv/bin/activate 2>/dev/null
        nohup python -m src --once > logs/indicator_run.log 2>&1 &
        echo $! > "$TRADING_SVC_PID_FILE"
        deactivate 2>/dev/null
        log_success "指标计算已启动 (PID: $!, 后台运行)"
    else
        log_warn "trading-service 虚拟环境不存在，跳过"
    fi
else
    log_info "跳过 trading-service (TimescaleDB 未就绪)"
fi

# ============================================================
# 8. 启动 Web Dashboard (端口 3000)
# ============================================================
echo ""
log_info "[8/8] 启动 Web Dashboard..."
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
echo "║                     服务状态总结                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "【数据库】"
if [ "$DB_READY" = true ]; then
    echo -e "${GREEN}✓${NC} TimescaleDB (端口 5434)"
else
    echo -e "${YELLOW}○${NC} TimescaleDB (未运行 - SQLite 模式)"
fi

echo ""
echo "【核心服务】"
check_service 8088 "API Service      "
check_service 3000 "Web Dashboard    "

echo ""
echo "【Telegram Bot】"
if [ -f "$BOT_PID_FILE" ] && kill -0 "$(cat "$BOT_PID_FILE")" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Telegram Bot (PID: $(cat "$BOT_PID_FILE"))"
else
    echo -e "${RED}✗${NC} Telegram Bot"
fi

echo ""
echo "【后台进程】"
if [ -f "$SIGNAL_PID_FILE" ] && kill -0 "$(cat "$SIGNAL_PID_FILE")" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} signal-service (PID: $(cat "$SIGNAL_PID_FILE"))"
else
    echo -e "${RED}✗${NC} signal-service"
fi
if [ -f "$DATA_SVC_PID_FILE" ] && kill -0 "$(cat "$DATA_SVC_PID_FILE")" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} data-service (PID: $(cat "$DATA_SVC_PID_FILE"))"
else
    echo -e "${RED}✗${NC} data-service"
fi
if [ -f "$TRADING_SVC_PID_FILE" ] && kill -0 "$(cat "$TRADING_SVC_PID_FILE")" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} trading-service (PID: $(cat "$TRADING_SVC_PID_FILE"), 一次性任务)"
else
    echo -e "${YELLOW}○${NC} trading-service (一次性任务，可能已完成)"
fi

echo ""
echo "【API 测试】"
if curl -s http://localhost:8088/health > /dev/null 2>&1; then
    log_success "API 正常"
else
    log_error "API 未响应"
fi

SYNC_STATUS=$(curl -s http://localhost:8088/api/v1/obsidian/sync/status 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
if [ "$SYNC_STATUS" = "active" ]; then
    STRATEGIES=$(curl -s http://localhost:8088/api/v1/obsidian/sync/status 2>/dev/null | grep -o '"strategies_count":[0-9]*' | cut -d':' -f2)
    TRADES=$(curl -s http://localhost:8088/api/v1/obsidian/sync/status 2>/dev/null | grep -o '"trades_count":[0-9]*' | cut -d':' -f2)
    log_success "Obsidian 同步正常 | 策略: $STRATEGIES | 交易: $TRADES"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                     访问地址                                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "  Web Dashboard:  http://localhost:3000/chart"
echo "  API 文档:       http://localhost:8088/docs"
echo "  API 健康:       http://localhost:8088/health"
echo "  Obsidian 同步:  http://localhost:8088/api/v1/obsidian/sync/status"
echo ""
echo "【Telegram Bot 命令】"
echo "  /ai    - AI 智能分析"
echo "  /vis   - 可视化面板"
echo "  /start - 显示所有命令"
echo ""
log_success "启动完成！"
echo ""

# 保持窗口打开（如果双击运行）
if [ -t 0 ]; then
    read -p "按 Enter 键关闭..."
fi

#!/bin/bash
# ============================================================
# AB Console - 状态检查工具
# 支持 Docker Desktop macOS socket 自动检测
# ============================================================

cd "$(dirname "$0")/.."
VAULT_ROOT="$(pwd)"
BACKEND_DIR="$VAULT_ROOT/AB Console-Backend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Docker Desktop on macOS - 智能检测 socket
setup_docker_host() {
    if [ -S "$HOME/.docker/run/docker.sock" ]; then
        export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
    elif [ -S "/var/run/docker.sock" ]; then
        export DOCKER_HOST="unix:///var/run/docker.sock"
    fi
}
setup_docker_host

check_port() {
    local port=$1
    local name=$2
    if lsof -i :$port -sTCP:LISTEN > /dev/null 2>&1; then
        echo -e "${GREEN}●${NC} $name (端口 $port)"
        return 0
    else
        echo -e "${RED}○${NC} $name (端口 $port)"
        return 1
    fi
}

check_container() {
    local name=$1
    local display_name=$2
    local status=$(docker ps --format "{{.Status}}" --filter "name=^${name}$" 2>/dev/null)
    if [ -n "$status" ]; then
        echo -e "  ${GREEN}●${NC} $display_name  $status"
        return 0
    else
        # 检查是否存在但已停止
        local exists=$(docker ps -a --format "{{.Status}}" --filter "name=^${name}$" 2>/dev/null)
        if [ -n "$exists" ]; then
            echo -e "  ${YELLOW}○${NC} $display_name  已停止"
        else
            echo -e "  ${RED}○${NC} $display_name  未创建"
        fi
        return 1
    fi
}

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                 AB Console - 状态检查                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo -e "${CYAN}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""

# 端口检查
echo "【端口状态】"
check_port 8088 "API Service"
check_port 8089 "Sync Service"
check_port 8090 "Telegram Service"
check_port 8083 "Signal Service"
check_port 5434 "TimescaleDB"
check_port 3000 "Web Dashboard"
check_port 18789 "Clawdbot"

# Docker 容器检查
echo ""
echo "【Docker 容器】"
if docker info > /dev/null 2>&1; then
    check_container "ab-timescaledb" "TimescaleDB"
    check_container "ab-api-service" "API Service"
    check_container "ab-data-service" "Data Service"
    check_container "ab-sync-service" "Sync Service"
    check_container "ab-signal-service" "Signal Service"
    check_container "ab-telegram-service" "Telegram Service"
    check_container "ab-trading-service" "Trading Service"
    check_container "ab-forwarder" "Forwarder"
else
    echo -e "  ${RED}○${NC} Docker 未连接"
fi

# API 健康检查
echo ""
echo "【API 健康】"
if curl -s http://localhost:8088/health > /dev/null 2>&1; then
    echo -e "${GREEN}●${NC} API 健康检查通过"

    # BTC 价格
    BTC_DATA=$(curl -s "http://localhost:8088/api/futures/ohlc/history?symbol=BTCUSDT&interval=1m&limit=1" 2>/dev/null)
    BTC_PRICE=$(echo "$BTC_DATA" | grep -o '"close":"[^"]*"' | cut -d'"' -f4 | cut -d'.' -f1)
    if [ -n "$BTC_PRICE" ]; then
        echo -e "  ${CYAN}└─${NC} BTC: \$$BTC_PRICE"
    fi

    # Obsidian 同步
    SYNC_DATA=$(curl -s http://localhost:8088/api/v1/obsidian/sync/status 2>/dev/null)
    if [ -n "$SYNC_DATA" ]; then
        STRATEGIES=$(echo "$SYNC_DATA" | grep -o '"strategies_count":[0-9]*' | cut -d':' -f2)
        TRADES=$(echo "$SYNC_DATA" | grep -o '"trades_count":[0-9]*' | cut -d':' -f2)
        echo -e "  ${CYAN}└─${NC} Obsidian: $STRATEGIES 策略, $TRADES 交易"
    fi
else
    echo -e "${RED}○${NC} API 未响应"
fi

# 数据库检查
echo ""
echo "【数据库】"
if docker exec ab-timescaledb pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}●${NC} TimescaleDB 运行正常"

    CANDLE_COUNT=$(docker exec ab-timescaledb psql -U postgres -d market_data -t -c "SELECT COUNT(*) FROM market_data.candles_1m WHERE bucket_ts > NOW() - INTERVAL '1 hour';" 2>/dev/null | xargs)
    if [ -n "$CANDLE_COUNT" ] && [ "$CANDLE_COUNT" -gt 0 ] 2>/dev/null; then
        echo -e "  ${CYAN}└─${NC} 最近1小时: $CANDLE_COUNT 条K线"
    fi
else
    echo -e "${RED}○${NC} TimescaleDB 未运行"
fi

# SQLite 指标库
echo ""
echo "【指标库】"
SQLITE_DB="$BACKEND_DIR/libs/database/services/telegram-service/market_data.db"
if [ -f "$SQLITE_DB" ]; then
    TABLE_COUNT=$(sqlite3 "$SQLITE_DB" ".tables" 2>/dev/null | wc -w)
    echo -e "${GREEN}●${NC} SQLite 指标库 ($TABLE_COUNT 张表)"
else
    echo -e "${RED}○${NC} SQLite 指标库未找到"
fi

# 信号服务检查
echo ""
echo "【信号服务】"
SIGNAL_DB="$BACKEND_DIR/libs/database/services/signal-service/signal_history.db"
if [ -f "$SIGNAL_DB" ]; then
    SIGNAL_COUNT=$(sqlite3 "$SIGNAL_DB" "SELECT COUNT(*) FROM signals;" 2>/dev/null | xargs)
    if [ -n "$SIGNAL_COUNT" ]; then
        echo -e "${GREEN}●${NC} 历史信号: $SIGNAL_COUNT 条"
    else
        echo -e "${YELLOW}●${NC} 信号库已初始化"
    fi
else
    echo -e "${YELLOW}○${NC} 信号库未创建"
fi

# Clawdbot 检查
echo ""
echo "【Clawdbot】"
if lsof -i :18789 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "${GREEN}●${NC} Clawdbot 运行中 (端口 18789)"
    # 测试 webhook
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:18789/health" 2>/dev/null | grep -q "200"; then
        echo -e "  ${CYAN}└─${NC} Webhook 可用"
    fi
else
    echo -e "${YELLOW}○${NC} Clawdbot 未运行 - 信号转发不可用"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  操作: [1]启动 [2]停止 [3]重启 [4]查看日志 [其他]退出       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

if [ -t 0 ]; then
    read -p "选择操作 [1-4]: " choice
    case $choice in
        1) bash "$(dirname "$0")/🚀 一键启动.command" ;;
        2) bash "$(dirname "$0")/🛑 一键停止.command" ;;
        3)
            bash "$(dirname "$0")/🛑 一键停止.command"
            sleep 2
            bash "$(dirname "$0")/🚀 一键启动.command"
            ;;
        4)
            echo ""
            echo "【选择日志】"
            echo "  1) telegram-service"
            echo "  2) signal-service"
            echo "  3) sync-service"
            echo "  4) api-service"
            echo "  5) data-service"
            echo "  6) Web Dashboard"
            read -p "选择 [1-6]: " log_choice
            case $log_choice in
                1) docker logs -f ab-telegram-service --tail 50 ;;
                2) docker logs -f ab-signal-service --tail 50 ;;
                3) docker logs -f ab-sync-service --tail 50 ;;
                4) docker logs -f ab-api-service --tail 50 ;;
                5) docker logs -f ab-data-service --tail 50 ;;
                6) tail -f /tmp/ab-web-dashboard.log ;;
            esac
            ;;
    esac
fi

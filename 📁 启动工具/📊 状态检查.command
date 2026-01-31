#!/bin/bash
# ============================================================
# 🦁 AB Console - 状态检查工具
# ============================================================

cd "$(dirname "$0")/.."
VAULT_ROOT="$(pwd)"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

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

check_process() {
    local pattern=$1
    local name=$2
    local pid=$(pgrep -f "$pattern" | head -1)
    if [ -n "$pid" ]; then
        local cpu=$(ps -p $pid -o %cpu= 2>/dev/null | xargs)
        local mem=$(ps -p $pid -o %mem= 2>/dev/null | xargs)
        echo -e "${GREEN}●${NC} $name (PID: $pid, CPU: ${cpu:-?}%, MEM: ${mem:-?}%)"
        return 0
    else
        echo -e "${RED}○${NC} $name"
        return 1
    fi
}

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                 🦁 AB Console - 状态检查                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 时间
echo -e "${CYAN}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""

# 端口检查
echo "【端口状态】"
check_port 8088 "API Service"
check_port 5434 "TimescaleDB"
check_port 3000 "Web Dashboard"

# 进程检查
echo ""
echo "【后台进程】"
check_process "api-service" "API Service"
check_process "data-service.*--ws" "data-service"
check_process "signal-service.*--all" "signal-service"

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
if docker exec tradecat-timescaledb pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}●${NC} TimescaleDB 运行正常"
    
    # 表统计
    cd "$VAULT_ROOT/AB Console-Backend"
    CANDLE_COUNT=$(docker exec tradecat-timescaledb psql -U postgres -d market_data -t -c "SELECT COUNT(*) FROM market_data.candles_1m WHERE bucket_ts > NOW() - INTERVAL '1 hour';" 2>/dev/null | xargs)
    if [ -n "$CANDLE_COUNT" ] && [ "$CANDLE_COUNT" -gt 0 ]; then
        echo -e "  ${CYAN}└─${NC} 最近1小时: $CANDLE_COUNT 条K线"
    fi
else
    echo -e "${RED}○${NC} TimescaleDB 未运行"
fi

# SQLite 指标库
echo ""
echo "【指标库】"
SQLITE_DB="$VAULT_ROOT/AB Console-Backend/libs/database/services/telegram-service/market_data.db"
if [ -f "$SQLITE_DB" ]; then
    TABLE_COUNT=$(sqlite3 "$SQLITE_DB" ".tables" 2>/dev/null | wc -w)
    echo -e "${GREEN}●${NC} SQLite 指标库 ($TABLE_COUNT 张表)"
else
    echo -e "${RED}○${NC} SQLite 指标库未找到"
fi

echo ""
echo "【信号服务】"
SIGNAL_DB="$VAULT_ROOT/AB Console-Backend/libs/database/services/signal-service/signal_history.db"
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
            echo "  1) data-service (数据采集)"
            echo "  2) trading-service (指标计算)"
            echo "  3) signal-service (信号检测)"
            echo "  4) API Service"
            read -p "选择 [1-4]: " log_choice
            case $log_choice in
                1) tail -f "AB Console-Backend/services/data-service/logs/ws.log" ;;
                2) tail -f "AB Console-Backend/services/trading-service/logs/indicator_run.log" ;;
                3) tail -f "AB Console-Backend/services/signal-service/logs/signal.log" ;;
                4) tail -f "AB Console-Backend/services-preview/api-service/logs/api.log" ;;
            esac
            ;;
    esac
fi

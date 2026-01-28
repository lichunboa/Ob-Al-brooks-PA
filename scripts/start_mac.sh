#!/bin/bash
# TradeCat macOS Launcher
# Bypasses bash version issues by invoking python directly

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$PROJECT_ROOT/pids"
LOG_DIR="$PROJECT_ROOT/mn_logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

# Load Config
set -a
source "$PROJECT_ROOT/config/.env"
set +a

# Start Function
start_service() {
    local svc_name=$1
    local cmd=$2
    local svc_path="$PROJECT_ROOT/services/$svc_name"
    
    echo "Starting $svc_name..."
    cd "$svc_path" || exit
    
    # Activate venv
    if [ -f ".venv/bin/activate" ]; then
        source .venv/bin/activate
    else
        echo "Error: Virtualenv not found for $svc_name"
        return
    fi
    
    # Run
    nohup $cmd > "$LOG_DIR/$svc_name.log" 2>&1 &
    echo $! > "$PID_DIR/$svc_name.pid"
    echo "$svc_name started with PID $(cat "$PID_DIR/$svc_name.pid")"
}

# 1. Start Data Service
# Note: For MacOS, we reduce concurrency to avoid potential file descriptor limits if default is low
start_service "data-service" "python -m src --all"

# 2. Start Trading Service
start_service "trading-service" "python -m src"

# 3. Start Telegram Service
start_service "telegram-service" "python -m src"

# 4. Start API Gateway (For Obsidian Plugin)
start_service "api-gateway" "uvicorn src.main:app --host 0.0.0.0 --port 8088 --reload"

# 5. Start Stock Service (US Stocks)
start_service "stock-service" "python -m src.main"

echo "=== All Services Started ==="
echo "Check logs in $LOG_DIR"

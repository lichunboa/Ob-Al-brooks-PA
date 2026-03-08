#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
VAULT_ROOT="$(pwd)"
AGENT_DIR="$VAULT_ROOT/AB Patrol-Agent"
WEB_DIR="$VAULT_ROOT/AB Patrol-Web"
START_SCRIPT="$AGENT_DIR/scripts/start.sh"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║               AB Patrol-Agent 一键启动                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "请选择启动模式:"
echo "  1) 交易主链（execution + patrol + query + watchdog）"
echo "  2) 交易主链 + Web"
echo "  3) 仅 Web"
echo "  4) 仅状态检查"
echo ""
read -r -p "输入编号 [1-4，默认 1]: " choice
choice="${choice:-1}"

if [ -f "$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist" ] && ! lsof -iTCP:18789 -sTCP:LISTEN >/dev/null 2>&1; then
  log_info "启动 OpenClaw Gateway..."
  launchctl kickstart -k "gui/$(id -u)/ai.openclaw.gateway" 2>/dev/null || true
  sleep 2
fi

if lsof -iTCP:18789 -sTCP:LISTEN >/dev/null 2>&1; then
  log_ok "OpenClaw Gateway 已就绪 (18789)"
else
  log_warn "OpenClaw Gateway 当前未监听，TG 对话可能不可用"
fi

case "$choice" in
  1)
    log_info "启动 AB Patrol 主链..."
    AB_PATROL_SIDECAR_USE_LAUNCHD=0 bash "$START_SCRIPT" stack-start --execute
    ;;
  2)
    log_info "启动 AB Patrol 主链..."
    AB_PATROL_SIDECAR_USE_LAUNCHD=0 bash "$START_SCRIPT" stack-start --execute
    log_info "启动 AB Patrol Web..."
    bash "$AGENT_DIR/scripts/start.sh" web-start
    ;;
  3)
    log_info "启动 AB Patrol Web..."
    bash "$AGENT_DIR/scripts/start.sh" web-start
    ;;
  4)
    ;;
  *)
    log_warn "无效选项，按默认主链启动"
    AB_PATROL_SIDECAR_USE_LAUNCHD=0 bash "$START_SCRIPT" stack-start --execute
    ;;
esac

echo ""
log_info "当前状态..."
bash "$START_SCRIPT" status

if lsof -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo ""
  echo "Web: http://localhost:3001/pa-bot"
fi

echo ""
echo "默认主入口:"
echo "  启动: 🚀 一键启动.command"
echo "  停止: 🛑 一键停止.command"
echo "  状态: 📊 状态检查.command"
echo ""

if [ -t 0 ]; then
  read -p "按 Enter 键关闭..."
fi

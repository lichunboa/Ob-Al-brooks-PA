#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
VAULT_ROOT="$(pwd)"
AGENT_DIR="$VAULT_ROOT/AB Patrol-Agent"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║            Patrol 可见控制台                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

log_info "启动 AB Patrol 主链..."
if bash "$AGENT_DIR/scripts/start.sh" stack-start --execute; then
    log_success "AB Patrol 主链已启动"
else
    log_warn "AB Patrol 主链启动失败，请看 $AGENT_DIR/run/*.log"
fi
echo ""

exec bash "$AGENT_DIR/scripts/start.sh" status

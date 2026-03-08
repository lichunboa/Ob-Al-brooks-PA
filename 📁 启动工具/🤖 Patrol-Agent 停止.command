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

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║            Patrol 停止工具                                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

bash "$AGENT_DIR/scripts/start.sh" stop

echo ""
if [ -t 0 ]; then
    read -p "按 Enter 键关闭..."
fi

#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
VAULT_ROOT="$(pwd)"
AGENT_DIR="$VAULT_ROOT/AB Patrol-Agent"

check_port() {
  local port="$1"
  local label="$2"
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "✓ $label ($port)"
  else
    echo "✗ $label ($port)"
  fi
}

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║               AB Patrol-Agent 状态检查                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "=== 主链端口 ==="
check_port 18789 "OpenClaw Gateway"
check_port 8092 "Execution Service"
check_port 8086 "Query Service"
check_port 3001 "AB Patrol Web"

echo ""
bash "$AGENT_DIR/scripts/start.sh" status

echo ""
echo "默认主入口:"
echo "  启动: 🚀 一键启动.command"
echo "  停止: 🛑 一键停止.command"
echo "  Web:  🌐 AB Patrol Web.command"
echo ""

if [ -t 0 ]; then
  read -p "按 Enter 键关闭..."
fi

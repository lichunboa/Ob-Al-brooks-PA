#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
VAULT_ROOT="$(pwd)"
AGENT_DIR="$VAULT_ROOT/AB Patrol-Agent"
START_SCRIPT="$AGENT_DIR/scripts/start.sh"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║               AB Patrol-Agent 一键停止                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "请选择停止模式:"
echo "  1) 停止交易主链"
echo "  2) 停止交易主链 + Web"
echo "  3) 仅停止 Web"
echo ""
read -r -p "输入编号 [1-3，默认 1]: " choice
choice="${choice:-1}"

case "$choice" in
  1)
    bash "$START_SCRIPT" stop
    ;;
  2)
    bash "$START_SCRIPT" stack-stop
    ;;
  3)
    bash "$START_SCRIPT" web-stop
    ;;
  *)
    bash "$START_SCRIPT" stop
    ;;
esac

echo ""
echo "OpenClaw Gateway 默认保留运行，方便 TG / 控制台继续可用。"
echo ""

if [ -t 0 ]; then
  read -p "按 Enter 键关闭..."
fi

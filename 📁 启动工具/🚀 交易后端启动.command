#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")/.."

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║               交易后端启动工具                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

python3 "AB Console-Backend/scripts/pa_crypto_control.py" start

read -p "按 Enter 键关闭..."

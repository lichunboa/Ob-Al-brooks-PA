#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
fi

.venv/bin/pip install --upgrade pip wheel setuptools
.venv/bin/pip install -r requirements.txt

echo "AB Patrol-Agent 依赖已安装到 $ROOT/.venv"

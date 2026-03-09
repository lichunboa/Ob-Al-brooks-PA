#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  npm install
fi

MODE="${1:-prod}"

if [[ "$MODE" == "dev" ]]; then
  exec npm run dev
fi

if [[ ! -f ".next/BUILD_ID" ]]; then
  npm run build
fi

exec npm run start

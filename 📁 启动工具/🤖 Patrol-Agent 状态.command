#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
VAULT_ROOT="$(pwd)"
AGENT_DIR="$VAULT_ROOT/AB Patrol-Agent"

exec bash "$AGENT_DIR/scripts/start.sh" status

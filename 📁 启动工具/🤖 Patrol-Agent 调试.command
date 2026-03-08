#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA"
AGENT_DIR="$ROOT/AB Patrol-Agent"

exec bash "$AGENT_DIR/scripts/start.sh" logs

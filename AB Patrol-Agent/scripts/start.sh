#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="$ROOT/runtime/pa_runtime.py"
CONTROL="$ROOT/tools/ops/pa_crypto_control.py"
QUERY_SERVICE="$ROOT/services/consumption/query-service/src/__main__.py"
CHART_GEN="$ROOT/tools/ops/chart_gen.py"
BACKTEST="$ROOT/tools/backtest/backtest_v4.py"
WATCHDOG="$ROOT/scripts/watchdog.py"
EXECUTION_ROOT="$ROOT/services/execution-service"
API_ROOT="$ROOT/services/api-service"
SYNC_ROOT="$ROOT/services/sync-service"
SIGNAL_ROOT="$ROOT/services/signal-service"
VIS_ROOT="$ROOT/services/vis-service"
WEB_ROOT="$ROOT/../AB Patrol-Web"
RUN_DIR="$ROOT/data/run"
CYCLES_DIR="$ROOT/data/pa_trader/cycles"
LOG_FILE="$RUN_DIR/service.log"
PID_FILE="$RUN_DIR/service.pid"
LOOP_STOP_FILE="$RUN_DIR/loop.stop"
QUERY_LOG_FILE="$RUN_DIR/query-service.log"
QUERY_PID_FILE="$RUN_DIR/query-service.pid"
QUERY_STOP_FILE="$RUN_DIR/query.stop"
WATCHDOG_LOG_FILE="$RUN_DIR/watchdog.log"
WATCHDOG_PID_FILE="$RUN_DIR/watchdog.pid"
WATCHDOG_STOP_FILE="$RUN_DIR/watchdog.stop"
LOOP_MODE_FILE="$RUN_DIR/loop-mode.env"
EXECUTION_LOG_FILE="$RUN_DIR/execution-service.log"
EXECUTION_PID_FILE="$RUN_DIR/execution-service.pid"
API_LOG_FILE="$RUN_DIR/api-service.log"
API_PID_FILE="$RUN_DIR/api-service.pid"
SYNC_LOG_FILE="$RUN_DIR/sync-service.log"
SYNC_PID_FILE="$RUN_DIR/sync-service.pid"
SIGNAL_LOG_FILE="$RUN_DIR/signal-service.log"
SIGNAL_PID_FILE="$RUN_DIR/signal-service.pid"
VIS_LOG_FILE="$RUN_DIR/vis-service.log"
VIS_PID_FILE="$RUN_DIR/vis-service.pid"
WEB_LOG_FILE="$RUN_DIR/web.log"
WEB_PID_FILE="$RUN_DIR/web.pid"
ENV_FILE="$ROOT/config/.env"
LAUNCHD_DIR="$RUN_DIR/launchd"
LAUNCHD_DOMAIN="gui/$(id -u)"
LOOP_LABEL="ai.abpatrol.loop"
QUERY_LABEL="ai.abpatrol.query"
WATCHDOG_LABEL="ai.abpatrol.watchdog"
LOOP_PLIST="$LAUNCHD_DIR/$LOOP_LABEL.plist"
QUERY_PLIST="$LAUNCHD_DIR/$QUERY_LABEL.plist"
WATCHDOG_PLIST="$LAUNCHD_DIR/$WATCHDOG_LABEL.plist"
LOOP_WRAPPER="$LAUNCHD_DIR/$LOOP_LABEL.sh"
QUERY_WRAPPER="$LAUNCHD_DIR/$QUERY_LABEL.sh"
WATCHDOG_WRAPPER="$LAUNCHD_DIR/$WATCHDOG_LABEL.sh"
USE_LAUNCHD="${AB_PATROL_USE_LAUNCHD:-0}"
LOOP_HOST="${AB_PATROL_LOOP_HOST:-terminal}"
TERMINAL_HOST="${AB_PATROL_TERMINAL_HOST:-0}"
SIDECAR_USE_LAUNCHD="${AB_PATROL_SIDECAR_USE_LAUNCHD:-0}"

mkdir -p "$RUN_DIR"
mkdir -p "$LAUNCHD_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

AUTOTRADE_ENABLED="${AB_PATROL_ENABLE_AUTOTRADE:-0}"
declare -a LOOP_ARGS=()

persist_loop_mode() {
  local execute="0"
  local no_telegram="0"
  local arg
  if ((${#LOOP_ARGS[@]})); then
    for arg in "${LOOP_ARGS[@]}"; do
      [[ "$arg" == "--execute" ]] && execute="1"
      [[ "$arg" == "--no-telegram" ]] && no_telegram="1"
    done
  fi
  cat >"$LOOP_MODE_FILE" <<EOF
AB_PATROL_PERSIST_EXECUTE=$execute
AB_PATROL_PERSIST_NO_TELEGRAM=$no_telegram
EOF
}

load_persisted_loop_mode() {
  local execute="0"
  local no_telegram="0"
  if [[ -f "$LOOP_MODE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$LOOP_MODE_FILE"
    execute="${AB_PATROL_PERSIST_EXECUTE:-0}"
    no_telegram="${AB_PATROL_PERSIST_NO_TELEGRAM:-0}"
  fi
  [[ "$execute" == "1" ]] && LOOP_ARGS+=("--execute")
  [[ "$no_telegram" == "1" ]] && LOOP_ARGS+=("--no-telegram")
}

launchd_enabled() {
  [[ "$(uname -s)" == "Darwin" ]] && [[ "$USE_LAUNCHD" != "0" ]]
}

sidecar_launchd_enabled() {
  [[ "$(uname -s)" == "Darwin" ]] && [[ "$SIDECAR_USE_LAUNCHD" != "0" ]]
}

terminal_loop_enabled() {
  [[ "$(uname -s)" == "Darwin" ]] && [[ "$LOOP_HOST" != "background" ]] && command -v osascript >/dev/null 2>&1
}

terminal_host_enabled() {
  [[ "$(uname -s)" == "Darwin" ]] && [[ "$TERMINAL_HOST" != "0" ]] && command -v osascript >/dev/null 2>&1
}

resolve_loop_args() {
  local args=("$@")
  LOOP_ARGS=()
  if ((${#args[@]})); then
    LOOP_ARGS=("${args[@]}")
  else
    load_persisted_loop_mode
  fi
  local arg
  local has_execute=0
  if ((${#LOOP_ARGS[@]})); then
    for arg in "${LOOP_ARGS[@]}"; do
      if [[ "$arg" == "--execute" ]]; then
        has_execute=1
        break
      fi
    done
  fi
  if [[ "$has_execute" -eq 0 && "$AUTOTRADE_ENABLED" == "1" ]]; then
    LOOP_ARGS+=("--execute")
  fi
  persist_loop_mode
}

loop_mode_label() {
  local args=("$@")
  local arg
  if ((${#args[@]})); then
    for arg in "${args[@]}"; do
      if [[ "$arg" == "--execute" ]]; then
        printf '%s\n' "自动交易"
        return 0
      fi
    done
  fi
  if [[ "$AUTOTRADE_ENABLED" == "1" ]]; then
    printf '%s\n' "自动交易"
  else
    printf '%s\n' "观察模式"
  fi
}

tool_python() {
  local candidates=(
    "$ROOT/.venv/bin/python"
    "$(command -v python3 || true)"
  )
  local py
  for py in "${candidates[@]}"; do
    if [[ -n "$py" && -x "$py" ]]; then
      printf '%s\n' "$py"
      return 0
    fi
  done
  return 1
}

export_tool_python() {
  export AB_PATROL_TOOL_PYTHON="${AB_PATROL_TOOL_PYTHON:-$(tool_python)}"
}

service_python() {
  local service_root="$1"
  local candidates=(
    "$service_root/.venv/bin/python"
    "$ROOT/.venv/bin/python"
    "$(command -v python3 || true)"
  )
  local py
  for py in "${candidates[@]}"; do
    if [[ -n "$py" && -x "$py" ]]; then
      printf '%s\n' "$py"
      return 0
    fi
  done
  return 1
}

build_launchd_path() {
  local entries=()
  local current_path="${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"
  IFS=':' read -r -a split_current <<< "$current_path"
  entries+=("${split_current[@]}")
  local codex_bin
  codex_bin="$(command -v codex 2>/dev/null || true)"
  if [[ -n "$codex_bin" ]]; then
    entries+=("$(dirname "$codex_bin")")
  fi
  local node_bin
  node_bin="$(command -v node 2>/dev/null || true)"
  if [[ -n "$node_bin" ]]; then
    entries+=("$(dirname "$node_bin")")
  fi
  local nvm_dir="$HOME/.nvm/versions/node"
  if [[ -d "$nvm_dir" ]]; then
    local candidate
    while IFS= read -r candidate; do
      entries+=("$candidate")
    done < <(find "$nvm_dir" -maxdepth 3 -type d -name bin 2>/dev/null | sort -r)
  fi
  entries+=("/opt/homebrew/bin" "/usr/local/bin" "/usr/bin" "/bin" "/usr/sbin" "/sbin")
  local seen=":"
  local ordered=()
  local entry
  for entry in "${entries[@]}"; do
    [[ -n "$entry" ]] || continue
    [[ -d "$entry" ]] || continue
    if [[ "$seen" != *":$entry:"* ]]; then
      ordered+=("$entry")
      seen="${seen}${entry}:"
    fi
  done
  local joined=""
  local part
  for part in "${ordered[@]}"; do
    if [[ -z "$joined" ]]; then
      joined="$part"
    else
      joined="$joined:$part"
    fi
  done
  printf '%s\n' "$joined"
}

xml_escape() {
  local value="${1//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  printf '%s\n' "$value"
}

shell_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\\\''/g")"
}

launchd_service_target() {
  printf '%s/%s\n' "$LAUNCHD_DOMAIN" "$1"
}

launchd_pid() {
  local label="$1"
  launchctl print "$(launchd_service_target "$label")" 2>/dev/null \
    | awk -F'= ' '/^[[:space:]]*pid = / {gsub(/;$/, "", $2); print $2; exit}'
}

launchd_bootout() {
  local label="$1"
  local plist="$2"
  launchctl bootout "$(launchd_service_target "$label")" 2>/dev/null || true
  launchctl bootout "$LAUNCHD_DOMAIN" "$plist" 2>/dev/null || true
}

write_launchd_plist() {
  local label="$1"
  local plist="$2"
  local wrapper="$3"
  local stdout_path="$4"
  local stderr_path="$5"
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$(xml_escape "$label")</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(xml_escape "$wrapper")</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$stdout_path")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$stderr_path")</string>
</dict>
</plist>
EOF
}

write_launchd_wrapper() {
  local wrapper="$1"
  shift
  local launchd_path
  launchd_path="$(build_launchd_path)"
  cat > "$wrapper" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd $(shell_quote "$ROOT")
export PATH=$(shell_quote "$launchd_path")
export HOME=$(shell_quote "$HOME")
export PYTHONUNBUFFERED=1
if [[ -f $(shell_quote "$ENV_FILE") ]]; then
  set -a
  source $(shell_quote "$ENV_FILE")
  set +a
fi
EOF
  local arg
  local line=""
  for arg in "$@"; do
    line="${line} $(shell_quote "$arg")"
  done
  printf 'exec%s\n' "$line" >> "$wrapper"
  chmod +x "$wrapper"
}

write_terminal_service_wrapper() {
  local title="$1"
  local wrapper="$2"
  local mode="$3"
  local stop_file="$4"
  shift 4
  local shell_path
  shell_path="$(build_launchd_path)"
  cat > "$wrapper" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd $(shell_quote "$ROOT")
export PATH=$(shell_quote "$shell_path")
export HOME=$(shell_quote "$HOME")
export PYTHONUNBUFFERED=1
printf '\\033]0;${title}\\007'
STOP_FILE=$(shell_quote "$stop_file")
rm -f "\$STOP_FILE"
if [[ -f $(shell_quote "$ENV_FILE") ]]; then
  set -a
  source $(shell_quote "$ENV_FILE")
  set +a
fi
EOF
  local arg
  local line=""
  for arg in "$@"; do
    line="${line} $(shell_quote "$arg")"
  done
  if [[ "$mode" == "supervise" ]]; then
    cat >> "$wrapper" <<EOF
while true; do
  if [[ -f "\$STOP_FILE" ]]; then
    rm -f "\$STOP_FILE"
    exit 0
  fi
  printf '[%s] ${title} wrapper starting\n' "\$(date '+%Y-%m-%d %H:%M:%S')"
  set +e
${line}
  rc=\$?
  set -e
  printf '[%s] ${title} wrapper observed exit code %s\n' "\$(date '+%Y-%m-%d %H:%M:%S')" "\$rc"
  if [[ -f "\$STOP_FILE" ]]; then
    rm -f "\$STOP_FILE"
    exit 0
  fi
  sleep 2
done
EOF
  else
    printf '%s\n' "$line" >> "$wrapper"
  fi
  chmod +x "$wrapper"
}

close_terminal_windows_by_title() {
  local title="$1"
  terminal_host_enabled || return 0
  osascript <<EOF >/dev/null 2>&1 || true
tell application "Terminal"
  repeat with w in (every window)
    try
      set shouldClose to false
      repeat with t in (every tab of w)
        set tabName to ""
        try
          set tabName to (name of t) as text
        end try
        set customName to ""
        try
          set customName to (custom title of t) as text
        end try
        if tabName contains "$title" or customName contains "$title" then
          set shouldClose to true
          exit repeat
        end if
      end repeat
      if shouldClose then
        close w
      end if
    end try
  end repeat
end tell
EOF
}

kill_wrapper_processes() {
  local pattern="$1"
  local current="$$"
  local parent="$PPID"
  local pid
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    [[ "$pid" == "$current" || "$pid" == "$parent" ]] && continue
    kill "$pid" 2>/dev/null || true
  done < <(pgrep -f "$pattern" 2>/dev/null || true)
}

open_terminal_wrapper() {
  local title="$1"
  local wrapper="$2"
  close_terminal_windows_by_title "$title"
  osascript <<EOF >/dev/null
tell application "Terminal"
  do script "bash $(shell_quote "$wrapper"); exit"
end tell
EOF
}

bootstrap_launchd_service() {
  local label="$1"
  local plist="$2"
  launchd_bootout "$label" "$plist"
  launchctl bootstrap "$LAUNCHD_DOMAIN" "$plist"
}

wait_for_ready() {
  local mode="$1"
  local timeout_seconds="$2"
  local start_ts
  start_ts="$(date +%s)"
  while true; do
    case "$mode" in
      loop)
        if is_running; then
          return 0
        fi
        ;;
      query)
        if is_query_running; then
          return 0
        fi
        ;;
      watchdog)
        if is_watchdog_running; then
          return 0
        fi
        ;;
      web)
        if is_web_running; then
          return 0
        fi
        ;;
      api)
        if is_api_running; then
          return 0
        fi
        ;;
      sync)
        if is_sync_running; then
          return 0
        fi
        ;;
      signal)
        if is_signal_running; then
          return 0
        fi
        ;;
      vis)
        if is_vis_running; then
          return 0
        fi
        ;;
      execution)
        if is_execution_running; then
          return 0
        fi
        ;;
    esac
    if (( $(date +%s) - start_ts >= timeout_seconds )); then
      return 1
    fi
    sleep 1
  done
}

latest_cycle_marker() {
  local latest
  latest="$(ls -1 "$CYCLES_DIR"/cycle_*.json 2>/dev/null | sort | tail -1 || true)"
  if [[ -z "$latest" ]]; then
    printf '%s\n' "-"
    return 0
  fi
  local mtime
  mtime="$(stat -f '%m' "$latest" 2>/dev/null || printf '0')"
  printf '%s\n' "${latest##*/}:$mtime"
}

wait_for_cycle_advance() {
  local baseline="$1"
  local timeout_seconds="$2"
  local start_ts
  start_ts="$(date +%s)"
  while true; do
    local marker
    marker="$(latest_cycle_marker)"
    if [[ "$marker" != "$baseline" && "$marker" != "-" ]]; then
      return 0
    fi
    if (( $(date +%s) - start_ts >= timeout_seconds )); then
      return 1
    fi
    sleep 2
  done
}

is_running() {
  if launchd_enabled; then
    local launchd_loop_pid
    launchd_loop_pid="$(launchd_pid "$LOOP_LABEL")"
    if [[ -n "$launchd_loop_pid" && "$launchd_loop_pid" != "0" ]]; then
      return 0
    fi
  fi
  if [[ ! -f "$PID_FILE" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

is_query_running() {
  if sidecar_launchd_enabled; then
    local launchd_query_pid
    launchd_query_pid="$(launchd_pid "$QUERY_LABEL")"
    if [[ -n "$launchd_query_pid" && "$launchd_query_pid" != "0" ]]; then
      if lsof -iTCP:8086 -sTCP:LISTEN >/dev/null 2>&1; then
        echo "$launchd_query_pid" > "$QUERY_PID_FILE"
        return 0
      fi
    fi
  fi
  if [[ ! -f "$QUERY_PID_FILE" ]]; then
    if curl -fsS --max-time 2 "http://127.0.0.1:8086/api/v1/runtime/card" >/dev/null 2>&1; then
      local live_pid
      live_pid="$(lsof -ti tcp:8086 2>/dev/null | head -1 || true)"
      [[ -n "$live_pid" ]] && echo "$live_pid" > "$QUERY_PID_FILE"
      return 0
    fi
    return 1
  fi
  local pid
  pid="$(cat "$QUERY_PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  if curl -fsS --max-time 2 "http://127.0.0.1:8086/api/v1/runtime/card" >/dev/null 2>&1; then
    local live_pid
    live_pid="$(lsof -ti tcp:8086 2>/dev/null | head -1 || true)"
    [[ -n "$live_pid" ]] && echo "$live_pid" > "$QUERY_PID_FILE"
    return 0
  fi
  return 1
}

is_watchdog_running() {
  if sidecar_launchd_enabled; then
    local launchd_watchdog_pid
    launchd_watchdog_pid="$(launchd_pid "$WATCHDOG_LABEL")"
    if [[ -n "$launchd_watchdog_pid" && "$launchd_watchdog_pid" != "0" ]]; then
      return 0
    fi
  fi
  if [[ ! -f "$WATCHDOG_PID_FILE" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

execution_listener_pid() {
  lsof -ti tcp:8092 -sTCP:LISTEN 2>/dev/null | head -1 || true
}

execution_health_json() {
  curl -fsS --max-time 5 "http://127.0.0.1:8092/health" 2>/dev/null || true
}

execution_exchange_json() {
  curl -fsS --max-time 5 "http://127.0.0.1:8092/config/exchange" 2>/dev/null || true
}

execution_reports_binance_demo() {
  local config_json
  config_json="$(execution_exchange_json)"
  if [[ "$config_json" == *'"exchange":"binance"'* && "$config_json" == *'"mode":"demo"'* ]]; then
    return 0
  fi
  local health_json
  health_json="$(execution_health_json)"
  [[ "$health_json" == *'"exchange":"binance"'* && "$health_json" == *'"mode":"demo"'* ]]
}

adopt_execution_listener() {
  local pid="${1:-}"
  [[ -n "$pid" ]] || return 1
  if execution_reports_binance_demo; then
    echo "$pid" > "$EXECUTION_PID_FILE"
    return 0
  fi
  return 1
}

terminate_pid() {
  local pid="${1:-}"
  [[ -n "$pid" ]] || return 0
  kill "$pid" 2>/dev/null || true
  sleep 2
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

is_execution_running() {
  if [[ -f "$EXECUTION_PID_FILE" ]]; then
    local pid
    pid="$(cat "$EXECUTION_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  local live_pid
  live_pid="$(execution_listener_pid)"
  if [[ -n "$live_pid" ]] && adopt_execution_listener "$live_pid"; then
    return 0
  fi
  return 1
}

is_web_running() {
  local live_pid
  live_pid="$(lsof -ti tcp:3001 2>/dev/null | head -1 || true)"
  if [[ -n "$live_pid" ]]; then
    echo "$live_pid" > "$WEB_PID_FILE"
    return 0
  fi
  return 1
}

is_api_running() {
  if [[ -f "$API_PID_FILE" ]]; then
    local pid
    pid="$(cat "$API_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  if curl -fsS --max-time 2 "http://127.0.0.1:8088/health" >/dev/null 2>&1; then
    local live_pid
    live_pid="$(lsof -ti tcp:8088 2>/dev/null | head -1 || true)"
    [[ -n "$live_pid" ]] && echo "$live_pid" > "$API_PID_FILE"
    return 0
  fi
  return 1
}

is_sync_running() {
  if [[ -f "$SYNC_PID_FILE" ]]; then
    local pid
    pid="$(cat "$SYNC_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  if curl -fsS --max-time 2 "http://127.0.0.1:8089/api/v1/health" >/dev/null 2>&1; then
    local live_pid
    live_pid="$(lsof -ti tcp:8089 2>/dev/null | head -1 || true)"
    [[ -n "$live_pid" ]] && echo "$live_pid" > "$SYNC_PID_FILE"
    return 0
  fi
  return 1
}

is_signal_running() {
  if [[ -f "$SIGNAL_PID_FILE" ]]; then
    local pid
    pid="$(cat "$SIGNAL_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  local live_pid
  live_pid="$(pgrep -f "$SIGNAL_ROOT" 2>/dev/null | head -1 || true)"
  if [[ -n "$live_pid" ]]; then
    echo "$live_pid" > "$SIGNAL_PID_FILE"
    return 0
  fi
  return 1
}

is_vis_running() {
  if [[ -f "$VIS_PID_FILE" ]]; then
    local pid
    pid="$(cat "$VIS_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  if curl -fsS --max-time 2 "http://127.0.0.1:8087/health" >/dev/null 2>&1; then
    local live_pid
    live_pid="$(lsof -ti tcp:8087 2>/dev/null | head -1 || true)"
    [[ -n "$live_pid" ]] && echo "$live_pid" > "$VIS_PID_FILE"
    return 0
  fi
  return 1
}

start_execution() {
  if is_execution_running; then
    echo "execution-service 已运行"
    return 0
  fi
  export_tool_python
  if [[ ! -d "$EXECUTION_ROOT" ]]; then
    echo "execution-service 目录不存在: $EXECUTION_ROOT"
    return 1
  fi
  local exec_python="$EXECUTION_ROOT/.venv/bin/python"
  if [[ ! -x "$exec_python" ]]; then
    exec_python="$(command -v python3 || true)"
  fi
  local live_pid
  live_pid="$(execution_listener_pid)"
  if [[ -n "$live_pid" ]]; then
    echo "检测到 8092 已被未托管进程占用 (PID: $live_pid)，正在替换"
    terminate_pid "$live_pid"
  fi
  local exec_exchange="${AB_PATROL_EXECUTION_EXCHANGE:-${AB_PATROL_EXCHANGE:-binance}}"
  local exec_mode="${AB_PATROL_EXECUTION_MODE:-}"
  if [[ -z "$exec_mode" ]]; then
    case "$exec_exchange" in
      ctrader)
        exec_mode="$([[ "${AB_PATROL_CTRADER_DEMO:-1}" == "0" ]] && echo mainnet || echo demo)"
        ;;
      okx)
        exec_mode="$([[ "${AB_PATROL_OKX_TESTNET:-0}" == "1" ]] && echo demo || echo mainnet)"
        ;;
      *)
        exec_mode="$([[ "${AB_PATROL_BINANCE_TESTNET:-1}" == "0" ]] && echo mainnet || echo demo)"
        ;;
    esac
  fi
  local binance_mode="${AB_PATROL_BINANCE_MODE:-$exec_mode}"
  nohup bash -lc "cd '$EXECUTION_ROOT' && export PYTHONPATH='$ROOT${PYTHONPATH:+:$PYTHONPATH}' ENV_FILE='$ENV_FILE' EXCHANGE='$exec_exchange' EXCHANGE_MODE='$exec_mode' BINANCE_MODE='$binance_mode' && exec '$exec_python' -m src --port 8092" </dev/null >>"$EXECUTION_LOG_FILE" 2>&1 &
  echo $! > "$EXECUTION_PID_FILE"
  sleep 4
  if is_execution_running; then
    echo "execution-service 已启动 (8092)"
  else
    echo "execution-service 启动失败，查看日志: $EXECUTION_LOG_FILE"
    return 1
  fi
}

stop_execution() {
  local pid=""
  if [[ -f "$EXECUTION_PID_FILE" ]]; then
    pid="$(cat "$EXECUTION_PID_FILE" 2>/dev/null || true)"
  fi
  if [[ -z "$pid" ]]; then
    pid="$(execution_listener_pid)"
  fi
  if [[ -n "$pid" ]]; then
    terminate_pid "$pid"
    rm -f "$EXECUTION_PID_FILE"
    echo "execution-service 已停止"
    return 0
  fi
  rm -f "$EXECUTION_PID_FILE"
  echo "execution-service 未运行"
}

start_api() {
  if is_api_running; then
    echo "api-service 已运行"
    return 0
  fi
  local py
  py="$(service_python "$API_ROOT")"
  nohup bash -lc "cd '$API_ROOT' && export PYTHONPATH='$ROOT${PYTHONPATH:+:$PYTHONPATH}' && exec '$py' -m src" </dev/null >>"$API_LOG_FILE" 2>&1 &
  echo $! > "$API_PID_FILE"
  if wait_for_ready api 15; then
    echo "api-service 已启动 (8088)"
  else
    echo "api-service 启动失败，查看日志: $API_LOG_FILE"
    return 1
  fi
}

stop_api() {
  local pid=""
  if [[ -f "$API_PID_FILE" ]]; then
    pid="$(cat "$API_PID_FILE" 2>/dev/null || true)"
  fi
  [[ -z "$pid" ]] && pid="$(lsof -ti tcp:8088 2>/dev/null | head -1 || true)"
  if [[ -n "$pid" ]]; then
    terminate_pid "$pid"
    rm -f "$API_PID_FILE"
    echo "api-service 已停止"
    return 0
  fi
  rm -f "$API_PID_FILE"
  echo "api-service 未运行"
}

start_sync() {
  if is_sync_running; then
    echo "sync-service 已运行"
    return 0
  fi
  local py
  py="$(service_python "$SYNC_ROOT")"
  nohup bash -lc "cd '$SYNC_ROOT' && export PYTHONPATH='$ROOT:$SYNC_ROOT${PYTHONPATH:+:$PYTHONPATH}' && exec '$py' -m src" </dev/null >>"$SYNC_LOG_FILE" 2>&1 &
  echo $! > "$SYNC_PID_FILE"
  if wait_for_ready sync 15; then
    echo "sync-service 已启动 (8089)"
  else
    echo "sync-service 启动失败，查看日志: $SYNC_LOG_FILE"
    return 1
  fi
}

stop_sync() {
  local pid=""
  if [[ -f "$SYNC_PID_FILE" ]]; then
    pid="$(cat "$SYNC_PID_FILE" 2>/dev/null || true)"
  fi
  [[ -z "$pid" ]] && pid="$(lsof -ti tcp:8089 2>/dev/null | head -1 || true)"
  if [[ -n "$pid" ]]; then
    terminate_pid "$pid"
    rm -f "$SYNC_PID_FILE"
    echo "sync-service 已停止"
    return 0
  fi
  rm -f "$SYNC_PID_FILE"
  echo "sync-service 未运行"
}

start_signal() {
  if is_signal_running; then
    echo "signal-service 已运行"
    return 0
  fi
  local py
  py="$(service_python "$SIGNAL_ROOT")"
  nohup bash -lc "cd '$SIGNAL_ROOT' && export PYTHONPATH='$ROOT:$SIGNAL_ROOT${PYTHONPATH:+:$PYTHONPATH}' && exec '$py' -m src --pg" </dev/null >>"$SIGNAL_LOG_FILE" 2>&1 &
  echo $! > "$SIGNAL_PID_FILE"
  if wait_for_ready signal 15; then
    echo "signal-service 已启动"
  else
    echo "signal-service 启动失败，查看日志: $SIGNAL_LOG_FILE"
    return 1
  fi
}

stop_signal() {
  local pid=""
  if [[ -f "$SIGNAL_PID_FILE" ]]; then
    pid="$(cat "$SIGNAL_PID_FILE" 2>/dev/null || true)"
  fi
  [[ -z "$pid" ]] && pid="$(pgrep -f "$SIGNAL_ROOT" 2>/dev/null | head -1 || true)"
  if [[ -n "$pid" ]]; then
    terminate_pid "$pid"
    rm -f "$SIGNAL_PID_FILE"
    echo "signal-service 已停止"
    return 0
  fi
  rm -f "$SIGNAL_PID_FILE"
  echo "signal-service 未运行"
}

start_vis() {
  if is_vis_running; then
    echo "vis-service 已运行"
    return 0
  fi
  local py
  py="$(service_python "$VIS_ROOT")"
  nohup bash -lc "cd '$VIS_ROOT' && export PYTHONPATH='$ROOT${PYTHONPATH:+:$PYTHONPATH}' && exec '$py' -m src --port 8087" </dev/null >>"$VIS_LOG_FILE" 2>&1 &
  echo $! > "$VIS_PID_FILE"
  if wait_for_ready vis 15; then
    echo "vis-service 已启动 (8087)"
  else
    echo "vis-service 启动失败，查看日志: $VIS_LOG_FILE"
    return 1
  fi
}

stop_vis() {
  local pid=""
  if [[ -f "$VIS_PID_FILE" ]]; then
    pid="$(cat "$VIS_PID_FILE" 2>/dev/null || true)"
  fi
  [[ -z "$pid" ]] && pid="$(lsof -ti tcp:8087 2>/dev/null | head -1 || true)"
  if [[ -n "$pid" ]]; then
    terminate_pid "$pid"
    rm -f "$VIS_PID_FILE"
    echo "vis-service 已停止"
    return 0
  fi
  rm -f "$VIS_PID_FILE"
  echo "vis-service 未运行"
}

start_sidecars() {
  start_api
  start_sync
  start_signal
  start_vis
}

stop_sidecars() {
  stop_vis
  stop_signal
  stop_sync
  stop_api
}

start_web() {
  if is_web_running; then
    echo "AB Patrol-Web 已运行"
    return 0
  fi
  if [[ ! -d "$WEB_ROOT" ]]; then
    echo "AB Patrol-Web 目录不存在: $WEB_ROOT"
    return 1
  fi
  nohup bash -lc "cd '$WEB_ROOT' && exec '$WEB_ROOT/scripts/start.sh' dev" </dev/null >>"$WEB_LOG_FILE" 2>&1 &
  echo $! > "$WEB_PID_FILE"
  if wait_for_ready web 30; then
    echo "AB Patrol-Web 已启动 (3001)"
  else
    echo "AB Patrol-Web 启动失败，查看日志: $WEB_LOG_FILE"
    return 1
  fi
}

stop_web() {
  local pid=""
  if [[ -f "$WEB_PID_FILE" ]]; then
    pid="$(cat "$WEB_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      sleep 2
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
  fi
  pid="$(lsof -ti tcp:3001 2>/dev/null | head -1 || true)"
  if [[ -n "$pid" ]]; then
    terminate_pid "$pid"
  fi
  rm -f "$WEB_PID_FILE"
  echo "AB Patrol-Web 已停止"
}

start_query() {
  if is_query_running; then
    echo "query-service 已运行 (PID: $(cat "$QUERY_PID_FILE"))"
    return 0
  fi
  export_tool_python
  if terminal_host_enabled; then
    kill_wrapper_processes "$QUERY_WRAPPER"
    rm -f "$QUERY_STOP_FILE"
    write_terminal_service_wrapper \
      "AB Patrol Query" \
      "$QUERY_WRAPPER" \
      "supervise" \
      "$QUERY_STOP_FILE" \
      "$AB_PATROL_TOOL_PYTHON" \
      "$QUERY_SERVICE"
    open_terminal_wrapper "AB Patrol Query" "$QUERY_WRAPPER"
    if wait_for_ready query 20; then
      echo "query-service 已在 Terminal 中启动 (PID: $(cat "$QUERY_PID_FILE" 2>/dev/null || printf '-'))"
      return 0
    fi
    echo "query-service Terminal 启动失败，查看日志: $QUERY_LOG_FILE"
    return 1
  fi
  if sidecar_launchd_enabled; then
    write_launchd_plist \
      "$QUERY_LABEL" \
      "$QUERY_PLIST" \
      "$QUERY_WRAPPER" \
      "$QUERY_LOG_FILE" \
      "$QUERY_LOG_FILE"
    write_launchd_wrapper \
      "$QUERY_WRAPPER" \
      "$AB_PATROL_TOOL_PYTHON" \
      "$QUERY_SERVICE"
    bootstrap_launchd_service "$QUERY_LABEL" "$QUERY_PLIST"
    if wait_for_ready query 15; then
      echo "query-service 已由 launchd 启动 (PID: $(cat "$QUERY_PID_FILE" 2>/dev/null || printf '-'))"
      return 0
    fi
    echo "query-service launchd 启动失败，回退到普通后台模式..."
    launchd_bootout "$QUERY_LABEL" "$QUERY_PLIST"
  fi
  nohup "$AB_PATROL_TOOL_PYTHON" "$QUERY_SERVICE" </dev/null >>"$QUERY_LOG_FILE" 2>&1 &
  echo $! > "$QUERY_PID_FILE"
  if wait_for_ready query 10; then
    echo "query-service 已启动 (PID: $(cat "$QUERY_PID_FILE"))"
  else
    echo "query-service 启动失败，查看日志: $QUERY_LOG_FILE"
    return 1
  fi
}

stop_query() {
  if sidecar_launchd_enabled; then
    launchd_bootout "$QUERY_LABEL" "$QUERY_PLIST"
  fi
  if ! is_query_running; then
    rm -f "$QUERY_PID_FILE"
    echo "query-service 未运行"
    return 0
  fi
  touch "$QUERY_STOP_FILE"
  local pid
  pid="$(cat "$QUERY_PID_FILE")"
  kill "$pid" 2>/dev/null || true
  sleep 2
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$QUERY_PID_FILE"
  close_terminal_windows_by_title "AB Patrol Query"
  echo "query-service 已停止"
}

start_watchdog() {
  if is_watchdog_running; then
    echo "watchdog 已运行 (PID: $(cat "$WATCHDOG_PID_FILE"))"
    return 0
  fi
  export_tool_python
  if terminal_host_enabled; then
    kill_wrapper_processes "$WATCHDOG_WRAPPER"
    rm -f "$WATCHDOG_STOP_FILE"
    write_terminal_service_wrapper \
      "AB Patrol Watchdog" \
      "$WATCHDOG_WRAPPER" \
      "supervise" \
      "$WATCHDOG_STOP_FILE" \
      "$AB_PATROL_TOOL_PYTHON" \
      "$WATCHDOG"
    open_terminal_wrapper "AB Patrol Watchdog" "$WATCHDOG_WRAPPER"
    if wait_for_ready watchdog 20; then
      echo "watchdog 已在 Terminal 中启动 (PID: $(cat "$WATCHDOG_PID_FILE" 2>/dev/null || printf '-'))"
      return 0
    fi
    echo "watchdog Terminal 启动失败，查看日志: $WATCHDOG_LOG_FILE"
    return 1
  fi
  if sidecar_launchd_enabled; then
    write_launchd_plist \
      "$WATCHDOG_LABEL" \
      "$WATCHDOG_PLIST" \
      "$WATCHDOG_WRAPPER" \
      "$WATCHDOG_LOG_FILE" \
      "$WATCHDOG_LOG_FILE"
    write_launchd_wrapper \
      "$WATCHDOG_WRAPPER" \
      "$AB_PATROL_TOOL_PYTHON" \
      "$WATCHDOG"
    bootstrap_launchd_service "$WATCHDOG_LABEL" "$WATCHDOG_PLIST"
    if wait_for_ready watchdog 10; then
      echo "watchdog 已由 launchd 启动 (PID: $(cat "$WATCHDOG_PID_FILE" 2>/dev/null || printf '-'))"
      return 0
    fi
    echo "watchdog launchd 启动失败，回退到普通后台模式..."
    launchd_bootout "$WATCHDOG_LABEL" "$WATCHDOG_PLIST"
  fi
  nohup "$AB_PATROL_TOOL_PYTHON" "$WATCHDOG" </dev/null >>"$WATCHDOG_LOG_FILE" 2>&1 &
  echo $! > "$WATCHDOG_PID_FILE"
  if wait_for_ready watchdog 10; then
    echo "watchdog 已启动 (PID: $(cat "$WATCHDOG_PID_FILE"))"
  else
    echo "watchdog 启动失败，查看日志: $WATCHDOG_LOG_FILE"
    return 1
  fi
}

stop_watchdog() {
  if sidecar_launchd_enabled; then
    launchd_bootout "$WATCHDOG_LABEL" "$WATCHDOG_PLIST"
  fi
  if ! is_watchdog_running; then
    rm -f "$WATCHDOG_PID_FILE"
    echo "watchdog 未运行"
    return 0
  fi
  touch "$WATCHDOG_STOP_FILE"
  local pid
  pid="$(cat "$WATCHDOG_PID_FILE")"
  kill "$pid" 2>/dev/null || true
  sleep 2
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$WATCHDOG_PID_FILE"
  close_terminal_windows_by_title "AB Patrol Watchdog"
  echo "watchdog 已停止"
}

start_loop() {
  # 清理旧的 codex 进程避免冲突
  pkill -f "codex exec resume" 2>/dev/null || true
  sleep 2

  if is_running; then
    echo "AB Patrol-Agent 已运行 (PID: $(cat "$PID_FILE"))"
    return 0
  fi
  export_tool_python
  resolve_loop_args "$@"
  if terminal_loop_enabled; then
    local terminal_cmd=(
      "AB Patrol Loop"
      "$LOOP_WRAPPER"
      "supervise"
      "$LOOP_STOP_FILE"
      "$AB_PATROL_TOOL_PYTHON"
      "$RUNTIME"
      "loop"
    )
    if ((${#LOOP_ARGS[@]})); then
      terminal_cmd+=("${LOOP_ARGS[@]}")
    fi
    kill_wrapper_processes "$LOOP_WRAPPER"
    rm -f "$LOOP_STOP_FILE"
    write_terminal_service_wrapper "${terminal_cmd[@]}"
    open_terminal_wrapper "AB Patrol Loop" "$LOOP_WRAPPER"
    if wait_for_ready loop 25; then
      echo "AB Patrol-Agent 已在 Terminal 长会话中启动 (PID: $(cat "$PID_FILE" 2>/dev/null || printf '-'))"
      return 0
    fi
    echo "AB Patrol-Agent Terminal 启动失败，查看日志: $LOG_FILE"
    return 1
  fi
  if launchd_enabled; then
    local launchd_cmd=(
      "$LOOP_WRAPPER"
      "$AB_PATROL_TOOL_PYTHON"
      "$RUNTIME"
      "loop"
    )
    if ((${#LOOP_ARGS[@]})); then
      launchd_cmd+=("${LOOP_ARGS[@]}")
    fi
    write_launchd_plist \
      "$LOOP_LABEL" \
      "$LOOP_PLIST" \
      "$LOOP_WRAPPER" \
      "$LOG_FILE" \
      "$LOG_FILE"
    write_launchd_wrapper "${launchd_cmd[@]}"
    bootstrap_launchd_service "$LOOP_LABEL" "$LOOP_PLIST"
    if wait_for_ready loop 20; then
      echo "AB Patrol-Agent 已由 launchd 启动 (PID: $(cat "$PID_FILE" 2>/dev/null || printf '-'))"
      return 0
    fi
    echo "AB Patrol-Agent launchd 启动失败，查看日志: $LOG_FILE"
    return 1
  fi
  local loop_cmd=("$AB_PATROL_TOOL_PYTHON" "$RUNTIME" "loop")
  if ((${#LOOP_ARGS[@]})); then
    loop_cmd+=("${LOOP_ARGS[@]}")
  fi
  nohup "${loop_cmd[@]}" </dev/null >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  if wait_for_ready loop 10; then
    echo "AB Patrol-Agent 已启动 (PID: $(cat "$PID_FILE"))"
  else
    echo "AB Patrol-Agent 启动失败，查看日志: $LOG_FILE"
    return 1
  fi
}

stop_loop() {
  if launchd_enabled; then
    launchd_bootout "$LOOP_LABEL" "$LOOP_PLIST"
  fi
  if ! is_running; then
    rm -f "$PID_FILE"
    echo "AB Patrol-Agent 未运行"
    return 0
  fi
  touch "$LOOP_STOP_FILE"
  local pid
  pid="$(cat "$PID_FILE")"
  kill "$pid" 2>/dev/null || true
  sleep 2
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  close_terminal_windows_by_title "AB Patrol Loop"
  echo "AB Patrol-Agent 已停止"
}

case "${1:-status}" in
  start)
    shift
    baseline_cycle="$(latest_cycle_marker)"
    start_sidecars
    start_execution
    start_query
    start_loop "$@"
    start_watchdog
    echo "mode: $(loop_mode_label "$@")"
    if wait_for_cycle_advance "$baseline_cycle" 90; then
      echo "fresh: 已观察到新 cycle 产出"
    else
      echo "fresh: 90 秒内未观察到新 cycle，建议立即执行 status 检查"
    fi
    ;;
  stop)
    stop_loop
    stop_watchdog
    stop_query
    stop_execution
    stop_sidecars
    ;;
  restart)
    shift
    baseline_cycle="$(latest_cycle_marker)"
    stop_loop
    stop_watchdog
    stop_query
    stop_execution
    stop_sidecars
    start_sidecars
    start_execution
    start_query
    start_loop "$@"
    start_watchdog
    echo "mode: $(loop_mode_label "$@")"
    if wait_for_cycle_advance "$baseline_cycle" 90; then
      echo "fresh: 已观察到新 cycle 产出"
    else
      echo "fresh: 90 秒内未观察到新 cycle，建议立即执行 status 检查"
    fi
    ;;
  recover)
    shift
    baseline_cycle="$(latest_cycle_marker)"
    stop_loop
    stop_query
    start_sidecars
    start_execution
    start_query
    start_loop "$@"
    echo "mode: $(loop_mode_label "$@")"
    if wait_for_cycle_advance "$baseline_cycle" 90; then
      echo "fresh: 已观察到新 cycle 产出"
    else
      echo "fresh: 90 秒内未观察到新 cycle，建议立即执行 status 检查"
    fi
    ;;
  stack-start)
    shift
    baseline_cycle="$(latest_cycle_marker)"
    start_sidecars
    start_execution
    start_query
    start_loop "$@"
    start_watchdog
    echo "mode: $(loop_mode_label "$@")"
    if wait_for_cycle_advance "$baseline_cycle" 90; then
      echo "fresh: 已观察到新 cycle 产出"
    else
      echo "fresh: 90 秒内未观察到新 cycle，建议立即执行 status 检查"
    fi
    ;;
  stack-stop)
    stop_loop
    stop_watchdog
    stop_query
    stop_execution
    stop_sidecars
    stop_web
    ;;
  web-start)
    start_sidecars
    start_web
    ;;
  web-stop)
    stop_web
    ;;
  once)
    shift
    export_tool_python
    resolve_loop_args "$@"
    if ((${#LOOP_ARGS[@]})); then
      exec "$AB_PATROL_TOOL_PYTHON" "$RUNTIME" once "${LOOP_ARGS[@]}"
    else
      exec "$AB_PATROL_TOOL_PYTHON" "$RUNTIME" once
    fi
    ;;
  loop)
    shift
    export_tool_python
    resolve_loop_args "$@"
    if ((${#LOOP_ARGS[@]})); then
      exec "$AB_PATROL_TOOL_PYTHON" "$RUNTIME" loop "${LOOP_ARGS[@]}"
    else
      exec "$AB_PATROL_TOOL_PYTHON" "$RUNTIME" loop
    fi
    ;;
  loop-start)
    shift
    start_loop "$@"
    ;;
  loop-stop)
    stop_loop
    ;;
  loop-restart)
    shift
    stop_loop
    start_loop "$@"
    ;;
  status)
    export_tool_python
    exec "$AB_PATROL_TOOL_PYTHON" "$CONTROL" status
    ;;
  recent)
    export_tool_python
    exec "$AB_PATROL_TOOL_PYTHON" "$CONTROL" recent
    ;;
  decision)
    export_tool_python
    exec "$AB_PATROL_TOOL_PYTHON" "$CONTROL" decision
    ;;
  query-start)
    start_query
    ;;
  query-stop)
    stop_query
    ;;
  query-restart)
    stop_query
    start_query
    ;;
  watchdog-start)
    start_watchdog
    ;;
  watchdog-stop)
    stop_watchdog
    ;;
  watchdog-restart)
    stop_watchdog
    start_watchdog
    ;;
  charts)
    shift
    exec "$(tool_python)" "$CHART_GEN" --patrol --symbols "${1:-BTCUSDT,ETHUSDT,BNBUSDT}" --port 8092
    ;;
  backtest)
    shift
    exec "$(tool_python)" "$BACKTEST" "$@"
    ;;
  logs)
    exec tail -f "$LOG_FILE" "$QUERY_LOG_FILE" "$WATCHDOG_LOG_FILE" "$EXECUTION_LOG_FILE" "$API_LOG_FILE" "$SYNC_LOG_FILE" "$SIGNAL_LOG_FILE" "$VIS_LOG_FILE" "$WEB_LOG_FILE"
    ;;
  *)
    echo "用法: $0 {start|stop|restart|recover|stack-start|stack-stop|once|loop|loop-start|loop-stop|loop-restart|status|recent|decision|query-start|query-stop|query-restart|watchdog-start|watchdog-stop|watchdog-restart|web-start|web-stop|charts|backtest|logs} [--execute] [--no-telegram]"
    echo "默认模式: 观察模式（AB_PATROL_ENABLE_AUTOTRADE=0）。只有显式 --execute 或设置 AB_PATROL_ENABLE_AUTOTRADE=1 才会自动交易。"
    exit 1
    ;;
esac

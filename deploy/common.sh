#!/usr/bin/env bash
# Extracted from a larger private codebase (CALLIOPE). Source: calliope.sh:58-96,126-150,219-277; adapted: one loopback voice process with start-time and command checks.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${CALLIOPE_STATE_DIR:-$ROOT_DIR/.local-state}"
VOICE_PORT="${VOICE_PORT:-8765}"
PID_FILE="$STATE_DIR/voice.pid"
META_FILE="$STATE_DIR/voice.meta"

validate_port() {
  [[ "$VOICE_PORT" =~ ^[0-9]+$ ]] && (( 10#$VOICE_PORT >= 1 && 10#$VOICE_PORT <= 65535 )) || {
    echo 'Invalid VOICE_PORT.' >&2
    return 1
  }
}

port_busy() {
  python3 - "$VOICE_PORT" <<'PY'
import socket, sys
with socket.socket() as sock:
    try:
        sock.bind(('127.0.0.1', int(sys.argv[1])))
    except OSError:
        sys.exit(0)
sys.exit(1)
PY
}

owned_pid() {
  [[ -f "$PID_FILE" && -f "$META_FILE" ]] || return 1
  local pid recorded current command
  read -r pid < "$PID_FILE"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  recorded="$(cat "$META_FILE")"
  current="$(ps -p "$pid" -o lstart= | sed 's/^ *//; s/ *$//')"
  command="$(ps -p "$pid" -o command=)"
  [[ -n "$current" && "$recorded" == "$current" ]] || return 1
  [[ "$command" == *"$ROOT_DIR/services/voice/main.py"* ]] || return 1
  printf '%s\n' "$pid"
}

health() {
  python3 - "$VOICE_PORT" <<'PY'
import json, sys, urllib.request
try:
    with urllib.request.urlopen('http://127.0.0.1:' + sys.argv[1] + '/health', timeout=2) as response:
        data = json.load(response)
    if data.get('status') != 'ok' or 'stt' not in data or 'tts' not in data:
        raise ValueError('unexpected health response')
    print(json.dumps(data))
except Exception:
    sys.exit(1)
PY
}

#!/usr/bin/env bash
# Extracted from a larger private codebase (CALLIOPE). Source: calliope.sh:418-466,561-593,700-749; adapted: explicit start/stop for the showcase voice process only.
set -euo pipefail
source "$(dirname "$0")/common.sh"
validate_port
case "${1:-start}" in
  start)
    if pid=$(owned_pid); then
      echo "Voice process already running: $pid"
      exit 0
    fi
    if [[ -e "$PID_FILE" || -e "$META_FILE" ]]; then
      echo 'Unverified process metadata exists; inspect it before starting.' >&2
      exit 1
    fi
    if port_busy; then
      echo "Port $VOICE_PORT is occupied; leaving its listener untouched." >&2
      exit 1
    fi
    mkdir -p "$STATE_DIR"
    python3 "$ROOT_DIR/services/voice/main.py" --port "$VOICE_PORT" >"$STATE_DIR/voice.out" 2>&1 &
    pid=$!
    printf '%s\n' "$pid" > "$PID_FILE"
    ps -p "$pid" -o lstart= | sed 's/^ *//; s/ *$//' > "$META_FILE"
    for attempt in {1..30}; do
      if owned_pid >/dev/null && health >/dev/null; then
        echo "Voice service ready on loopback port $VOICE_PORT (PID $pid)."
        exit 0
      fi
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.2
    done
    echo 'Voice service did not become healthy; inspect process metadata.' >&2
    exit 1
    ;;
  stop)
    if ! pid=$(owned_pid); then
      echo 'No verified owned process; nothing was signalled.' >&2
      exit 1
    fi
    kill -TERM "$pid"
    for attempt in {1..30}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$PID_FILE" "$META_FILE"
        echo 'Voice service stopped.'
        exit 0
      fi
      sleep 0.2
    done
    echo 'Process did not stop; no forced signal sent.' >&2
    exit 1
    ;;
  *) echo 'Usage: start.sh [start|stop]' >&2; exit 2 ;;
esac

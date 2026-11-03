#!/usr/bin/env bash
# Extracted from a larger private codebase (CALLIOPE). Source: calliope.sh:930-969; adapted: read-only dependency, port, and health diagnostics.
set -euo pipefail
source "$(dirname "$0")/common.sh"
validate_port
failed=0
for cmd in python3 node npm; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf '%s: available\n' "$cmd"
  else
    printf '%s: missing\n' "$cmd"
    failed=1
  fi
done
if pid=$(owned_pid); then
  echo "Voice process owned: $pid"
  if ! health; then echo 'Voice health unavailable.'; failed=1; fi
elif port_busy; then
  echo "Port $VOICE_PORT: occupied by an unverified listener"
  failed=1
else
  echo "Port $VOICE_PORT: available"
fi
exit "$failed"

#!/usr/bin/env bash
# Extracted from a larger private codebase (CALLIOPE). Source: calliope.sh:751-790; adapted: report owned voice process and health separately.
set -euo pipefail
source "$(dirname "$0")/common.sh"
validate_port
if pid=$(owned_pid); then
  echo "Owned voice process: $pid"
  if health; then exit 0; fi
  echo 'Health check failed.' >&2
  exit 1
fi
if port_busy; then
  echo "Port $VOICE_PORT is occupied by an unverified listener."
else
  echo 'Voice service is stopped.'
fi
exit 1

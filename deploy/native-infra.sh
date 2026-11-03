#!/usr/bin/env bash
# Extracted from a larger private codebase (CALLIOPE). Source: scripts/native-infra.sh:53-88; adapted: optional read-only PostgreSQL and Redis probes, no installation or database mutation.
set -euo pipefail
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
status=0
if command -v pg_isready >/dev/null 2>&1 && pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
  echo 'PostgreSQL: healthy'
else
  echo 'PostgreSQL: unavailable or client missing'
  status=1
fi
if command -v redis-cli >/dev/null 2>&1 && [[ "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null || true)" == PONG ]]; then
  echo 'Redis: healthy'
else
  echo 'Redis: unavailable or client missing'
  status=1
fi
exit "$status"

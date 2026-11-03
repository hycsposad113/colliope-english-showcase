#!/usr/bin/env bash
# Extracted from a larger private codebase (CALLIOPE). Source: scripts/setup-local.sh:35-65,118-128; adapted: read-only prerequisites for the dependency-free Python showcase.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
for cmd in python3 node npm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing prerequisite: $cmd" >&2
    exit 1
  fi
done
python3 -c 'import sys; assert sys.version_info >= (3, 9), "Python 3.9 or newer is required"'
echo 'Prerequisites available. Install Node dependencies with npm ci when network access is available.'
echo "Run: bash $ROOT_DIR/deploy/doctor.sh"

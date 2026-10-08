#!/usr/bin/env bash
# Build Atlas for this platform. All the steps live in scripts/build.py.
set -e
cd "$(dirname "$0")"
exec python3 scripts/build.py "$@"

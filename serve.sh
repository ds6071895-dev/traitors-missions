#!/usr/bin/env sh
# Serve the game, rooms, and voice from the same Node.js process.
set -eu
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec env PORT="${1:-${PORT:-8080}}" node "$DIR/server/index.js"

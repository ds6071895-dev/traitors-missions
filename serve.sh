#!/usr/bin/env sh
# The game is plain <script> tags, so index.html opens straight off disk.
# This is only here if you'd rather run it over http.
PORT="${1:-8080}"
echo "Serving on http://localhost:$PORT/"
python3 -m http.server "$PORT" --directory "$(dirname "$0")"

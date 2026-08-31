#!/usr/bin/env sh
# The game is plain <script> tags, so index.html opens straight off disk.
# This is only here if you'd rather run it over http.
#
# It serves with caching switched off, which matters more than it sounds:
# `python3 -m http.server` sends only `Last-Modified` and no
# `Cache-Control`, and a browser with no cache directive is allowed to
# invent one — Chrome guesses a tenth of the file's age. A file that had
# not been touched in a week is therefore "fresh" for sixteen hours, so
# an ordinary refresh re-runs the old javascript and the edit you just
# made appears not to have happened.
PORT="${1:-8080}"
DIR="$(dirname "$0")"
echo "Serving on http://localhost:$PORT/  (caching off)"
python3 - "$PORT" "$DIR" <<'PY'
import sys, functools, http.server, socketserver

port, directory = int(sys.argv[1]), sys.argv[2]

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    # a conditional request would otherwise still earn a 304, and a 304
    # is the browser being told its stale copy is fine
    def send_head(self):
        del self.headers['If-Modified-Since']
        del self.headers['If-None-Match']
        return super().send_head()

socketserver.TCPServer.allow_reuse_address = True
handler = functools.partial(NoCache, directory=directory)
with socketserver.TCPServer(('', port), handler) as httpd:
    httpd.serve_forever()
PY

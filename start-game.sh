#!/usr/bin/env sh
# House on the Hill - play locally on macOS / Linux. Needs python3 (preinstalled on most systems).
cd "$(dirname "$0")/dist" || exit 1
PORT="${1:-4173}"
URL="http://localhost:$PORT/"
echo "Serving $(pwd) at $URL  (Ctrl+C to stop)"
( sleep 1; command -v open >/dev/null 2>&1 && open "$URL" || { command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL"; } ) >/dev/null 2>&1 &
exec python3 -m http.server "$PORT" --bind 127.0.0.1

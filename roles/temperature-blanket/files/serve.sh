#!/usr/bin/env bash
# Serve the temperature blanket app locally for testing.
# Usage: ./serve.sh [port]
PORT="${1:-8080}"
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Serving temperature blanket at http://localhost:$PORT"
python3 -m http.server "$PORT" --directory "$DIR"

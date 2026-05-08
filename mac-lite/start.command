#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f "dist/index.html" ]; then
  echo "[ERROR] Missing dist/index.html. Please use a complete release package."
  read -r -p "Press Enter to close..."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js was not found in PATH. Install Node.js 24 first."
  read -r -p "Press Enter to close..."
  exit 1
fi

mkdir -p logs

SERVER_PORT="${SERVER_PORT:-3001}"
APP_URL="http://127.0.0.1:${SERVER_PORT}"
APP_HEALTH_URL="${APP_URL}/"
LOG_FILE="$(pwd)/logs/server.log"
PID_FILE="$(pwd)/logs/server.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
  open "$APP_URL"
  exit 0
fi

SERVER_PORT="$SERVER_PORT" nohup node server/index.js > "$LOG_FILE" 2>&1 &
echo "$!" > "$PID_FILE"

for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "$APP_HEALTH_URL" >/dev/null 2>&1; then
    open "$APP_URL"
    exit 0
  fi
  sleep 1
done

echo "[ERROR] Service was not ready within 60 seconds. Check logs/server.log."
read -r -p "Press Enter to close..."
exit 1

#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

PID_FILE="$(pwd)/logs/server.pid"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" >/dev/null 2>&1; then
    kill "$PID"
    rm -f "$PID_FILE"
    echo "Service stopped."
    exit 0
  fi
fi

PORT="${SERVER_PORT:-3001}"
PIDS="$(lsof -ti tcp:"$PORT" || true)"
if [ -n "$PIDS" ]; then
  kill $PIDS
  echo "Service stopped on port $PORT."
else
  echo "No running service found."
fi

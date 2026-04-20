#!/bin/sh
set -e

# Render (và nhiều PaaS) bắt buộc process lắng nghe biến PORT.
PORT="${PORT:-18789}"
export PORT

URL="${RENDER_EXTERNAL_URL:-${RENDER_URL:-}}"

# Keep-alive: giảm idle sleep (Free tier vẫn có thể spin-down). Tắt: ENABLE_RENDER_KEEPALIVE=false
if [ "${ENABLE_RENDER_KEEPALIVE:-true}" != "false" ] && [ -n "$URL" ]; then
  INTERVAL_SEC="${KEEPALIVE_INTERVAL_SEC:-600}"
  (
    while true; do
      sleep "$INTERVAL_SEC"
      curl -fsS "${URL}/healthz" >/dev/null 2>&1 || true
    done
  ) &
fi

exec node /app/openclaw.mjs gateway --bind lan --port "$PORT" --allow-unconfigured

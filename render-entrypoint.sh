#!/bin/sh
set -e

# Render yêu cầu process bind PORT trong vòng 5 phút.
# OpenClaw mất > 2 phút "resolving authentication" trước khi bind port.
# Fix: Dùng render-proxy.mjs — Node.js proxy bind PORT ngay lập tức,
#      OpenClaw chạy internal trên port 18788 (loopback, không cần auth).
#      Sau khi OpenClaw sẵn sàng, proxy forward toàn bộ traffic sang.

PORT="${PORT:-18789}"
export PORT

exec node --max-old-space-size=380 /app/render-proxy.mjs

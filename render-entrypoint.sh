#!/bin/sh
set -e

# Render yêu cầu process bind PORT trong vòng 5 phút.
# render-proxy.mjs bind PORT ngay lập tức, rồi spawn OpenClaw nội bộ.
# Nếu OpenClaw crash → proxy tự restart, KHÔNG exit → Render KHÔNG timeout.

PORT="${PORT:-10000}"
export PORT

# Bắt buộc khi OpenClaw bind non-loopback (lan):
export OPENCLAW_GATEWAY__CONTROLUI__DANGEROUSLYALLOWHOSTHEADERORIGINFALLBACK="true"
export OPENCLAW_GATEWAY__CONTROLUI__ALLOWEDORIGINS='["*"]'

exec node /app/render-proxy.mjs

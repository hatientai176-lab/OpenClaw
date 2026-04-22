#!/bin/sh
set -e

PORT="${PORT:-18789}"
export PORT

# Fix for OpenClaw security block on Render (non-loopback access via Render's proxy)
export OPENCLAW_GATEWAY_CONTROLUI_DANGEROUSLYALLOWHOSTHEADERORIGINFALLBACK="true"

# Tối ưu NODE_OPTIONS
export NODE_OPTIONS="--max-old-space-size=400"

exec node /app/render-proxy.mjs
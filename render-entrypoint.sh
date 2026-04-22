  #!/bin/sh
  set -e

  # Render requires process bind PORT within 5 mins.
  # OpenClaw takes > 2 mins before binding port.
  # Fix: render-proxy.mjs binds PORT immediately, OpenClaw runs on 18788.

  PORT="${PORT:-18789}"
  export PORT

  exec node --max-old-space-size=380 /app/render-proxy.mjs

# OpenClaw trên Render — proxy pattern để fix port-binding timeout.
# Image upstream: https://github.com/openclaw/openclaw
FROM ghcr.io/openclaw/openclaw:latest

USER root

# Copy proxy + entrypoint
COPY render-proxy.mjs /app/render-proxy.mjs
COPY render-entrypoint.sh /usr/local/bin/render-entrypoint.sh
RUN chmod +x /usr/local/bin/render-entrypoint.sh

# Health check dùng biến PORT động của Render
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD node -e "const p=process.env.PORT||'18789';fetch('http://127.0.0.1:'+p+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
ENV HOME=/home/node
WORKDIR /app

ENTRYPOINT ["/usr/local/bin/render-entrypoint.sh"]

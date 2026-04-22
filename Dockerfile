
# OpenClaw on Render - proxy pattern to fix port-binding timeout.# 
# Image upstream: https://github.com/openclaw/openclaw# 
FROM ghcr.io/openclaw/openclaw:latestF

USER rootU

# Copy proxy + entrypoint# 
COPY render-proxy.mjs /app/render-proxy.mjsC
COPY render-entrypoint.sh /usr/local/bin/render-entrypoint.shC
RUN chmod +x /usr/local/bin/render-entrypoint.shR

# Health check using Render dynamic PORT# 
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=H5 \
  CMD node -e "const p=process.env.PORT||'18789';fetch('http://127.0.0.1:'+p+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

  USER node
  ENV HOME=/home/node
  WORKDIR /app

  ENTRYPOINT ["/usr/local/bin/render-entrypoint.sh"]

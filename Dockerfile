# OpenClaw trên Render: dùng image đã build sẵn, gateway listen đúng PORT và bind LAN.
# Repo upstream: https://github.com/openclaw/openclaw
FROM ghcr.io/openclaw/openclaw:latest

USER root
COPY render-entrypoint.sh /usr/local/bin/render-entrypoint.sh
RUN chmod +x /usr/local/bin/render-entrypoint.sh

# Ghi đè HEALTHCHECK của image gốc (cố định 18789) — trên Render PORT là biến động.
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=4 \
  CMD node -e "const p=process.env.PORT||'18789';fetch('http://127.0.0.1:'+p+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
ENV HOME=/home/node
WORKDIR /app

ENTRYPOINT ["/usr/local/bin/render-entrypoint.sh"]

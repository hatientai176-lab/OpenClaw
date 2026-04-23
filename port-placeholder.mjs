// port-placeholder.mjs
// Mở HTTP server NGAY LẬP TỨC trên PORT để Render health check pass.
// Trả về 200 OK cho /healthz và mọi route khác trả "starting, please wait..."
// Script này bị kill sau vài giây khi OpenClaw sẵn sàng chiếm port.

import { createServer } from 'node:http';

const port = parseInt(process.argv[2] || process.env.PORT || '18789', 10);

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok (starting...)');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><h2>OpenClaw is starting up, please wait 30-60 seconds and refresh...</h2></body></html>');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[placeholder] Listening on port ${port} — OpenClaw initializing...`);
});

// Tự tắt sau 120s nếu không bị kill trước (fallback safety)
setTimeout(() => {
  server.close();
  process.exit(0);
}, 120_000);

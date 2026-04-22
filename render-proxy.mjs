// render-proxy.mjs
// Giải quyết vấn đề: OpenClaw mất > 5 phút để "resolving authentication" trước khi bind port.
// Render timeout sau 5 phút nếu không có port nào open.
//
// Chiến lược:
// 1. Node proxy này bind PORT ngay lập tức (< 1 giây).
// 2. OpenClaw chạy trên INTERNAL_PORT (18788) — không cần bind lan, chỉ loopback.
// 3. Proxy forward mọi HTTP request sang OpenClaw khi nó sẵn sàng.
// 4. Trong thời gian chờ, /healthz trả 200 OK để Render hài lòng.

import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';

const PROXY_PORT = parseInt(process.env.PORT || '18789', 10);
const OPENCLAW_PORT = 18788; // OpenClaw chạy internal
const STARTUP_TIMEOUT_MS = 300_000; // 5 phút chờ OpenClaw

let openclawReady = false;
let openclawProcess = null;

// ── 1. Khởi OpenClaw trên internal port ──────────────────────────────────────
function startOpenclaw() {
  const heapMb = parseInt(process.env.OPENCLAW_HEAP_MB || '380', 10);
  const args = [
    `--max-old-space-size=${heapMb}`,
    '/app/openclaw.mjs',
    'gateway',
    '--bind', 'loopback',  // loopback = 127.0.0.1, không cần auth đặc biệt
    '--port', String(OPENCLAW_PORT),
    '--allow-unconfigured',
  ];

  console.log(`[proxy] Starting OpenClaw on internal port ${OPENCLAW_PORT}...`);
  openclawProcess = spawn('node', args, {
    env: {
      ...process.env,
      PORT: String(OPENCLAW_PORT),
      HOME: process.env.HOME || '/home/node',
    },
    stdio: 'inherit',
  });

  openclawProcess.on('exit', (code) => {
    console.error(`[proxy] OpenClaw exited with code ${code}. Exiting proxy.`);
    process.exit(code ?? 1);
  });
}

// ── 2. Poll cho đến khi OpenClaw sẵn sàng ───────────────────────────────────
function waitForOpenclaw(resolve) {
  const check = () => {
    const req = httpRequest(
      { hostname: '127.0.0.1', port: OPENCLAW_PORT, path: '/healthz', method: 'GET', timeout: 2000 },
      (res) => {
        if (res.statusCode < 500) {
          openclawReady = true;
          console.log(`[proxy] OpenClaw is ready on port ${OPENCLAW_PORT}! Forwarding traffic.`);
          resolve();
        } else {
          setTimeout(check, 3000);
        }
        res.resume();
      }
    );
    req.on('error', () => setTimeout(check, 3000));
    req.on('timeout', () => { req.destroy(); setTimeout(check, 3000); });
    req.end();
  };
  check();
}

// ── 3. Proxy request sang OpenClaw ──────────────────────────────────────────
function proxyToOpenclaw(clientReq, clientRes) {
  const options = {
    hostname: '127.0.0.1',
    port: OPENCLAW_PORT,
    path: clientReq.url,
    method: clientReq.method,
    headers: clientReq.headers,
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy] Error forwarding request:', err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502);
      clientRes.end('OpenClaw gateway error');
    }
  });

  clientReq.pipe(proxyReq, { end: true });
}

// ── 4. HTTP Server ── bind ngay lập tức ─────────────────────────────────────
const server = createServer((req, res) => {
  if (!openclawReady) {
    if (req.url === '/healthz') {
      // Trả 200 để Render health check PASS ngay
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok (openclaw starting...)');
    } else {
      res.writeHead(503, { 'Content-Type': 'text/html', 'Retry-After': '30' });
      res.end(`<html><body>
        <h2>⏳ OpenClaw is starting up...</h2>
        <p>Please wait 30-60 seconds and refresh this page.</p>
        <script>setTimeout(()=>location.reload(), 10000)</script>
      </body></html>`);
    }
  } else {
    proxyToOpenclaw(req, res);
  }
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[proxy] HTTP proxy ready on port ${PROXY_PORT} — waiting for OpenClaw...`);
});

// Keep-alive ping
const keepaliveUrl = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_URL;
const enableKeepalive = process.env.ENABLE_RENDER_KEEPALIVE !== 'false';
if (enableKeepalive && keepaliveUrl) {
  const intervalSec = parseInt(process.env.KEEPALIVE_INTERVAL_SEC || '600', 10);
  setInterval(() => {
    httpRequest({ hostname: new URL(keepaliveUrl).hostname, path: '/healthz', method: 'GET' }, (r) => r.resume())
      .on('error', () => {})
      .end();
  }, intervalSec * 1000);
}

// ── 5. Main ──────────────────────────────────────────────────────────────────
startOpenclaw();
new Promise((resolve) => waitForOpenclaw(resolve));

// Cleanup
process.on('SIGTERM', () => {
  openclawProcess?.kill('SIGTERM');
  server.close();
  process.exit(0);
});

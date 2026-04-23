// render-proxy.mjs  v3
// Chiến lược Render-safe:
//   1. HTTP proxy bind PORT ngay lập tức (< 1 giây) → Render KHÔNG timeout.
//   2. OpenClaw chạy trên internal port 18788, bind 0.0.0.0 (lan).
//   3. Nếu OpenClaw crash, proxy tự restart sau RESTART_DELAY_MS — KHÔNG exit.
//   4. /healthz luôn trả 200 dù OpenClaw chưa ready.

import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';

const PROXY_PORT    = parseInt(process.env.PORT || '10000', 10);
const OC_PORT       = 18788;          // OpenClaw internal
const RESTART_DELAY = 15_000;         // ms giữa các lần restart
const POLL_INTERVAL = 5_000;          // ms giữa các health-check poll
const HEAP_MB       = parseInt(process.env.OPENCLAW_HEAP_MB || '360', 10);

let openclawReady   = false;
let openclawProcess = null;
let restarting      = false;
let startCount      = 0;

// ── Spawn OpenClaw ────────────────────────────────────────────────────────────
function spawnOpenclaw() {
  if (restarting) return;
  restarting   = true;
  startCount  += 1;
  openclawReady = false;

  const delay = startCount === 1 ? 0 : RESTART_DELAY;
  console.log(`[proxy] Spawning OpenClaw (attempt #${startCount}) in ${delay}ms…`);

  setTimeout(() => {
    restarting = false;

    const args = [
      `--max-old-space-size=${HEAP_MB}`,
      '/app/openclaw.mjs',
      'gateway',
      '--bind', 'lan',
      '--port', String(OC_PORT),
      '--allow-unconfigured',
    ];

    openclawProcess = spawn('node', args, {
      env: {
        ...process.env,
        PORT: String(OC_PORT),
        HOME: process.env.HOME || '/home/node',
        // Bắt buộc khi bind lan (non-loopback):
        OPENCLAW_GATEWAY__CONTROLUI__DANGEROUSLYALLOWHOSTHEADERORIGINFALLBACK: 'true',
        OPENCLAW_GATEWAY__CONTROLUI__ALLOWEDORIGINS: '["*"]',
      },
      stdio: 'inherit',
    });

    openclawProcess.on('exit', (code, signal) => {
      openclawReady = false;
      console.error(`[proxy] OpenClaw exited (code=${code}, signal=${signal}). Restarting…`);
      spawnOpenclaw();   // ← KHÔNG process.exit() — chỉ restart
    });

    console.log(`[proxy] OpenClaw spawned (pid=${openclawProcess.pid}, heap=${HEAP_MB}MB, port=${OC_PORT})`);

    // Bắt đầu poll sau khi spawn
    pollOpenclaw();
  }, delay);
}

// ── Poll đến khi OpenClaw lắng nghe ─────────────────────────────────────────
function pollOpenclaw() {
  // Thử /health trước (OpenClaw mới), fallback /healthz
  const paths = ['/health', '/healthz'];
  let idx = 0;

  const attempt = () => {
    if (openclawReady) return;   // đã ready, không cần poll nữa

    const path = paths[idx % paths.length];
    idx++;

    const req = httpRequest(
      { hostname: '127.0.0.1', port: OC_PORT, path, method: 'GET', timeout: 3000 },
      (res) => {
        res.resume();
        if (res.statusCode < 500) {
          openclawReady = true;
          console.log(`[proxy] ✅ OpenClaw ready on port ${OC_PORT} (${path} → ${res.statusCode}). Forwarding traffic.`);
        } else {
          setTimeout(attempt, POLL_INTERVAL);
        }
      }
    );
    req.on('error', ()  => setTimeout(attempt, POLL_INTERVAL));
    req.on('timeout', () => { req.destroy(); setTimeout(attempt, POLL_INTERVAL); });
    req.end();
  };

  // Chờ 5 giây sau spawn để OpenClaw có cơ hội khởi động
  setTimeout(attempt, 5_000);
}

// ── Proxy request → OpenClaw ─────────────────────────────────────────────────
function proxyToOpenclaw(clientReq, clientRes) {
  const proxyReq = httpRequest(
    {
      hostname: '127.0.0.1',
      port: OC_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: clientReq.headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[proxy] Forward error:', err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502);
      clientRes.end('Gateway temporarily unavailable');
    }
    // Nếu lỗi kết nối, đánh dấu not-ready để polling restart
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      openclawReady = false;
    }
  });

  clientReq.pipe(proxyReq, { end: true });
}

// ── HTTP Server (bind ngay lập tức) ──────────────────────────────────────────
const server = createServer((req, res) => {
  // /healthz luôn trả 200 để Render không timeout
  if (req.url === '/healthz' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(openclawReady ? 'ok' : 'ok (openclaw starting...)');
    return;
  }

  if (!openclawReady) {
    res.writeHead(503, { 'Content-Type': 'text/html', 'Retry-After': '30' });
    res.end(`<html><body>
      <h2>⏳ OpenClaw is starting up…</h2>
      <p>Attempt #${startCount}. Please wait 30-60 seconds and refresh.</p>
      <script>setTimeout(()=>location.reload(), 15000)</script>
    </body></html>`);
    return;
  }

  proxyToOpenclaw(req, res);
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[proxy] 🚀 HTTP proxy listening on PORT ${PROXY_PORT}`);
  console.log(`[proxy] OpenClaw will start on internal port ${OC_PORT}`);
});

// ── Keep-alive ping (ngăn Render spin-down sau 15 phút) ──────────────────────
const keepaliveUrl      = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_URL;
const enableKeepalive   = process.env.ENABLE_RENDER_KEEPALIVE !== 'false';
const keepaliveInterval = parseInt(process.env.KEEPALIVE_INTERVAL_SEC || '600', 10) * 1000;

if (enableKeepalive && keepaliveUrl) {
  setInterval(() => {
    try {
      const u = new URL(keepaliveUrl);
      httpRequest({ hostname: u.hostname, path: '/healthz', method: 'GET' }, (r) => r.resume())
        .on('error', () => {})
        .end();
      console.log(`[proxy] Keep-alive ping → ${u.hostname}/healthz`);
    } catch {}
  }, keepaliveInterval);
  console.log(`[proxy] Keep-alive enabled (every ${keepaliveInterval / 1000}s) → ${keepaliveUrl}`);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[proxy] SIGTERM received — shutting down…');
  openclawProcess?.kill('SIGTERM');
  server.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[proxy] Uncaught exception (keeping alive):', err.message);
  // Không exit — giữ port mở luôn
});

// ── Start ─────────────────────────────────────────────────────────────────────
spawnOpenclaw();

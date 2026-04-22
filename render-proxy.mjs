// render-proxy.mjs — v2
// Bind PORT ngay lập tức, chạy OpenClaw internal, poll /health đúng endpoint.
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';

const PROXY_PORT    = parseInt(process.env.PORT || '18789', 10);
const OPENCLAW_PORT = 18788;

let openclawReady = false;

function startOpenclaw() {
  const heap = parseInt(process.env.OPENCLAW_HEAP_MB || '360', 10);

  // Truyền OPENCLAW_GATEWAY_TOKEN để OpenClaw vượt "resolving authentication"
  const childEnv = {
    ...process.env,
    PORT: String(OPENCLAW_PORT),
    HOME: process.env.HOME || '/home/node',
    // OpenClaw đọc token từ đây để skip interactive setup
    OPENCLAW_GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN || '',
  };

  const proc = spawn(
    'node',
    [`--max-old-space-size=${heap}`, '/app/openclaw.mjs', 'gateway',
     '--bind', 'lan',          // lan = bind all interfaces
     '--port', String(OPENCLAW_PORT),
     '--allow-unconfigured'],
    { env: childEnv, stdio: 'inherit' }
  );

  proc.on('exit', (code) => {
    console.error(`[proxy] OpenClaw exited: ${code}. Shutting down.`);
    process.exit(code ?? 1);
  });

  console.log(`[proxy] OpenClaw spawned (heap=${heap}MB, port=${OPENCLAW_PORT})`);
}

function pollOpenclaw() {
  // Thử cả /healthz và /health vì tùy version
  const paths = ['/healthz', '/health'];
  let idx = 0;

  const check = () => {
    const path = paths[idx % paths.length];
    idx++;
    const req = httpRequest(
      { hostname: '127.0.0.1', port: OPENCLAW_PORT, path, method: 'GET', timeout: 3000 },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          openclawReady = true;
          console.log(`[proxy] OpenClaw READY via ${path} (${res.statusCode}). Forwarding traffic.`);
        } else {
          setTimeout(check, 4000);
        }
      }
    );
    req.on('error', () => setTimeout(check, 4000));
    req.on('timeout', () => { req.destroy(); setTimeout(check, 4000); });
    req.end();
  };
  check();
}

function proxyRequest(clientReq, clientRes) {
  const pr = httpRequest(
    { hostname: '127.0.0.1', port: OPENCLAW_PORT,
      path: clientReq.url, method: clientReq.method, headers: clientReq.headers },
    (res) => { clientRes.writeHead(res.statusCode, res.headers); res.pipe(clientRes); }
  );
  pr.on('error', () => { if (!clientRes.headersSent) { clientRes.writeHead(502); clientRes.end('Bad Gateway'); } });
  clientReq.pipe(pr, { end: true });
}

// ── HTTP Server — bind PORT ngay lập tức ──────────────────────────────────
const server = createServer((req, res) => {
  if (!openclawReady) {
    if (req.url === '/healthz' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok (openclaw starting...)');
    } else {
      res.writeHead(503, { 'Content-Type': 'text/html', 'Retry-After': '15' });
      res.end('<!DOCTYPE html><html><head><meta charset="utf-8">'
        + '<meta http-equiv="refresh" content="15">'
        + '</head><body style="font-family:sans-serif;padding:2rem">'
        + '<h2>⏳ OpenClaw is starting up…</h2>'
        + '<p>Auto-refreshing in 15 seconds. First boot may take 2–3 minutes.</p>'
        + '</body></html>');
    }
    return;
  }
  proxyRequest(req, res);
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[proxy] Listening on PORT ${PROXY_PORT} — starting OpenClaw...`);
  startOpenclaw();
  pollOpenclaw();
});

// ── Keep-alive ──────────────────────────────────────────────────────────────
const extUrl = process.env.RENDER_EXTERNAL_URL;
if (process.env.ENABLE_RENDER_KEEPALIVE !== 'false' && extUrl) {
  const ms = parseInt(process.env.KEEPALIVE_INTERVAL_SEC || '600', 10) * 1000;
  setInterval(() => {
    try {
      const u = new URL(extUrl);
      httpRequest({ hostname: u.hostname, path: '/healthz', method: 'GET' }, r => r.resume())
        .on('error', () => {}).end();
    } catch {}
  }, ms);
}

process.on('SIGTERM', () => { server.close(); process.exit(0); });

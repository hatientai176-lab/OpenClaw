// render-proxy.mjs
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';

const PROXY_PORT = parseInt(process.env.PORT || '18789', 10);
const OPENCLAW_PORT = 18788;

let openclawReady = false;
let openclawProcess = null;

function startOpenclaw() {
  const heapMb = parseInt(process.env.OPENCLAW_HEAP_MB || '400', 10);
  const args = [
    --max-old-space-size=${heapMb},
    '/app/openclaw.mjs',
    'gateway',
    '--bind', 'lan',
    '--port', String(OPENCLAW_PORT),
    '--allow-unconfigured',
  ];
  console.log([proxy] Starting OpenClaw on internal port ${OPENCLAW_PORT} with args:, args.join(' '));
  openclawProcess = spawn('node', args, {
    env: { ...process.env, PORT: String(OPENCLAW_PORT), HOME: process.env.HOME || '/home/node' },
    stdio: 'inherit',
  });
  openclawProcess.on('exit', (code) => {
    console.error([proxy] OpenClaw exited with code ${code}.);
    process.exit(code ?? 1);
  });
}

function waitForOpenclaw() {
  const check = () => {
    const req = httpRequest(
      { hostname: '127.0.0.1', port: OPENCLAW_PORT, path: '/healthz', method: 'GET', timeout: 2000 },
      (res) => {
        if (res.statusCode < 500) {
          openclawReady = true;
          console.log([proxy] OpenClaw ready! Forwarding traffic.);
        } else { setTimeout(check, 3000); }
        res.resume();
      }
    );
    req.on('error', () => setTimeout(check, 3000));
    req.on('timeout', () => { req.destroy(); setTimeout(check, 3000); });
    req.end();
  };
  check();
}

function proxyToOpenclaw(clientReq, clientRes) {
  const proxyReq = httpRequest(
    { hostname: '127.0.0.1', port: OPENCLAW_PORT, path: clientReq.url, method: clientReq.method, headers: clientReq.headers },
    (proxyRes) => { clientRes.writeHead(proxyRes.statusCode, proxyRes.headers); proxyRes.pipe(clientRes, { end: true }); }
  );
  proxyReq.on('error', (err) => {
    if (!clientRes.headersSent) { clientRes.writeHead(502); clientRes.end('Gateway error'); }
  });
  clientReq.pipe(proxyReq, { end: true });
}

const server = createServer((req, res) => {
  if (!openclawReady) {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok (openclaw starting...)');
    } else {
      res.writeHead(503, { 'Content-Type': 'text/html', 'Retry-After': '30' });
      res.end('<html><body><h2>OpenClaw is starting, please wait 30-60 seconds...</h2><script>setTimeout(()=>location.reload(),10000)</script></body></html>');
    }
  } else {
    proxyToOpenclaw(req, res);
  }
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log([proxy] Listening on port ${PROXY_PORT} — waiting for OpenClaw...);
});

const keepaliveUrl = process.env.RENDER_EXTERNAL_URL;
if (process.env.ENABLE_RENDER_KEEPALIVE !== 'false' && keepaliveUrl) {
  const interval = parseInt(process.env.KEEPALIVE_INTERVAL_SEC || '600', 10) * 1000;
  setInterval(() => {
    try {
      const u = new URL(keepaliveUrl);
      httpRequest({ hostname: u.hostname, path: '/healthz', method: 'GET' }, (r) => r.resume()).on('error', () => {}).end();
    } catch {}
  }, interval);
}

startOpenclaw();
waitForOpenclaw();

process.on('SIGTERM', () => { openclawProcess?.kill('SIGTERM'); server.close(); process.exit(0); });
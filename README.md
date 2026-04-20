# OpenClaw — triển khai Render

Repo deploy tối giản: [github.com/hatientai176-lab/OpenClaw](https://github.com/hatientai176-lab/OpenClaw) — **push code lên GitHub**, cấu hình env trên [Render](https://dashboard.render.com/) (AI không đăng nhập thay bạn được).

- `Dockerfile` — image `ghcr.io/openclaw/openclaw` + entrypoint (`PORT`, bind `lan`, keep-alive `/healthz`).
- `render.yaml` — Blueprint Web service + gợi ý secret (`sync: false`).
- `DEPLOY_RENDER.md` — chi tiết và biến bắt buộc.

Upstream OpenClaw: [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw).

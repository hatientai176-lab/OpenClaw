# Deploy OpenClaw Gateway lên Render

Repo này **không** chứa full source OpenClaw — image build từ `ghcr.io/openclaw/openclaw` (upstream [openclaw/openclaw](https://github.com/openclaw/openclaw)). `Dockerfile` chỉ thêm entrypoint: bind `lan`, port đúng `PORT` của Render, và keep-alive ping `/healthz`.

## Quan trọng: “full quyền” từ AI

**Không ai (kể cả AI) có thể đăng nhập thay bạn** vào [Render Dashboard](https://dashboard.render.com/) hay GitHub — cần tài khoản và 2FA của bạn. Bạn tự **dán** biến môi trường tại tab **Environment** của Web Service (ví dụ: `https://dashboard.render.com/web/srv-d7i4mggsfn5c73e441dg/env`).

---

## 1) Push lên GitHub

```bash
cd /path/to/Openclaw
git init
git add .
git commit -m "Add Render deploy for OpenClaw gateway"
git remote add origin https://github.com/hatientai176-lab/OpenClaw.git
git branch -M main
git push -u origin main
```

Repo đích: [github.com/hatientai176-lab/OpenClaw](https://github.com/hatientai176-lab/OpenClaw). Đường dẫn có `/upload` trên GitHub chỉ là trang tải file web — làm việc lâu dài nên dùng **Git** ([cài trên Windows](https://git-scm.com/download/win)).

### Đã có Web Service trên Render (ví dụ `srv-d7i4mggsfn5c73e441dg`)

1. **Settings** → **Build & Deploy** → **Repository** → kết nối `hatientai176-lab/OpenClaw`, branch `main`.
2. **Root Directory** để trống (nếu code ở thư mục gốc repo).
3. **Dockerfile Path** = `Dockerfile` (hoặc để Render tự nhận).
4. Tab **Environment**: thêm đủ biến ở mục 3 dưới đây → **Save** → **Manual Deploy** nếu cần.

## 2) Tạo Web Service trên Render (lần đầu)

1. [Dashboard Render](https://dashboard.render.com/) → **New +** → **Blueprint** (hoặc **Web Service**).
2. Kết nối repo GitHub, chọn repo vừa push.
3. Render đọc `render.yaml`: service `openclaw-gateway`, health check `/healthz`.

**Ổ đĩa bền (khuyến nghị):** Trên plan có Persistent Disk, thêm Disk mount tại `/home/node/.openclaw` (hoặc bỏ comment `disk` trong `render.yaml`). Không có disk thì cấu hình trong container có thể **mất khi redeploy** — vẫn chạy được cho thử nghiệm.

## 3) Biến môi trường bắt buộc / nên có

Thêm trong **Environment** của service (hoặc **Environment Group**):

| Biến | Mục đích |
|------|-----------|
| `OPENCLAW_GATEWAY_TOKEN` | Chuỗi bí mật dài; dán vào Control UI (Settings). Tạo: `openssl rand -hex 32`. |
| `TELEGRAM_BOT_TOKEN` | Nếu dùng kênh Telegram (@BotFather). |
| `OPENAI_API_KEY` | (hoặc provider khác) nếu agent cần model — tùy cấu hình trong `openclaw.json`. |

Render tự set: `PORT`, `RENDER_EXTERNAL_URL` (dùng cho keep-alive trong entrypoint).

**Lưu ý:** Không commit token vào git; chỉ cấu hình trên Render.

## 4) Keep-alive

- Entrypoint chạy vòng lặp `curl` tới `$RENDER_EXTERNAL_URL/healthz` mỗi `KEEPALIVE_INTERVAL_SEC` (mặc định 600 giây).
- Tắt bằng `ENABLE_RENDER_KEEPALIVE=false` nếu không cần.

Gói **Free** có thể vẫn spin-down sau idle; keep-alive giảm nguy cơ nhưng không thay cho gói luôn bật nếu bạn cần SLA chặt.

## 5) Kiểm tra sau deploy

- Trình duyệt: `https://<service>.onrender.com/` — Control UI (cần `OPENCLAW_GATEWAY_TOKEN`).
- Health: `curl -fsS https://<service>.onrender.com/healthz`

## 6) Cập nhật image OpenClaw

Đổi tag trong `Dockerfile` nếu cần pin phiên bản, ví dụ:

`FROM ghcr.io/openclaw/openclaw:2026.2.26`

Sau đó push → Render rebuild.

## Tài liệu chính thức

- [Docker install](https://docs.openclaw.ai/install/docker)
- [Environment variables](https://docs.clawd.bot/help/environment)

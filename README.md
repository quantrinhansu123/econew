# ECO Transport System v2.0

Webapp B2B quản lý logistics — NestJS + React + PostgreSQL (Supabase).

**Repository:** [github.com/quantrinhansu123/econew](https://github.com/quantrinhansu123/econew)

## Cấu trúc

| Thư mục | Mô tả |
|---|---|
| `client/` | React + Vite + Tailwind (frontend) |
| `server/` | NestJS REST API (`/api/v1`) |
| `docs/` | Tài liệu nội bộ (định dạng tiền, deploy, …) |

## Yêu cầu

- [Node.js LTS](https://nodejs.org) (≥ 20)
- **pnpm** — bật qua Corepack (không cần npm):

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

## Dev local

Dự án dùng **pnpm** cho cả frontend và backend (không dùng npm/yarn).

```bash
# Backend (port theo server/.env, mặc định 3002)
cd server && pnpm install && pnpm dev

# Frontend (http://localhost:6060, proxy /api → backend)
cd client && pnpm install && pnpm dev
```

Đợi log `API listening on http://127.0.0.1:...` rồi mở http://localhost:6060

## Deploy

| Thành phần | Nền tảng | Ghi chú |
|---|---|---|
| **Backend** | [Render](https://render.com) | `server/render.yaml`, Root Directory = `server` |
| **Frontend** | [Vercel](https://vercel.com) | Connect repo `econew`, set `VITE_API_URL` → URL Render |

Chi tiết: [docs/DEPLOY.md](docs/DEPLOY.md)

## Tài liệu

- [AGENTS.md](AGENTS.md) — quy ước nghiệp vụ & tech stack
- [STYLE_GUIDE.md](STYLE_GUIDE.md) — UI/component patterns
- [docs/MONEY_FORMAT.md](docs/MONEY_FORMAT.md) — định dạng VNĐ

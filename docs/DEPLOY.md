# Deploy — econew

Repo: [quantrinhansu123/econew](https://github.com/quantrinhansu123/econew)

## Kiến trúc

```
Browser → Vercel (FE)  ──VITE_API_URL──►  Render (BE NestJS)  ──►  Supabase PostgreSQL
```

---

## 1. Backend — Render

1. [render.com](https://render.com) → **New Web Service**
2. Connect GitHub **quantrinhansu123/econew**
3. Cấu hình:

| Mục | Giá trị |
|---|---|
| Root Directory | `server` |
| Build Command | `corepack enable && pnpm install --frozen-lockfile && pnpm build` |
| Start Command | `pnpm start:prod` |
| Health Check | `/api/v1/health` |

4. **Environment Variables** (copy từ `server/.env` local, không commit):

| Biến | Bắt buộc |
|---|---|
| `SUPABASE_POOLER_DATABASE_URL` | ✅ Session pooler Supabase |
| `SUPABASE_URL` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| `SUPABASE_STORAGE_BUCKET` | `payment-proofs` |
| `JWT_ACCESS_SECRET` | ✅ |
| `JWT_REFRESH_SECRET` | ✅ |
| `CORS_ORIGIN` | URL frontend Vercel |
| `DB_POOL_MAX` | `5` |

5. `pnpm start:prod` tự chạy migration trước khi khởi động API.

6. Kiểm tra: `https://<tên-service>.onrender.com/api/v1/health` → `{"ok":true,...}`

Hoặc dùng Blueprint: file `server/render.yaml`.

### Kiểm tra backend đã nhận bản sửa

Dấu xanh **Vercel** trên GitHub chỉ xác nhận frontend. Backend Render deploy riêng;
`ok: true` ở health endpoint chưa đủ, cần đối chiếu trường `commit`.

```bash
cd server
pnpm deploy:verify
# Hoặc kiểm tra SHA đầy đủ và backend cụ thể:
pnpm deploy:verify <full-commit-sha> https://econew.onrender.com/api/v1/health
```

Lệnh chỉ đọc health endpoint, trả exit code 1 nếu backend chưa chạy đúng commit.
Nếu lệch phiên bản: Render → service `econew` → **Manual Deploy → Deploy latest commit**.
Kiểm tra branch `main`, Auto-Deploy được bật và log build/start không lỗi;
sau khi deploy hoàn tất chạy lại lệnh trên.

Sự cố COD ngày 15/09/2026: backend còn ở `9aea15e` trong khi Git đã có
`c28b30c` và `6a3dbe9`. Bản cũ vẫn báo “Sổ quỹ COD phải thuộc HUB đến của vận đơn”.
Cần deploy backend chứa hai bản sửa này để xác nhận vào sổ quỹ đã tạo;
bưu cục thu vẫn theo HUB đến, không cần đổi HUB của sổ quỹ.

---

## 2. Frontend — Vercel

1. Import repo **econew** trên Vercel
2. Root: project root (dùng `vercel.json` ở root)
3. **Environment Variables:**

| Biến | Giá trị |
|---|---|
| `VITE_API_URL` | `https://<tên-service>.onrender.com/api/v1` |

4. Deploy → mở URL Vercel → đăng nhập thử

---

## 3. CORS

Backend cho phép sẵn:

- `https://eco-webapp.vercel.app` và preview `*.vercel.app`
- `https://*.onrender.com`
- Giá trị trong `CORS_ORIGIN` (env)

Thêm domain FE mới vào `CORS_ORIGIN` trên Render.

---

## 4. Git remote

```bash
git remote -v
# origin  https://github.com/quantrinhansu123/econew.git

git push origin main
```

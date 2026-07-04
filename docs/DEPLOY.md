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
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start:prod` |
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

5. **Release Command** (migration): `npm run migration:run`

6. Kiểm tra: `https://<tên-service>.onrender.com/api/v1/health` → `{"ok":true,...}`

Hoặc dùng Blueprint: file `server/render.yaml`.

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

# AGENTS.md — ECO Transport System v2.0

Bạn là senior fullstack developer phát triển hệ thống quản lý vận tải **ECO Transport System v2.0** — webapp B2B quản lý toàn bộ luồng logistics từ đầu vào đến chặng phát cuối.

---

## 1. Tech Stack & Kiến trúc

```
Backend:      TypeScript · NestJS · RESTful API
Frontend:     React (TypeScript) · HTML · TailwindCSS
Database:     PostgreSQL (Supabase)
Kiến trúc:   Modular monolith — 6 phân hệ dùng chung 1 PostgreSQL database
Base API URL: /api/v1
Package manager: pnpm (bắt buộc dùng pnpm cho mọi lệnh install, không dùng npm hay yarn)
```

**2 bưu cục chính:** Hà Nội (HAN) · TP.HCM (HCM)

---

## 2. Schema Database

```sql
-- HUBS (Bưu cục)
id            BIGINT PK
code          VARCHAR UNIQUE      -- mã bưu cục, ví dụ: HAN, HCM
name          VARCHAR
address       VARCHAR
coordinates   VARCHAR             -- tọa độ GPS
created_at    TIMESTAMP

-- USERS (Nhân sự)
id            BIGINT PK
username      VARCHAR UNIQUE
name          VARCHAR
phone         VARCHAR
role_mask     INTEGER             -- bitmask kiêm nhiệm (xem phần RBAC)
created_at    TIMESTAMP

-- USER_HUBS (Quan hệ N-N nhân sự ↔ bưu cục)
user_id       BIGINT FK → USERS
hub_id        BIGINT FK → HUBS

-- WAYBILLS (Vận đơn)
id                  BIGINT PK
waybill_code        VARCHAR UNIQUE   -- mã vận đơn / barcode
sender_info         VARCHAR
receiver_info       VARCHAR
weight              DOUBLE
length              DOUBLE
width               DOUBLE
height              DOUBLE
volumetric_weight   DOUBLE           -- = (length × width × height) / 5000
payment_type        VARCHAR          -- PP | CC | COD
cost_amount         DECIMAL
current_state       VARCHAR          -- 8 trạng thái (xem phần State Machine)
origin_hub_id       BIGINT FK → HUBS
dest_hub_id         BIGINT FK → HUBS
last_mile_driver_id BIGINT FK → USERS
delivery_photo_url  VARCHAR          -- lưu URL ảnh giao hàng (3 ảnh/đơn)
delivery_time       TIMESTAMP
created_at          TIMESTAMP

-- MANIFESTS (Bảng kê đóng đi)
id              BIGINT PK
manifest_code   VARCHAR UNIQUE
seal_code       VARCHAR             -- mã seal/kẹp chì niêm phong
origin_hub_id   BIGINT FK → HUBS
dest_hub_id     BIGINT FK → HUBS
status          VARCHAR
created_at      TIMESTAMP

-- MANIFEST_WAYBILLS (Quan hệ N-N manifest ↔ vận đơn)
manifest_id     BIGINT PK, FK → MANIFESTS
waybill_id      BIGINT PK, FK → WAYBILLS

-- TRUCKS (Xe)
id                       BIGINT PK
license_plate            VARCHAR UNIQUE
payload                  DOUBLE
driver_id                BIGINT FK → USERS
fuel_consumption_limit   DOUBLE       -- định mức dầu (xe nội bộ)
status                   VARCHAR

-- TRIPS (Chuyến xe)
id               BIGINT PK
truck_id         BIGINT FK → TRUCKS
manifest_id      BIGINT FK → MANIFESTS
start_hub_id     BIGINT FK → HUBS
end_hub_id       BIGINT FK → HUBS
departure_time   TIMESTAMP
arrival_time     TIMESTAMP
status           VARCHAR
fuel_actual      DOUBLE               -- lượng dầu thực tế (xe nội bộ)
fuel_cost        DECIMAL              -- chi phí nhiên liệu (xe nội bộ)
other_costs      DECIMAL              -- chi phí dọc đường (xe ngoài/NCC)
created_at       TIMESTAMP

-- EXPENSES (Chi phí phát sinh theo chuyến)
id        BIGINT PK
trip_id   BIGINT FK → TRIPS

-- RECONCILIATIONS (Đối soát bưu cục)
id                   BIGINT PK
hub_id               BIGINT FK → HUBS
reconciliation_date  DATE
cod_cash_held        DECIMAL
cc_cash_held         DECIMAL
total_remitted       DECIMAL
remittance_status    VARCHAR    -- PENDING | REMITTED | OVERDUE
remitted_at          TIMESTAMP
```

---

## 3. State Machine — Vận đơn (Waybill)

```
Thứ tự       Trạng thái (current_state)   Điều kiện chuyển
─────────────────────────────────────────────────────────────────
1 → 2        RECEIVED → IN_WAREHOUSE       scan mã + upload ảnh
2 → 3        IN_WAREHOUSE → MANIFEST_CLOSED  ghép manifest + seal_code
3 → 4        MANIFEST_CLOSED → IN_TRANSIT    xe khởi hành
4 → 5        IN_TRANSIT → AT_DEST_HUB        xe đến bưu cục đích
5 → 6        AT_DEST_HUB → OUT_FOR_DELIVERY  bàn giao tài xế chặng cuối
6 → 7        OUT_FOR_DELIVERY → DELIVERED    upload ≥ 1 ảnh giao hàng
6 → 8        OUT_FOR_DELIVERY → RETURNED     giao thất bại
```

**Ràng buộc:**
- Chỉ chuyển trạng thái đúng thứ tự, không nhảy cóc
- `DELIVERED` bắt buộc có `delivery_photo_url`
- Manifest cần `seal_code` trước khi xe → `IN_TRANSIT`
- Chi phí phát sinh (`EXPENSES`) chỉ ghi sau khi trip → `IN_TRANSIT`
- `OVERDUE`: đơn ở `AT_DEST_HUB` hoặc `OUT_FOR_DELIVERY` quá thời hạn SLA

---

## 4. Phân quyền (RBAC — role_mask bitmask)

```
Bit 0  (1):   WAREHOUSE_STAFF   thủ kho, nhập kho
Bit 1  (2):   PACKER            nhân viên đóng gói, tạo manifest
Bit 2  (4):   DRIVER            tài xế chặng cuối
Bit 3  (8):   DISPATCHER        điều phối, lên kế hoạch xe
Bit 4  (16):  ACCOUNTANT        tài chính, đối soát
Bit 5  (32):  MANAGER           quản lý bưu cục
Bit 6  (64):  DIRECTOR          ban giám đốc, toàn quyền xem
```

**Ví dụ:** `role_mask = 7` (1+2+4) → kiêm WAREHOUSE_STAFF + PACKER + DRIVER

**Kiểm tra quyền:**
```typescript
const hasRole = (user: User, role: number) => (user.role_mask & role) !== 0;
const isManager = (user: User) => (user.role_mask & (32 | 64)) !== 0;
```

**Quy tắc ẩn/hiện bắt buộc:**

| Tính năng | Điều kiện hiển thị |
|---|---|
| Cột cước phí trên danh sách tồn kho | MANAGER+ (role_mask ≥ 32) |
| Hạn mức cước mục tiêu (load planning) | MANAGER+ |
| Lãi/lỗ tạm tính chuyến xe | MANAGER+ |
| Dashboard KPI & báo cáo doanh thu | DIRECTOR hoặc MANAGER |
| Trang `/print/waybill/:id` | Mặc định ẩn cước; chỉ MANAGER/DIRECTOR được bật `Hiện cước khi in` |

---

## 5. Danh sách trang (38 trang)

> `[H]` = tính năng ẩn, chỉ render với MANAGER+ &nbsp;|&nbsp; `[P]` = template in riêng, strip tính năng ẩn

### Module 1 — Quản lý kho & bưu cục

| # | Tên trang | Route |
|---|---|---|
| 1 | Danh sách đơn tồn kho | `/warehouse/inventory` |
| 2 | Nhập đơn mới | `/warehouse/orders/new` |
| 3 | Tiếp nhận đơn tại kho | `/warehouse/orders/:id/receive` |
| 4 | Thông báo hàng đến dự kiến | `/warehouse/incoming` |
| 5 | Phân loại ưu tiên giao hàng | `/warehouse/priority` |
| 6 | Đóng xếp hàng theo chuyến `[H]` | `/warehouse/load-planning` |
| 7 | Tạo & quản lý bảng kê đóng đi `[P]` | `/warehouse/manifests` |
| 8 | Chi tiết bảng kê | `/warehouse/manifests/:id` |

**Ghi chú trang 1:** cột `cost_amount` chỉ render khi `isManager(user)`. Hiển thị tổng kg và m3 tính từ `weight` và `volumetric_weight` của các waybill trong danh sách.

### Module 2 — Quản lý giao hàng

| # | Tên trang | Route |
|---|---|---|
| 9 | Tách hàng theo tuyến giao | `/delivery/routing` |
| 10 | Bàn giao vận đơn cho tài xế | `/delivery/handover` |
| 11 | Giao hàng dọc đường (chành) | `/delivery/en-route` |
| 12 | Giao hàng tại bưu cục đích | `/delivery/hub-dropoff` |
| 13 | Giao hàng chặng cuối (shipper) | `/delivery/last-mile` |
| 14 | Quản lý COD & cước CC | `/delivery/cod` |

### Module 3 — Quản lý xe vận tải

| # | Tên trang | Route |
|---|---|---|
| 15 | Danh sách chuyến xe | `/trips` |
| 16 | Tạo chuyến xe mới (NCC) | `/trips/new` |
| 17 | Chi tiết chuyến xe | `/trips/:id` |
| 18 | Chi phí phát sinh chuyến | `/trips/:id/expenses` |
| 19 | Lãi/lỗ tạm tính chuyến `[H]` | `/trips/:id/profit` |
| 20 | Quản lý xe nội bộ | `/trucks` |
| 21 | Chấm điểm tài xế | `/drivers/performance` |

### Module 4 — Tìm kiếm chuyên sâu

| # | Tên trang | Route |
|---|---|---|
| 22 | Tìm kiếm tổng hợp | `/search` |
| 23 | Kết quả tìm kiếm — vận đơn | `/search/waybills` |
| 24 | Kết quả tìm kiếm — chuyến xe | `/search/trips` |

### Module 5 — Tài chính kế toán

| # | Tên trang | Route |
|---|---|---|
| 25 | Đối soát COD với khách hàng | `/finance/cod-reconciliation` |
| 26 | Phê duyệt chi phí xe nội bộ | `/finance/approve/internal` |
| 27 | Phê duyệt chi phí NCC đường trục | `/finance/approve/vendor` |
| 28 | Đối soát tiền mặt bưu cục | `/finance/hub-reconciliation` |

### Module 6 — Dashboard ban giám đốc

| # | Tên trang | Route |
|---|---|---|
| 29 | Dashboard KPI toàn công ty `[H]` | `/dashboard` |
| 30 | Giám sát giao hàng quá hạn | `/dashboard/overdue` |
| 31 | Báo cáo doanh thu theo khách hàng | `/reports/revenue` |
| 32 | Quản trị nhân sự & phân quyền | `/admin/users` |

### Dùng chung (Shared)

| # | Tên trang | Route |
|---|---|---|
| 33 | Đăng nhập | `/login` |
| 34 | Quản lý bưu cục | `/admin/hubs` |
| 35 | Quản lý xe & tài xế | `/admin/trucks` |
| 36 | Cấu hình NCC đường trục | `/admin/vendors` |
| 37 | In phiếu giao nhận `[P]` | `/print/waybill/:id` |
| 38 | Hồ sơ & cài đặt cá nhân | `/profile` |

---

## 6. Quy ước code

- Tên file component: `PascalCase.tsx` — đặt đúng thư mục module tương ứng
- Tên file service/controller (NestJS): `kebab-case.service.ts` / `kebab-case.controller.ts`
- Mọi endpoint trả về lỗi dùng HTTP status chuẩn (400, 401, 403, 404, 422, 500)
- Không trả `cost_amount` trong response API nếu caller không có quyền MANAGER+
- Template `/print/waybill/:id` là route riêng biệt; cước chỉ render khi MANAGER/DIRECTOR chủ động bật `Hiện cước khi in`

---

## 7. Phần đưa vào chat khi cần (không để thường trực)

Khi bắt đầu task mới, paste thêm phần phù hợp:

| Task | Paste thêm |
|---|---|
| Viết API controller/service | Mock API endpoints (phần 5 master prompt) |
| Làm logic đổi trạng thái | State machine chi tiết (phần 4 master prompt) |
| Làm trang thuộc module cụ thể | Mô tả nghiệp vụ module đó (phần 2 master prompt) |
| Viết test | Kế hoạch kiểm thử (phần 8 master prompt) |

## Thiết kế giao diện
Xem STYLE_GUIDE.md ở root để hiểu pattern UI, component và quy ước đặt tên.
Mọi trang/component mới phải tuân theo STYLE_GUIDE.md trước khi viết code.
**Định dạng số tiền VNĐ** (hiển thị + ô nhập) và **bộ lọc trang hàng đến**: xem `docs/MONEY_FORMAT.md` và dùng `client/src/lib/formatMoney.ts`.

## Skills

Các skill được lưu tại .agents/skills/, áp dụng như sau:

- **Định dạng tiền VNĐ:** đọc `docs/MONEY_FORMAT.md` và áp dụng `.agents/skills/money-format/`
- Backend NestJS: đọc và áp dụng .agents/skills/nestjs-expert/
- Deploy Vercel: đọc và áp dụng .agents/skills/deploy-to-vercel/
- Supabase: đọc và áp dụng .agents/skills/supabase-postgres-best-practices/
- Frontend Vercel: đọc và áp dụng .agents/skills/vercel-react-best-practices/
- Web design: đọc và áp dụng .agents/skills/web-design-guidelines/

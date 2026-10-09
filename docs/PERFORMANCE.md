# Đo và tối ưu tốc độ tải

Đo ngày 09/10/2026. Bản đối chiếu trước thay đổi: `6c78673`.

| Phép đo | Trước | Sau |
|---|---:|---:|
| JavaScript tải ban đầu (chưa nén) | 835.142 byte | 307.218 byte |
| JavaScript tải ban đầu (gzip) | 242.969 byte | 96.855 byte |
| JavaScript tĩnh khi mở danh sách đơn từ đầu (chưa nén) | 2.000.348 byte | 778.446 byte |
| Truy vấn KPI | 10 | 4 |
| Thời gian KPI | 917 ms | 399 ms |
| Truy vấn báo cáo 17 HUB | 137 | 4 |
| Thời gian báo cáo 17 HUB | 11.863 ms | 350 ms |

JavaScript ban đầu giảm khoảng 63% trước nén, 60% sau gzip. Danh sách đơn giảm khoảng 61% JavaScript tĩnh, tính cả entrypoint và các dependency, chưa tính CSS/API. Thời gian backend được đo từ máy phát triển tới PostgreSQL, trong giao dịch chỉ đọc, với kỳ 01/09–30/09/2026. Kết quả KPI và toàn bộ 17 HUB trước/sau giống nhau. Đây là số đo trong điều kiện kiểm tra, không phải cam kết thời gian tải trên mọi mạng hoặc thời gian khởi động Render.

## Các thay đổi

- Tải các trang Dashboard, module, bảng kê và chi tiết bảng kê khi mở route; danh sách khách hàng và các hộp thoại lớn khi mở chức năng.
- Tải thư viện Excel khi xuất file, mở nhập loạt hoặc lưu bảng kích thước, thay vì khi mở các trang chuyến xe, đóng xếp, danh sách đơn, nhập đơn, in bảng kê và bảng lương.
- Gộp các GET giống nhau đang chạy. Danh mục HUB được lưu tạm 5 phút; NCC và tuyến được lưu 1 phút, theo từng tài khoản/token và tham số truy vấn.
- Các GET tài chính/vận đơn chỉ được gộp khi đang chạy, không lưu kết quả sau khi hoàn tất. Mỗi caller nhận dữ liệu riêng. Ghi dữ liệu hoặc thoát phiên xóa cache; GET cũ không được phục hồi cache sau khi ghi. Request có signal hoặc header riêng được xử lý độc lập.
- Nén JSON từ 1 KB bằng gzip/encoding mà client hỗ trợ. Không nén response đăng nhập, ảnh, file, hoặc response có `Cache-Control: no-transform`. Middleware được gắn ở cả entrypoint NestJS và serverless.
- KPI gom các phép đếm/tổng hợp vào 4 truy vấn. Thống kê HUB gom nhóm theo HUB trong 4 truy vấn, thay cho 8 truy vấn mỗi HUB; HUB không có đơn vẫn trả số 0.

## Kiểm tra lại

Trong `client`:

```powershell
pnpm exec vitest run
pnpm build
pnpm exec node scripts/measure-bundle.mjs .tmp/bundle-after.json
pnpm preview --host 127.0.0.1 --port 6060
```

Giữ preview chạy, mở terminal khác trong `client`:

```powershell
pnpm exec node scripts/check-startup-performance.mjs
pnpm exec node scripts/check-inventory-pagination.mjs
pnpm exec node scripts/check-customer-statement.mjs
```

Các kiểm tra trình duyệt chặn toàn bộ API và dùng fixture; không ghi vào dữ liệu thật. Kiểm tra startup dùng graph của build đo ở trên để xác nhận dialog và Excel chỉ được tải khi cần.

Trong `server`:

```powershell
pnpm exec jest --runInBand
pnpm build
pnpm exec node -r ts-node/register scripts/measure-dashboard.cjs .tmp/dashboard-after.json 2026-09-01 2026-09-30
```

Lệnh đo backend sử dụng kết nối từ biến môi trường của server và giao dịch `READ ONLY`; file kết quả nằm trong thư mục bị gitignore. Không thêm index hoặc sửa bản ghi trong đợt tối ưu này.

ESLint của các file sửa khác đã qua. `ModulePage.tsx` và `LoadPlanningBoardPanel.tsx` có 4 lỗi và 4 cảnh báo hook tồn tại từ bản đối chiếu; các vị trí này không được thay đổi trong đợt này.

## Áp dụng trên hệ thống thật

Frontend Vercel và backend Render cần nhận cùng bản sửa. Đối chiếu commit backend bằng `pnpm deploy:verify` trong `server`; frontend deploy thành công không xác nhận backend đã deploy. Nếu chậm chủ yếu ở lần mở đầu sau thời gian dài không dùng, cần kiểm tra thời gian khởi động của hosting riêng.

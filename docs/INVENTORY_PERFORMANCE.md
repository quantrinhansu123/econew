# Hiệu năng danh sách vận đơn

## Nguyên nhân trong code

Trước thay đổi, cả danh sách đơn và tồn kho gọi `loadAllInventoryRows` khi mở trang,
đổi bộ lọc, lấy lại focus và mỗi 30 giây. Hàm tải hết các trang, mỗi trang 100 đơn,
rồi mới cập nhật giao diện. 10.000 đơn tương ứng 100 request danh sách mỗi lần tải,
chưa tính truy vấn tổng hợp và quan hệ phía backend.

## Thay đổi

- Mở danh sách đơn lấy 25 đơn/trang; tồn kho lấy 10 đơn/trang. Có thể chọn tối đa 100.
- Tìm kiếm và bộ lọc chính chạy ở backend, đặt lại trang 1, chờ 250 ms khi gõ.
- Hủy request cũ khi đổi bộ lọc/rời trang; không làm mới ở tab ẩn hoặc khi đang tải.
- Tổng số đơn và tổng cước theo bộ lọc lấy từ API. Tổng kiện/cân/khối và dòng tổng bảng
  ghi rõ phạm vi trang hiện tại.
- In và Excel vẫn tải đủ kết quả lọc, tối đa hai trang đồng thời.
- Mở bộ lọc cột hoặc chọn sắp xếp nâng cao tải toàn bộ kết quả một lần để giữ đúng
  các giá trị được tính từ ghi chú/lịch sử chuyến. Chế độ này không tự làm mới nền,
  chỉ render một trang; nút “Về danh sách phân trang” trở về chế độ tải nhẹ.
  Với dữ liệu lớn, nên dùng bộ lọc ngày/khách hàng trước khi mở lọc cột hoặc xuất/in.
- Query danh sách dùng LIMIT/OFFSET trực tiếp trên các quan hệ many-to-one.
  Bộ lọc nhà xe dùng EXISTS để không nhân bản vận đơn hoặc cộng cước nhiều lần
  khi một đơn có nhiều kiện/chuyến cùng nhà xe.
- Migration `1826000000000-IndexWaybillListPagination` tạo index thứ tự danh sách,
  ngày gửi và phân bổ kiện bằng CREATE INDEX CONCURRENTLY.

## Triển khai và kiểm tra

Render cần chạy `pnpm start:prod` hoặc Start Command trong `server/render.yaml`:
migration chạy trước khi API khởi động, theo từng transaction. Migration index
chạy ngoài transaction. Không chạy migration này trong transaction bao toàn bộ.

Kiểm tra log có migration `IndexWaybillListPagination1826000000000` thành công.
Trong Network của trình duyệt, mở `/warehouse/orders` phải có một request
`trip-lines?page=1&limit=25...`; chuyển trang chỉ lấy trang kế tiếp.

Kiểm tra tự động (không dùng dữ liệu thật):

```powershell
cd server
pnpm exec jest --runInBand waybills.service.spec.ts
pnpm build
cd ../client
pnpm exec vitest run src/pages/warehouse/inventory src/pages/print/inventoryPrintUtils.test.ts
pnpm build
pnpm dev
# Terminal khác, trong client:
pnpm exec node scripts/check-inventory-pagination.mjs
```

Browser check giả lập 10.000 đơn để kiểm tra số request và phân trang, không phải
benchmark PostgreSQL hay thời gian phản hồi Render. Chưa xác nhận migration trên
database production hoặc đo tải đồng thời của hệ thống thật.

## Giới hạn cần theo dõi

Tổng hợp toàn bộ kết quả, tìm kiếm ILIKE, OFFSET rất sâu và xuất/in toàn bộ vẫn tăng
chi phí theo dữ liệu. Theo dõi p95 API, CPU/RAM Render và thời gian truy vấn database
với lượng đơn thực tế trước khi quyết định nâng tài nguyên hoặc đổi sang cursor.

Nếu backend dùng Render Free, dịch vụ ngủ sau 15 phút không có traffic và có thể
mất khoảng một phút để khởi động lại. Đây là nguyên nhân riêng, không được giải quyết
bằng phân trang. Xem [tài liệu Render](https://render.com/docs/free#spinning-down-on-idle).
Chưa xác minh gói Render của dự án.

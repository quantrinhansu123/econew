# Kế hoạch và chỉnh sửa điều phối giao hàng

Trang: `/nhiem-vu-giao-hang`.

## Sử dụng

1. Chọn **Xe đang chạy · lập kế hoạch**, bấm **Lập kế hoạch**. Có thể chọn tuyến, tài xế, xe nội bộ (kể cả xe đang chạy), đối tác/xe công nghệ, chi phí dự kiến, ngày giờ và ghi chú.
2. **Lưu kế hoạch** chỉ lưu thông tin dự kiến. Không chuyển trạng thái vận đơn/phần kiện/chuyến/xe, không bàn giao hàng và không tạo công nợ đối tác.
3. Có thể mở **Sửa kế hoạch** và lưu lại nhiều lần. Sau khi xe đến HUB, kế hoạch vẫn còn. Xác nhận khách sẵn sàng, bấm **Bàn giao**, kiểm tra thông tin rồi xác nhận để bắt đầu giao thực tế.
4. Đơn đang giao, đã giao hoặc giao thất bại có **Sửa điều phối**. Sửa thông tin không đổi trạng thái, ảnh hoặc thời gian giao. Dùng bộ lọc **Đã hoàn tất · sửa điều phối / lịch sử** để tìm đơn đã hoàn tất.

Kế hoạch được lưu theo từng dòng tách kiện/chuyến ở `waybill_splits.delivery_dispatch`. Đơn không có dòng tách dùng `waybills.delivery_dispatch`. Không lấy kế hoạch của dòng này áp cho dòng khác.

Điều phối viên hoặc quản lý được lưu/sửa; điều phối viên chỉ thao tác trên hàng thuộc HUB đến được phân công. Tài xế/thủ kho vẫn dùng các thao tác gọi hẹn/giao hàng theo quyền hiện có.

## Lịch sử và đồng thời

- Nút lịch sử mở drawer chứa người thao tác, thời gian, trường thay đổi và giá trị trước/sau, dùng chung `waybill_change_logs` với lịch sử bill.
- Các sự kiện mới: `DELIVERY_PLAN_CREATED`, `DELIVERY_PLAN_UPDATED`, `DELIVERY_ASSIGNMENT_UPDATED`.
- Thay đổi và lịch sử được lưu trong cùng transaction. Ghi lịch sử lỗi thì toàn bộ lần sửa bị rollback.
- Mỗi bản có `version`. Khi lưu gửi `expected_version`; bản cũ trả HTTP 409, yêu cầu tải lại để tránh ghi đè thay đổi của người khác. Bàn giao cũng kiểm tra version kế hoạch.
- Chỉ giữ nguyên tham chiếu tài xế/xe/đối tác đã ngừng hoạt động khi sửa một điều phối thực tế cũ; không dùng ngoại lệ này để lập kế hoạch hoặc gán mới tài nguyên đã ngừng hoạt động.

## API và chi phí

`PATCH /api/v1/waybills/:id/delivery-dispatch` nhận hình thức giao, tài xế/xe/đối tác, tuyến, chi phí, ghi chú, `scheduled_at`, `expected_version`, và `split_id`/`trip_id` khi thao tác trên phần kiện. Backend tự xác định đang lưu kế hoạch hay sửa điều phối thực tế từ trạng thái hiện tại.

Kế hoạch có `kind=PLAN`; chỉ sau bàn giao mới có `kind=ASSIGNMENT`. Công nợ và sổ cái NCC chỉ tính chi phí điều phối thực tế. Các dòng tách được tính riêng và không cộng trùng phần chi phí tổng trên bill; bill cũ chưa có snapshot vẫn giữ cách tính cũ.

API đối soát chi phí cũ tiếp tục đồng bộ chi phí và version nếu bill chỉ có một dòng điều phối. Nếu có nhiều dòng thực tế, sửa chi phí ở từng dòng trên trang Nhiệm vụ giao hàng để tránh phân bổ nhầm.

## Migration và triển khai

Migration mới: `1833000000000-AddDeliveryDispatchPlans.ts`, thêm hai cột JSONB nullable và index phục vụ tra công nợ NCC. Không thay đổi dữ liệu vận đơn đang có.

Chạy migration trước khi dùng backend mới. `pnpm start:prod` đã chạy migration trước khi khởi động; local dùng `pnpm migration:run` trong `server/`. Triển khai cả backend **econew-sg** và frontend **econew-six.vercel.app**.

## Kiểm tra

- Jest: service vận đơn, DTO điều phối và công nợ NCC.
- Vitest: nạp kế hoạch, hiển thị trạng thái và định dạng lịch sử.
- Kiểm thử tích hợp: PostgreSQL trong schema tạm riêng, Nest controller thật, form Vite, lưu/tải lại/sửa, race 409, rollback khi lịch sử lỗi, bàn giao, giữ nguyên chứng từ, tính công nợ và layout mobile. Schema tạm được xoá sau kiểm tra; không sửa dữ liệu vận hành.

Để chạy lại kiểm thử tích hợp, mở Vite tại cổng 6061 trong `client/`:

```powershell
pnpm.cmd exec vite --host 127.0.0.1 --port 6061 --strictPort
```

Sau đó tại `server/`:

```powershell
node scripts/check-delivery-dispatch.cjs
```

Script đọc cấu hình database từ `server/.env`, tạo schema `eco_dispatch_test_*` riêng và xoá schema này trong bước dọn dẹp. Tài khoản database cần quyền tạo schema. Ảnh kiểm thử và kết quả được lưu tại `.tmp/delivery-dispatch-check/`, không đưa vào Git. Trình duyệt chỉ dùng API Nest tạm ở localhost; không gửi yêu cầu thay đổi dữ liệu lên production.

# Thanh toán công nợ NCC theo kỳ

## Sử dụng

1. Trong **Tất cả chuyến xe**, lọc NCC và ngày khởi hành, rồi mở **Bảng kê NCC → Thanh toán**.
2. **Chốt công nợ theo kỳ** kế thừa khoảng ngày đang lọc. Kiểm tra số chuyến và tổng cước, sau đó **Chốt kỳ**.
3. Chọn kỳ đã chốt, bấm **Chi cho kỳ này**, nhập ngày chi, sổ quỹ, loại chi và số tiền.
4. Chi nhiều lần vào cùng kỳ. Ngày chi có thể ở tháng sau. Đủ tiền thì kỳ và các chuyến tự chuyển **Đã TT**; bảng chuyến tải lại ngay.
5. Với khoản đã chi trước đây, mở **Gắn phiếu chi cũ chưa phân bổ**. Chọn phiếu và số tiền muốn phân bổ. Không lập phiếu chi mới; tiền dư trên phiếu vẫn còn để phân bổ vào kỳ khác.

Nút **Chi** ở sổ NCC cũng yêu cầu chọn kỳ hoặc chọn rõ **Chi chung NCC / chưa phân bổ**. Chi chung không tự gán vào chuyến.

## Quy tắc

- Kỳ gồm cước các chuyến đã khởi hành (`IN_TRANSIT`, `ARRIVED`, `COMPLETED`) trong khoảng ngày, theo giờ Việt Nam. Ngày cuối được lấy trọn ngày.
- Danh sách chuyến và cước được lưu cố định; bộ lọc BKS/trạng thái ở bảng không làm thay đổi kỳ. Kỳ của cùng NCC không được chồng ngày; mỗi chuyến chỉ thuộc một kỳ.
- Tổng cước/số chuyến phải còn khớp với bản xem trước tại thời điểm chốt. NCC của chuyến cũ đang kế thừa từ xe được ghi rõ vào chuyến khi chốt.
- Sau khi chốt, không đổi cước, NCC, ngày khởi hành, hủy hoặc xóa chuyến. Các cập nhật vận hành khác vẫn được phép.
- Tiền được phân bổ theo ngày khởi hành cũ trước, rồi ID chuyến. Mỗi lần chỉ trả phần còn nợ; không tự chuyển tiền dư sang tháng khác.
- Nợ đầu kỳ, phí phát sinh và cước giao chặng cuối vẫn theo dõi riêng ở sổ NCC; không cộng ngầm vào tổng cước chuyến của kỳ.
- Xóa phiếu chi trừ ngược đúng số đã phân bổ, tính lại trạng thái chuyến/kỳ và công nợ. Xóa và gắn phiếu cùng sử dụng khóa dòng phiếu chi để tránh ghi đè dữ liệu.
- Chỉ kế toán, quản lý và giám đốc được xem/thao tác kỳ. Phân quyền sổ quỹ giữ nguyên.

## API và triển khai

Các endpoint dưới `/api/v1/vendors/:vendorId/settlements`:

| Method | Đường dẫn | Chức năng |
|---|---|---|
| GET | `/preview?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD` | Xem trước cước/số chuyến |
| POST | `/` | Chốt kỳ, hỗ trợ `expected_total`, `expected_trip_count` để kiểm tra thay đổi |
| GET | `/` | Danh sách kỳ, số tiền, chuyến và lịch sử thanh toán |
| POST | `/:periodId/payments` | Lập phiếu chi mới cho kỳ |
| GET | `/unallocated-payments` | Phiếu chi còn tiền chưa phân bổ |
| POST | `/:periodId/payments/:paymentId/allocate` | Gắn số tiền của phiếu đã có, không ghi chi lần nữa |

Migration: `1836000000000-AddVendorSettlements.ts`.

```powershell
cd server
pnpm migration:run
```

Chạy migration trước khi đưa frontend mới vào sử dụng. Lệnh `start:prod` của backend cũng chạy migration trước khi khởi động API.

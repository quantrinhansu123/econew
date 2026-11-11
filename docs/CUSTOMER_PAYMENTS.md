# Thu công nợ khách hàng

- Thanh toán theo bill: giữ cách chọn bill và nhập số tiền từng bill.
- Nhập số tiền khác: nhập tổng tiền theo mã KH, chọn sổ quỹ nhận tiền. API dùng `POST /api/v1/cash-journal-entries` với `voucher_type: Thu` và `customer_code`.
- Số tiền được phân bổ theo tỷ lệ dư nợ của các bill và nợ đầu kỳ, trên toàn bộ mã KH, không phụ thuộc bộ lọc bảng kê. Không cho thu quá dư nợ hoặc thu mã KH không tồn tại.
- Đơn nhận một phần tiền có trạng thái `PARTIAL` (TT một phần); đủ tiền là `PAID`. Bảng kê KH lấy số đã thu từ các khoản phân bổ để tính dư nợ.
- Phiếu thu có mã KH và khoản thu từ dialog dùng cùng một luồng. Sửa/xóa phiếu sẽ thay thế/hủy phân bổ trong cùng transaction; lỗi sẽ rollback toàn bộ.
- `waybill_cash_vouchers.journal_entry_id` liên kết phân bổ với phiếu gốc. Sổ thu chi và số dư sổ quỹ bỏ qua các dòng phân bổ này để không cộng trùng với phiếu gốc.
- Chạy migration `1837000000000-AddCustomerReceiptAllocations` trước khi dùng backend mới. Migration cập nhật schema và sửa trạng thái các bill đã có khoản thu thành `PARTIAL`/`PAID` theo số tiền thực thu, không sửa giá trị khoản thu. Migration chạy ngoài transaction để PostgreSQL commit giá trị enum mới trước khi cập nhật trạng thái.
- Phiếu chi có mã KH chỉ lưu tham chiếu, không tự giảm công nợ phải thu. Chi trả tiền dư vẫn dùng chức năng chi trả khách hiện tại.

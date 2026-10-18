# Thử ORS tại HCM — 18/10/2026

Đã gọi API thật bằng khóa ORS được cấu hình ở backend và đối chiếu bằng giao diện Google Maps chế độ ô tô, cùng tọa độ đầu/cuối.
Đây là các điểm công khai để thử, không phải vị trí HUB HCM. Không ghi tọa độ thử vào database bưu cục.

## Quãng đường trả về

| Tuyến giữa các điểm thử | ORS | Google Maps đề xuất tại lúc xem |
|---|---:|---:|
| Gần Dinh Độc Lập → Bưu điện Trung tâm Sài Gòn | 1,576 km | [850 m](https://www.google.com/maps/dir/?api=1&origin=10.776889%2C106.695348&destination=10.779971%2C106.700052&travelmode=driving) |
| Bưu điện Trung tâm → gần Chợ Bến Thành | 1,556 km | [1,5 km](https://www.google.com/maps/dir/?api=1&origin=10.779971%2C106.700052&destination=10.7725%2C106.698&travelmode=driving) |
| Gần Chợ Bến Thành → điểm gần Landmark 81 | 5,423 km | [6,1 km](https://www.google.com/maps/dir/?api=1&origin=10.7725%2C106.698&destination=10.7947%2C106.7223&travelmode=driving) |

Tọa độ lần lượt (vĩ độ,kinh độ):

- Điểm gần Dinh Độc Lập: `10.776889,106.695348`.
- Bưu điện Trung tâm: `10.779971,106.700052`.
- Điểm gần Chợ Bến Thành: `10.7725,106.698`.
- Điểm gần Landmark 81: `10.7947,106.7223`. Google nhận diện điểm này là một căn hộ trong khu Vinhomes, không phải bảo đảm cổng vào tòa Landmark 81.

Các số Google được đọc từ giao diện, đã làm tròn và có thể thay đổi khi mở lại link.
Tuyến Dinh → Bưu điện trên Google có cảnh báo đường riêng/hạn chế. Các dịch vụ có thể ghép tọa độ vào đường/cổng vào khác nhau và chọn tuyến khác nhau.
ORS dùng `driving-car`, ưu tiên `fastest`, không có dữ liệu kẹt xe trực tiếp; Google đang xem chế độ ô tô rời đi tại thời điểm thử.
Đối chiếu này cho thấy có khác biệt đáng kể ở một số tuyến, không chứng minh bên nào đúng ngoài thực địa hoặc hai bên có độ chính xác ngang nhau.

## Những giới hạn đã gặp thật

- Nhập tên **Bưu điện Trung tâm Sài Gòn, Thành phố Hồ Chí Minh, Việt Nam**: tìm được điểm đúng khu vực Bưu điện, confidence 0,8 và match dạng fallback. Phần mềm hiển thị tên điểm tìm được và cảnh báo khớp gần đúng.
- Nhập **123 Nguyễn Huệ, Quận 1, Thành phố Hồ Chí Minh, Việt Nam**: ORS chỉ trả kết quả cấp quận/khu vực với confidence thấp. Phần mềm trả HTTP 422 và không gọi tính đường từ tâm quận.
- Điểm thử **10.8188,106.6519** trong khu Tân Sơn Nhất: ORS không tìm được điểm có đường ô tô trong bán kính mặc định 350 m, mã lỗi 2010. Phần mềm đã có thông báo chọn điểm cổng vào/đường tiếp cận và trả 422, không tự chuyển sang đường chim bay.

## Kết quả triển khai

- Hai bộ đếm Directions/Geocoding, giới hạn ngày/phút, chặn trước khi gửi yêu cầu; quota được đồng bộ từ header phản hồi ORS.
- PostgreSQL: thử 12 yêu cầu đồng thời cho lượt ngày cuối và lượt phút cuối, mỗi trường hợp chỉ 1 yêu cầu được gửi đi; kiểm tra Geocoding độc lập, đặt lại cửa sổ, phản hồi về sai thứ tự, Retry-After và giữ hạn mức sau restart.
- Trình duyệt desktop/mobile: chỉ bấm tính mới gọi, chống bấm đúp, ẩn kết quả cũ khi đổi đầu vào, chặn địa chỉ chỉ khớp cấp quận, cho phép dùng tọa độ khi Geocoding hết lượt.
- Khóa chỉ ở backend; không đưa vào mã nguồn, frontend, log hay tài liệu.

Khuyến nghị dùng ORS để tham khảo, ưu tiên tọa độ khách cung cấp và kiểm tra điểm/tuyến trước khi chốt cước. Cần thử thêm các tuyến từ HUB thật khi có GPS chính xác.

Nguồn dữ liệu tuyến ORS: © openrouteservice by HeiGIT · [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

# Khoảng cách giao hàng bằng openrouteservice (ORS)

> Tài liệu lưu lại lần thử ORS. Tính năng hiện tại đã chuyển sang [HERE](HERE_ROUTES.md); không còn gọi ORS.

Phần **Thông tin người nhận** trên form nhập/sửa bill có nút **Ước tính km**.
Điểm xuất phát luôn là **HUB đến** của bill. Kết quả là đường ô tô tham khảo, chưa xét kẹt xe hoặc cấm tải; không tự thay đổi cước phí.

## Cấu hình

Backend dùng hai biến môi trường, không cần tài khoản thanh toán Google:

```dotenv
ORS_ENABLED=true
ORS_API_KEY=khóa-ORS-của-anh
```

Khóa đã được đặt trong `server/.env` local (file được Git bỏ qua). Không đưa khóa vào `VITE_*`, mã nguồn hoặc tài liệu.
Khi deploy Render, đặt hai biến này trong Environment của backend rồi deploy/restart. Cấu hình local không tự đồng bộ lên Render.

Chạy migration `AddOrsApiUsage1830000000000` trước khi bật. `pnpm start:prod` của backend đã chạy migrations trước khi khởi động; local có thể dùng `pnpm migration:run` trong `server/`.

Trong quản lý bưu cục, nhập **Tọa độ GPS** của HUB, dạng `vĩ độ,kinh độ`.
HUB HCM hiện chưa có tọa độ thật; không điền vị trí thử nghiệm thay cho HUB. Các điểm công khai dùng để thử chỉ tồn tại trong công cụ kiểm tra.

## Cách sử dụng

1. Chọn HUB đến và nhập địa chỉ nhận đầy đủ.
2. Nếu đã biết định vị khách, dán vào ô **Tọa độ điểm giao (nếu có)**. Trên Google Maps có thể bấm chuột phải tại điểm giao để lấy cặp tọa độ. Thứ tự trên form là **vĩ độ,kinh độ**.
3. Bấm **Ước tính km**. Dùng địa chỉ tiêu thụ một lượt tìm địa chỉ rồi một lượt tính đường khi tìm được điểm phù hợp; dùng tọa độ chỉ tiêu thụ một lượt tính đường.
4. Kiểm tra dòng **Điểm được tính**. Nếu ORS chỉ khớp gần đúng, đối chiếu điểm giao trước khi báo cước. Nút Google Maps mở đúng tọa độ mà ORS đã dùng.

ORS có thể không tìm được số nhà/hẻm ở Việt Nam. Kết quả chỉ khớp cấp quận/tỉnh hoặc độ tin cậy thấp sẽ bị chặn, không tính km từ tâm quận rồi coi đó là địa chỉ khách. Có thể nhập địa chỉ rõ hơn hoặc dùng tọa độ khách cung cấp.

Xem [kết quả thử thật và đối chiếu Google Maps tại HCM](ORS_TRIAL_RESULTS.md). Có tuyến gần nhau, có tuyến chênh lệch đáng kể; không coi hai nguồn có kết quả tương đương.

Khi đổi bill, HUB, địa chỉ hoặc tọa độ, kết quả cũ bị ẩn. Tọa độ điểm giao và kết quả chỉ dùng trong phiên form hiện tại, không tự ghi vào vận đơn.

## Hạn mức và chống vượt lượt

| Chức năng | Hạn mức kỳ ngày | Hạn mức phút |
|---|---:|---:|
| Directions V2 — tính đường | 2.000 | 40 |
| Geocoding — tìm địa chỉ | 3.000 | 100 |

- Hai thanh đo dùng chung cho nhân viên/replica trong hệ thống; backend lưu bộ đếm PostgreSQL theo dấu băm SHA-256 của khóa. Không lưu API key vào bảng quota.
- Backend giữ lượt bằng SQL nguyên tử trước mỗi lần gửi. Hết hạn mức ngày hoặc phút trả HTTP 429 và không gọi tiếp. Database lỗi thì dừng gọi.
- Tự đồng bộ `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` từ phản hồi thật. Không tăng trần local nếu khóa có gói lớn hơn.
- Chu kỳ ngày dựa vào `x-ratelimit-reset` của ORS; không giả định đặt lại lúc 00:00 giờ Việt Nam. Khi chưa có mốc hợp lệ, dùng cửa sổ dự phòng 24 giờ từ lượt đầu. Giao diện hiển thị giờ đặt lại theo giờ Việt Nam.
- Bộ đếm phút bảo vệ riêng từng API; tôn trọng `Retry-After` khi nhà cung cấp giới hạn. Giao diện tự đọc lại khi đến mốc đặt lại, khi quay lại tab và mỗi phút. Nút làm mới hạn mức chỉ đọc database, không tốn lượt bản đồ.
- Lượt lỗi/timeout vẫn được giữ dự phòng; không tự retry hoặc hoàn lượt. Số đã dùng có thể cao hơn dashboard ORS.
- Nếu hết Geocoding mà Directions còn lượt, vẫn tính được bằng tọa độ.
- Không gọi API khi gõ địa chỉ, mở bill hay xem thanh đo. Các lần bấm tính lại tiêu thụ lượt mới.
- Không dùng chung khóa với ứng dụng khác nếu muốn bộ đếm phút phản ánh toàn bộ nhu cầu. Quota trả về từ nhà cung cấp được cập nhật sau từng phản hồi nhưng hệ thống không theo dõi được các lần gọi ngoài phần mềm theo thời gian thực.

## Địa chỉ API hiện hành

- Tìm địa chỉ: `https://api.heigit.org/pelias/v1/search`
- Tính đường: `https://api.heigit.org/openrouteservice/v2/directions/driving-car/json`

Authorization chỉ gửi từ backend tới HeiGIT. Không đặt key trong query URL hoặc gửi về trình duyệt.
Không gọi API Google; nút đối chiếu chỉ mở Google Maps bằng URL thông thường.

Tham chiếu: [Thông báo đổi URL chính thức](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912), [Geocoder](https://giscience.github.io/openrouteservice/api-reference/endpoints/geocoder/), [Directions](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/).

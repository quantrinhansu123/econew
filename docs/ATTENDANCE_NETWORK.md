# Chấm công bằng mạng văn phòng

ECO hỗ trợ hai cách xác thực cho từng điểm: `gps` (tọa độ và bán kính) hoặc `ip` (mạng văn phòng). Các điểm cũ giữ mặc định GPS.

## Đăng ký hoặc cập nhật IP

1. Quản lý hoặc giám đốc đăng nhập, kết nối Wi-Fi/mạng dây của văn phòng. Tắt VPN nếu VPN đang thay đổi đường truy cập Internet.
2. Mở **Nhân sự → Quản lý điểm chấm công** (`/hr/attendance-admin`).
3. Sửa điểm văn phòng hiện có, chọn **Mạng văn phòng (IP)**.
4. Bấm **Lấy IP mạng hiện tại**, kiểm tra IP rồi **Lưu**. Nút lấy IP chỉ điền vào form; chưa lưu cấu hình.
5. Nhân viên mở `/hr/attendance`, thấy **Mạng hợp lệ**, rồi bấm **Check-in ngay** hoặc **Check-out ngay**. Mạng hợp lệ không cần cấp quyền GPS.

Khi nhà mạng đổi IP public: quản lý kết nối mạng văn phòng, sửa đúng điểm, lấy lại IP và lưu. Nút lấy IP **thay thế** danh sách cũ để không giữ IP động đã được cấp lại cho nơi khác. Nếu dùng nhiều đường Internet, có thể nhập các IP public đã xác nhận, mỗi IP một dòng, tối đa 20 mục.

Điểm chọn IP không chấp nhận tọa độ GPS để thay cho điều kiện mạng. Các điểm GPS khác vẫn hoạt động theo cấu hình của chúng; không giữ thêm một điểm GPS trùng văn phòng nếu chính sách yêu cầu bắt buộc dùng mạng văn phòng.

## IP, IPv6 và giới hạn

- Dùng IP public mà backend nhận từ yêu cầu; không dùng IP nội bộ như `192.168.x.x` của điện thoại, không đọc tên Wi-Fi/SSID.
- Với IPv4 qua NAT, các thiết bị dùng cùng đường Internet thường có chung IP public. IP nội bộ thay đổi không ảnh hưởng.
- IPv6 có thể khác nhau giữa các thiết bị. Cho phép nhập địa chỉ IPv6 chính xác hoặc prefix IPv6 văn phòng `/48` đến `/128` do quản trị mạng xác nhận, ví dụ cú pháp `địa-chỉ-mạng/64`. Hệ thống không tự đoán hay tự mở rộng prefix từ IP của một điện thoại.
- IP xác minh đường mạng, không bảo đảm tuyệt đối sự hiện diện: VPN đi qua văn phòng hoặc nhà mạng CGNAT có thể ảnh hưởng tính xác thực. Cần kiểm tra trên mạng văn phòng thực tế trước khi áp dụng chính sách chỉ dùng IP.
- Không có cơ chế tự cập nhật IP động từ điện thoại nhân viên. Muốn tự cập nhật cần triển khai riêng trên router/máy văn phòng hoặc đăng ký IP public tĩnh.
- Nhật ký lưu IP nguồn, phương thức xác thực và kết quả; ngày công tính theo `Asia/Ho_Chi_Minh`.

## Backend và migration

Chạy migration trước khi dùng frontend mới:

```powershell
cd server
pnpm migration:run
```

Migration `1834000000000-AddAttendanceNetwork.ts` thêm phương thức/IP và cho phép tọa độ rỗng với chấm công IP. Lệnh khởi động production hiện có cũng chạy migration trước khi khởi động API.

Endpoint `GET /api/v1/attendance/network` yêu cầu đăng nhập, trả IP hiện tại, trạng thái public và điểm mạng phù hợp; response không được cache. `POST /api/v1/attendance/check` lấy IP từ request phía server, không nhận trường IP trong JSON. Quyền tạo/sửa mạng chỉ dành cho MANAGER/DIRECTOR.

### Proxy

- Kết nối trực tiếp: mặc định không tin `X-Forwarded-For`.
- Render (`RENDER=true`): tin chuỗi proxy nội bộ và dải Cloudflare đã khai báo trong `server/src/proxy.config.ts`; đọc từ phải sang trái đến địa chỉ không thuộc proxy tin cậy. Không lấy phần tử đầu header một cách vô điều kiện. Cần cập nhật danh sách nếu hạ tầng/dải proxy thay đổi.
- Hạ tầng khác: cấu hình `TRUSTED_PROXY_CIDRS` bằng danh sách địa chỉ/dải proxy thực tế, phân cách dấu phẩy. Danh sách này thay thế mặc định Render; đặt rỗng để không tin proxy. Không dùng `true`, số hop hoặc dải toàn Internet. Proxy cuối phải ghi/append địa chỉ peer thực và chặn đường truy cập bypass proxy.
- Local qua Vite thường chỉ thấy loopback. Nút lấy IP sẽ báo chưa nhận được IP public và không đăng ký loopback làm mạng văn phòng. Không dùng dịch vụ lấy IP bên thứ ba rồi tin IP do frontend gửi lên.
- Frontend production phải gọi trực tiếp backend đúng như `VITE_API_URL`/cấu hình hiện tại; nếu thêm proxy trung gian, cần xác nhận lại chuỗi IP.

Tham khảo: [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/), [Render ingress](https://render.com/articles/how-render-handles-ddos-attacks), [Cloudflare IPv4](https://www.cloudflare.com/ips-v4), [Cloudflare IPv6](https://www.cloudflare.com/ips-v6).

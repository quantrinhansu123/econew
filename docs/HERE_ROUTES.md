# Ước tính khoảng cách giao hàng bằng HERE

Trên form nhập/sửa bill, phần **Thông tin người nhận → Khoảng cách giao hàng** tự ước tính sau khi ngừng nhập địa chỉ **1 giây**.
Địa chỉ được ghép từ **Địa chỉ nhận + Phường/Xã + Quận/Huyện + Tỉnh/Thành**; các ô nhập riêng đều được gửi tới HERE và hiện ở dòng **Địa chỉ tính km**.
Đổi bất kỳ phần địa chỉ hoặc HUB đến sẽ ẩn kết quả cũ và tự tính lại. Một lượt đang chạy được xử lý xong trước khi tính địa chỉ mới nhất; kết quả cũ không ghi đè địa chỉ mới.
Khi dán **tọa độ điểm giao**, chỉ tính khi bấm **Tính lại km**. Đổi địa chỉ/HUB/bill sẽ xóa tọa độ nhập riêng để trở về tự tính theo địa chỉ.
Điểm đi là GPS của **HUB đến** đang chọn, áp dụng cho HAN, HCM và các HUB khác trong Việt Nam.
Kết quả chỉ để tham khảo báo cước, không tự thay đổi tiền bill.

## Hai dịch vụ và hạn mức

| Dịch vụ HERE được gọi | Hạn mức miễn phí theo bảng giá đã đối chiếu | Cách dùng |
|---|---:|---|
| Geocode / Reverse Geocode | 30.000 lượt/tháng | Chỉ gọi Geocode để đổi địa chỉ giao thành tọa độ |
| Routing Car, Bicycle, Pedestrian | 30.000 lượt/tháng | Chỉ gọi Routing với `transportMode=car` |

Không cộng hai hạn mức thành 60.000 bill. Một lần tính từ địa chỉ thường dùng **1 Geocoding + 1 Routing**.
Nhập sẵn tọa độ chỉ dùng **1 Routing**. Địa chỉ không đủ cụ thể bị chặn trước bước Routing.
Không gọi Discover, Autocomplete, Places, Truck, Time Aware Routing, Traffic, bản đồ nền hoặc ORS.

Routing dùng `departureTime=any`, `traffic[mode]=disabled`, `return=summary`, `alternatives=0`.
HERE mặc định có thể tính tuyến theo thời gian hiện tại, nên phải đặt rõ các tham số này để tránh phát sinh nhóm Time Aware Routing có hạn mức khác.
Đây là đường ô tô tham khảo, không bảo đảm phù hợp xe tải/cấm tải hoặc thời điểm giao cụ thể.

## Chặn trước khi gửi

- Hai thanh đo hiển thị **đã dùng / giới hạn lượt tháng**, thời điểm đặt lại và giới hạn gửi của ứng dụng.
- Bộ đếm PostgreSQL `here_api_usage` dùng chung mọi nhân viên và replica nối vào cùng database. Không phụ thuộc API key; đổi key không đặt lại số đã dùng.
- Mỗi yêu cầu phải tăng bộ đếm bằng SQL nguyên tử **trước** khi gửi tới HERE. Hết lượt trả HTTP 429, không gửi tiếp. Database lỗi thì dừng gọi.
- Mặc định trần 30.000 cho từng dịch vụ. Cấu hình có thể hạ trần; giá trị lớn hơn 30.000 vẫn bị ép xuống 30.000.
- Mọi lượt đã gửi đều được giữ dự phòng, kể cả lỗi, timeout, phản hồi không hợp lệ. Không hoàn lượt, không tự retry và không tự chuyển nhà cung cấp.
- Giới hạn nội bộ 60 lượt/phút cho mỗi API; đây là giới hạn ứng dụng đặt thêm, không phải hạn mức miễn phí HERE công bố.
- Kỳ tháng theo UTC. Đặt lại 00:00 UTC ngày 1, tương đương **07:00 ngày 1 giờ Việt Nam**. Ngừng gửi trong phút cuối tháng để hạn chế yêu cầu chạy qua ranh giới kỳ tính phí.
- Địa chỉ đủ cụ thể và HUB đến đã chọn sẽ được tự tính sau 1 giây ngừng nhập, kể cả khi mở bill có sẵn địa chỉ. Gõ liên tục sẽ dời lượt tính đến lần nhập cuối; mỗi lần dừng nhập rồi tính thành công thường dùng 1 Geocoding + 1 Routing.
- Không tự tính khi đang nhập tọa độ, thiếu địa chỉ/HUB, đang lưu form, chưa đọc được hạn mức hoặc đã hết lượt. Làm mới bộ đếm không gửi lại địa chỉ đã thử; lỗi/timeout chỉ thử lại khi bấm **Tính lại km** hoặc đổi địa chỉ/HUB/bill.
- Chống bấm đúp và gọi chồng ở giao diện; backend vẫn bảo vệ tổng lượt khi nhiều người dùng cùng tính.

**Phạm vi bảo đảm:** bộ chặn kiểm soát các yêu cầu do phần mềm này gửi qua backend và database này. Hạn mức miễn phí thực tế phụ thuộc tài khoản/hợp đồng HERE và có thể được dùng bởi app/key khác. Không dùng cùng ngân sách HERE ở ngoài hệ thống; app riêng không tự tạo thêm hạn mức miễn phí. Nếu đã có lượt dùng trước khi bật tính năng, cộng số đó vào cấu hình khởi tạo bên dưới. Không xóa/sửa giảm bộ đếm tháng.

Trang Usage của HERE có thể chậm cập nhật; không dùng số dashboard để hoàn lượt hay ghi đè giảm bộ đếm. Với cách đếm dự phòng, số của phần mềm có thể cao hơn HERE.

## Cấu hình backend

1. Trong HERE Platform → Access Manager → Apps, tạo app riêng và API key.
2. Chỉ lưu key ở `server/.env` local hoặc Environment của backend khi triển khai; không đặt trong `VITE_*`, frontend, tài liệu hay Git.
3. Cấu hình:

```dotenv
HERE_ENABLED=true
HERE_API_KEY=key-cua-app-HERE
HERE_GEOCODING_MONTHLY_LIMIT=30000
HERE_ROUTING_MONTHLY_LIMIT=30000
```

Nếu tài khoản đã dùng API ở ngoài phần mềm trong tháng hiện tại, đặt số đã dùng trước khi bật:

```dotenv
HERE_INITIAL_USAGE_MONTH=2026-10
HERE_GEOCODING_INITIAL_USED=so-luot-geocoding-da-dung
HERE_ROUTING_INITIAL_USED=so-luot-routing-da-dung
```

Khởi tạo chỉ áp dụng đúng tháng đã chỉ định. Số này không được dùng để hạ bộ đếm đã lưu. Trong tháng khác, bộ đếm bắt đầu theo dữ liệu tháng đó.

4. Chạy migration `AddHereApiUsage1832000000000` trước khi bật. `pnpm start:prod` đã chạy migrations trước khi khởi động; local dùng `pnpm migration:run` trong `server/`.
5. Cập nhật GPS HUB thật trong quản lý bưu cục, dạng `vĩ độ,kinh độ`. Khi thiếu GPS hệ thống không gọi API. Các điểm công khai trong phép thử không được lưu thay HUB thật.
6. Chỉ bật sau khi đối chiếu hạn mức của tài khoản và quyền dùng Base Plan cho nghiệp vụ nội bộ của doanh nghiệp. Bảng giá công khai là giá tham khảo, không thay thế thỏa thuận với HERE.

Endpoint ứng dụng giữ nguyên `GET /api/v1/delivery-distance/usage` và `POST /api/v1/delivery-distance/estimate`.
Các biến `ORS_*` và `GOOGLE_ROUTES_*` không được tính năng hiện tại sử dụng.

## GPS HUB HCM

Ngày 18/10/2026 đã cập nhật **HCM — Bưu cục Hồ Chí Minh** theo định vị được cung cấp:

```text
10.8793976,106.6563272
```

Tọa độ được lưu trong dữ liệu HUB ở cả `coordinates`, `latitude` và `longitude`; API production đã đọc lại đúng giá trị.
Không cố định HUB HCM trong logic tính đường. Khi nhập bill, hệ thống lấy GPS của **HUB đến** đang chọn làm điểm xuất phát và địa chỉ người nhận làm điểm giao.
Các HUB khác cần bổ sung GPS riêng trong quản lý bưu cục trước khi tính khoảng cách.

## Triển khai lên Render và Vercel

Luồng production đang sử dụng: **`econew-six.vercel.app` → `econew-sg.onrender.com/api/v1`**.
Trên Render, chọn service backend **`econew-sg`** → **Environment** → **Add Environment Variable** và thêm đủ bốn biến trong phần cấu hình backend ở trên.
Lấy giá trị `HERE_API_KEY` từ `server/.env` trên máy đã cấu hình; file này được bỏ qua bởi Git nên key không tự chuyển lên Render khi push.
Không chép toàn bộ `.env` local lên production vì có các cấu hình database, cổng và CORS riêng.

Chọn **Save, rebuild, and deploy** để dùng mã mới cùng các biến mới. Lệnh khởi động trong `server/render.yaml` đã tự chạy migration trước khi bật API.
Nếu local và Render dùng cùng database, bộ đếm lượt thử đã nằm trong database; không cần khởi tạo lại hoặc xóa bộ đếm.

Trên Vercel không cần thêm biến HERE. Frontend đang dùng `VITE_API_URL=https://econew-sg.onrender.com/api/v1`; giữ cấu hình này và dùng bản deploy chứa commit mới.
Sau khi cả hai bản deploy hoàn tất, mở form nhập bill và kiểm tra hai thanh hạn mức. Khi HUB chưa có GPS thật, chức năng tính km sẽ báo thiếu GPS và không gọi HERE.

Kiểm tra đúng backend bằng lệnh sau trong `server/`, thay `SHA_DA_DEPLOY` bằng commit của đợt phát hành:

```powershell
pnpm deploy:verify SHA_DA_DEPLOY https://econew-sg.onrender.com/api/v1/health
```

Không dùng kết quả kiểm tra ở `econew.onrender.com` để kết luận tính năng đã hoạt động trên trang Vercel này.

## Kiểm thử tự ước tính

Trong `client/`, chạy `pnpm exec vite --host 127.0.0.1 --port 6061 --strictPort`, rồi dùng terminal khác:

```powershell
pnpm exec node scripts/check-delivery-distance.mjs
```

Script mở form nhập bill thật bằng Playwright và chặn toàn bộ API bằng dữ liệu giả; không dùng tài khoản thật, không gọi HERE, không dùng lượt hay lưu bill.
Kiểm tra nhập liên tục, từng ô địa chỉ, đổi HUB, nhập GPS thủ công, kết quả đến muộn, lỗi không tự retry, hạn mức và layout mobile/desktop.
Nếu Vite chạy ở cổng khác, đặt `DISTANCE_TEST_ORIGIN` theo URL local đó. Trên PowerShell chặn `pnpm.ps1`, dùng `pnpm.cmd` cho các lệnh trên.

## Kiểm tra địa chỉ

HERE Geocoding được giới hạn `countryCode:VNM`, ưu tiên quanh HUB nhưng không ép điểm giao vào cùng tỉnh với HUB.
Ưu tiên tọa độ `access` (điểm tiếp cận) thay cho tâm tòa nhà. Chỉ chấp nhận kết quả cấp số nhà/địa điểm có điểm khớp đủ cao.
Kết quả chỉ tới đường/quận/tỉnh hoặc có nhiều điểm gần giống nhau bị chặn. Tọa độ và số khớp vẫn cần đối chiếu trước khi báo cước.
Tuyến có cảnh báo `critical` không được trình bày như tuyến bình thường.

Đổi bill, HUB, địa chỉ hoặc tọa độ sẽ ẩn kết quả cũ. Tọa độ và kết quả đang dùng cho phiên form; không lưu lâu dài dữ liệu HERE vào hồ sơ khách hàng/bill.
Giao diện ghi nguồn HERE và có link Google Maps mở đúng tọa độ đã tính để kiểm tra thủ công; không gọi Google API.

## Thử thật ngày 18/10/2026

4 địa chỉ công khai tại HCM/Hà Nội đều được tìm thấy và tính đường. Tổng thời gian đo trên máy triển khai local, gồm backend/database và hai API: **424–1.201 ms**.
Đây là mẫu nhỏ, không phải cam kết tốc độ hoặc chứng minh đúng ngoài thực địa; chưa thay thế thử tuyến từ GPS HUB thật.

| Vùng | Địa chỉ thử | Km từ điểm công khai thử | Tổng thời gian |
|---|---|---:|---:|
| HCM | 2 Công xã Paris, Quận 1 | 0,910 | 1.201 ms |
| HCM | 135 Nam Kỳ Khởi Nghĩa, Quận 1 | 0,711 | 425 ms |
| HAN | 1 Tràng Tiền, Hoàn Kiếm | 0,649 | 450 ms |
| HAN | 58 Quốc Tử Giám, Đống Đa | 2,287 | 424 ms |

### Thử từ GPS HUB HCM đã lưu

| Điểm giao | Khoảng cách ô tô HERE từ HUB HCM |
|---|---:|
| 2 Công xã Paris, Quận 1, TP.HCM | 16,273 km |
| 135 Nam Kỳ Khởi Nghĩa, Quận 1, TP.HCM | 15,502 km |

Hai tuyến được thử với dữ liệu HUB thật trong database; xác nhận yêu cầu Routing và link kiểm tra đều dùng đúng `10.8793976,106.6563272` làm điểm đi.
Gọi thêm endpoint tính khoảng cách trên production với địa chỉ 2 Công xã Paris trả HTTP 200, cùng kết quả 16,273 km, tổng khoảng 2.964 ms.
Sau các phép thử này bộ đếm tháng ghi nhận 7 Geocoding và 7 Routing; không hoàn lại lượt thử.
Các kết quả là ước tính HERE, chưa đối chiếu tuyến đi ngoài thực địa hoặc chứng minh bằng số km Google Maps.

### Xác minh đúng luồng Vercel → econew-sg

Sau khi bổ sung biến HERE và deploy lại `econew-sg`, backend chạy commit `1aed14b` và endpoint hạn mức trả HTTP 200 cho tài khoản có quyền nhập bill.
Đã thử trực tiếp form `econew-six.vercel.app/orders/new`: chọn HUB đến HCM, nhập 2 Công xã Paris / Hồ Chí Minh / Quận 1 rồi bấm **Ước tính km**.
Trình duyệt gọi đúng `econew-sg`, hiển thị đủ hai thanh hạn mức và kết quả **16,273 km**. Một lần bấm gửi một yêu cầu tính khoảng cách; không tạo bill.
Kiểm tra desktop và mobile 390px không có lỗi JavaScript hoặc tràn ngang. Sau lượt thử này bộ đếm tháng là 8 Geocoding và 8 Routing.

## Nguồn

- [HERE Geocoding API](https://docs.here.com/geocoding-and-search/reference/get_geocode)
- [HERE Routing: car routing và nhóm giao dịch](https://docs.here.com/routing/docs/routing-v8-car-routing)
- [HERE Routing: time-dependent routing](https://docs.here.com/routing/docs/routing-v8-time-dependent-routing)
- [HERE Routing: summary](https://docs.here.com/routing/docs/routing-v8-route-summary)
- [HERE Cost Management: UTC và độ trễ số liệu](https://docs.here.com/usage/docs/cost-management-tutorials)
- [Bảng giá HERE](https://www.here.com/get-started/pricing)
- [Giới hạn sử dụng Base Plan](https://www.here.com/get-started/pricing/base-plan-restrictions)

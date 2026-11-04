# HIBI BOOTH – BẢN EMAIL + GOOGLE CALENDAR (04/11/2026)

**Bắt đầu tại** `docs/EMAIL_GOOGLE_CALENDAR.md` để xem cách thiết lập và thử nghiệm.

Thêm email xác nhận khi trả tiền, email nhắc lịch trước giờ chụp 60 phút (Resend API), và nút Google Calendar (khách tự lưu). Email chưa tự gửi nếu `EMAIL_PROVIDER=disabled`. Trên database cũ, sao lưu trước rồi chạy `npm run db:init` để cập nhật schema. Không xóa Docker volume / không chạy `db:seed` nếu muốn giữ dữ liệu.

---

# HIBI BOOTH – BẢN CẬP NHẬT NGHIỆP VỤ VÀ SMS (04/11/2026)

**BẮT ĐẦU Ở:** `docs/HUONG_DAN_BAN_CAP_NHAT.md`. Bản này sửa tên chứa số, mã đơn mới, đặt trước >=30 phút, check-in +20 phút và dùng QR một lần, SMS reminder queue, slogan/logo/ảnh. **Chưa kết nối payOS hoặc nhà cung cấp SMS thật mặc định.**

Trước khi chạy trên cơ sở dữ liệu cũ, sao lưu DB, dùng lại container `hibi-booth-db`, sao chép `.env`, chạy `npm install` và **`npm run db:init`** để tạo bảng mới. Không chạy lại `db:seed` nếu muốn giữ mật khẩu/tài khoản hiện tại.

---

# HIBI BOOTH — BẢN SỬA KIỂM TRA 04-11-2026

Bản này đã khôi phục CSS, ảnh và cập nhật các quy tắc đặt phòng. **Không kết nối ngân hàng thật**. Chỉ dùng QR mô phỏng và thanh toán giả lập ở localhost. Không đem dữ liệu demo lên Internet.

## Chạy trên Windows
1. Giải nén vào thư mục mới, KHÔNG ghi đè folder cũ trước khi lưu bản sao.
2. Mở Docker Desktop, bật Engine.
3. `Copy-Item server\.env.example server\.env` (PowerShell) hoặc `copy server\.env.example server\.env` (CMD).
4. Đổi `JWT_SECRET` trong file `.env`, giữ `ENABLE_DEMO_PAYMENT=true` nếu chỉ kiểm thử local.
5. `docker compose up -d postgres`.
6. `npm install` rồi `npm run dev`.
7. Nếu database đã được khởi tạo ở bản cũ, **không cần chạy lại db:init/db:seed**. Nếu mới cài lần đầu, chạy `npm run db:init` và `npm run db:seed`.
8. Truy cập http://localhost:5173.

## Đã sửa
- CSS gốc và bảng màu HIBI, ảnh thật ở `client/public/images/` (giữ hiệu ứng Polaroid chồng nhau).
- Nhãn HIBI BOOTH, font thống nhất.
- Hiển thị giờ 09:00–22:00 theo bước 30 phút; kết thúc lượt chụp cuối lúc 23:00.
- Chặn đặt trùng lịch **chồng lấn 60 phút** ở Backend và API xem giờ trống.
- Kiểm tra số điện thoại VN ở Frontend và Backend, bắt buộc tên >=2 ký tự.
- Đồng hồ đếm ngược cập nhật mỗi giây; khôi phục trang thanh toán sau khi reload trong cùng tab.
- Bản chủ quán có trang danh sách đơn riêng, không chuyển sang khu vực nhân viên.
- Không hiển thị tài khoản demo trên màn hình đăng nhập.
- Giữ hoàn tiền chờ phê duyệt, không có API nhân viên tự nhận đã hoàn tiền.

## Giới hạn
- QR và xác nhận thanh toán vẫn mô phỏng. payOS Webhook thật chưa được tích hợp.
- Phiên đăng nhập hiện dùng JWT trong localStorage để demo, chưa thích hợp triển khai công khai. Trước production cần cookie HttpOnly, kiểm tra CSRF, rate limits, HTTPS và chính sách xử lý dữ liệu cá nhân.
- Các tài khoản demo trong `server/src/seed.js` chỉ nên dùng tại máy local. Không commit `server/.env`.
- Docker PostgreSQL giữ dữ liệu trong named volume, đừng chạy `docker compose down -v` nếu muốn giữ đơn hiện có.
- Backend chặn trùng lịch với khóa phòng trong transaction; cần kiểm thử thực tế với PostgreSQL.

# HIBI BOOTH – DEMO HOÀN CHỈNH, SẴN SÀNG TỰ NỐI payOS

**Cảnh báo:** Toàn bộ thanh toán trong gói này là **MÔ PHỎNG**, không phải giao dịch ngân hàng thật. QR demo có chuỗi `HIBI-DEMO-ONLY`. Chưa có kết nối payOS thực.

**Khởi động trên Windows:** giải nén, cài Node.js + Docker Desktop, copy `server/.env.example` thành `server/.env`, đổi `JWT_SECRET` ngẫu nhiên; mở terminal ở thư mục dự án và chạy:

```powershell
docker compose up -d postgres
npm install
npm run db:init
npm run db:seed
npm run dev
```

Website: http://localhost:5173 | API: http://localhost:4000/api/health

Xem `docs/PAYOS_INTEGRATION.md` để biết CHÍNH XÁC chỗ nối payOS, Webhook, xử lý tiền về trễ và hoàn tiền.

**Luồng demo:** Chọn phòng → đặt lịch → tạo đơn giữ 20 phút → trang QR DEMO → nhấn nút mô phỏng callback payOS → đơn được xác nhận → nhận QR check-in; nhân viên có thể quét QR, gửi yêu cầu hoàn tiền; chủ quán phê duyệt/từ chối, nhưng không có tiền thật được chuyển.

**Lưu ý cơ sở dữ liệu:** Nếu đã từng tạo database với bản Full-stack cũ, cấu trúc cột `booking_code` đã thay đổi từ VARCHAR(24) thành VARCHAR(32). Cài mới là cách đơn giản nhất để chạy demo. Nếu cần giữ dữ liệu, chạy migration có kiểm tra, KHÔNG xóa volume đang có dữ liệu quan trọng.

**Tài khoản local:** staff@hibibooth.local / StaffDemo#2026; owner@hibibooth.local / OwnerDemo#2026. KHÔNG dùng công khai.

---

# Hibi Booth — website photobooth full-stack

Đây là **một dự án website có nhiều trang và nhiều vai trò**, không phải bộ ảnh màn hình rời. Dự án gồm:

- `client/`: giao diện React + TypeScript, chuyển trang bằng React Router.
- `server/`: API Node.js + Express, xác thực và phân quyền ở phía máy chủ.
- `server/sql/schema.sql`: cấu trúc cơ sở dữ liệu PostgreSQL.
- `docker-compose.yml`: chạy PostgreSQL local bằng Docker.

## 1. Các vai trò và màn hình

| Vai trò | Đường dẫn | Quyền chính |
|---|---|---|
| Khách hàng (không cần tài khoản) | `/` | Xem trang chủ, thông tin gói chụp |
| Khách hàng | `/dat-lich` | Chọn phòng, ngày, giờ, gói chụp; nhập thông tin; tạo lượt giữ chỗ |
| Khách hàng | `/tra-cuu` | Nhập mã đặt phòng và số điện thoại đã đăng ký để xem trạng thái/lịch/QR; số điện thoại trả về được che một phần |
| Nhân viên | `/dang-nhap` → `/nhan-vien` | Đăng nhập, xem dashboard, quản lý tất cả đơn |
| Nhân viên | `/nhan-vien/don-dat` | Tìm kiếm, lọc, hủy đơn theo điều kiện, tạo yêu cầu hoàn tiền |
| Nhân viên | `/nhan-vien/check-in` | Quét QR tự động check-in; nhập mã thủ công rồi xác nhận; mã chỉ dùng một lần |
| Nhân viên | `/nhan-vien/hoan-tien` | Theo dõi yêu cầu hoàn tiền đã gửi |
| Chủ quán | `/chu-quan` | Dashboard, xem số liệu tổng quan |
| Chủ quán | `/chu-quan/nhan-vien` | Tạo, khóa/mở tài khoản nhân viên |
| Chủ quán | `/chu-quan/hoan-tien` | Phê duyệt hoặc từ chối yêu cầu hoàn tiền |
| Chủ quán | `/chu-quan/nhat-ky` | Xem nhật ký các thao tác quan trọng |

Khách hàng không có trang tài khoản, không xem được danh sách đơn chung. Quyền được kiểm tra ở cả giao diện và API; không chỉ ẩn nút trên trình duyệt.

## 2. Công nghệ

- React + TypeScript + Vite: xây dựng giao diện và các màn hình.
- React Router: ánh xạ URL sang trang và layout theo vai trò.
- Node.js + Express: cung cấp API nghiệp vụ.
- PostgreSQL: lưu phòng, gói chụp, đơn đặt, tài khoản, yêu cầu hoàn tiền và nhật ký.
- `html5-qrcode`: đọc QR từ camera của thiết bị nhân viên.
- `qrcode.react`: hiển thị QR từ mã đặt phòng.

## 3. Chuẩn bị trên Windows

Cài Node.js phiên bản LTS phù hợp với Vite và Docker Desktop. Có thể kiểm tra phiên bản sau cài đặt:

```bash
node -v
npm -v
```

Vite hiện yêu cầu Node.js từ `20.19+` hoặc `22.12+`. Node 22.16 cũng đáp ứng điều kiện này. Nếu đang cài mới, nên chọn một bản Node LTS được hỗ trợ. Tham khảo trang chính thức tại phần tài liệu cuối README.

### Bước 1 — Mở terminal tại thư mục dự án

Giải nén ZIP, mở thư mục `hibi-booth-fullstack`, sau đó mở PowerShell hoặc Terminal tại đó.

### Bước 2 — Tạo file cấu hình môi trường

PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

Mở `server/.env`, đổi `JWT_SECRET` thành chuỗi bí mật dài, ngẫu nhiên. Giữ `ENABLE_DEMO_PAYMENT=true` chỉ khi thử nghiệm local.

### Bước 3 — Khởi động PostgreSQL

Nếu đã cài Docker Desktop và Docker Engine đang chạy:

```bash
docker compose up -d postgres
```

### Bước 4 — Cài thư viện

```bash
npm install
```

### Bước 5 — Tạo bảng và dữ liệu mẫu

```bash
npm run db:init
npm run db:seed
```

### Bước 6 — Chạy toàn bộ website

```bash
npm run dev
```

Mở website tại `http://localhost:5173`. API chạy tại `http://localhost:4000/api`.

Nếu máy không dùng Docker, có thể cài PostgreSQL riêng rồi sửa `DATABASE_URL` trong `server/.env` cho khớp tên database, tài khoản và mật khẩu local.

## 4. Tài khoản demo local

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Nhân viên | `staff@hibibooth.local` | `StaffDemo#2026` |
| Chủ quán | `owner@hibibooth.local` | `OwnerDemo#2026` |

Tài khoản được tạo bởi `server/src/seed.js`. Đây là tài khoản thử nghiệm; hãy đổi hoặc xóa trước khi triển khai thật.

## 5. Luồng kiểm thử đầu-cuối

1. Mở `/dat-lich`, chọn phòng, ngày, giờ, gói chụp và nhập tên/số điện thoại.
2. Hệ thống kiểm tra lịch và tạo mã `HB-...`, giữ chỗ 20 phút.
3. Bấm nút thanh toán demo. Đây chỉ là trạng thái thử nghiệm, không chuyển tiền thật.
4. Mở `/tra-cuu`, nhập mã vừa tạo để xem trạng thái và mã QR.
5. Đăng nhập bằng tài khoản nhân viên. Vào `/nhan-vien/check-in`, bật camera hoặc nhập mã QR, kiểm tra mã và xác nhận check-in.
6. Vào `/nhan-vien/don-dat`, tạo yêu cầu hoàn tiền cho đơn đã thanh toán.
7. Đăng xuất, đăng nhập tài khoản chủ quán, mở `/chu-quan/hoan-tien` để duyệt hoặc từ chối.
8. Đăng nhập lại nhân viên, mở `/nhan-vien/hoan-tien`, chọn “Xác nhận đã hoàn tiền” sau khi đã thực hiện giao dịch thực tế bên ngoài.
9. Mở `/chu-quan/nhat-ky` để xem nhật ký các thao tác.

## 6. Cấu trúc code nên học theo thứ tự

1. `client/src/App.tsx`: xem danh sách URL và cách nối mỗi URL với một màn hình.
2. `client/src/components/Layout.tsx`: xem layout khách hàng, nhân viên và chủ quán.
3. `client/src/components/ProtectedRoute.tsx`: xem chặn trang theo vai trò ở giao diện.
4. `client/src/pages/PublicPages.tsx`: xem đặt lịch và tra cứu của khách.
5. `client/src/pages/StaffPages.tsx`: xem quản lý đơn, quét QR, check-in và yêu cầu hoàn tiền.
6. `client/src/pages/OwnerPages.tsx`: xem quản lý nhân viên, phê duyệt hoàn tiền và nhật ký.
7. `client/src/lib/api.ts`: xem cách frontend gọi API.
8. `server/src/server.js`: xem các API; đây là nơi phải xác thực và kiểm tra quyền thật.
9. `server/sql/schema.sql`: xem các bảng, khóa chính, khóa ngoại và trạng thái nghiệp vụ.

### Ví dụ: từ nút đặt lịch đến database

- `BookingPage` trong `PublicPages.tsx` thu thập dữ liệu form.
- Hàm `post('/bookings', data)` gọi API trong `api.ts`.
- `POST /api/bookings` trong `server.js` kiểm tra dữ liệu, khóa dòng phòng trong transaction, kiểm tra xung đột lịch và ghi đơn.
- PostgreSQL lưu đơn và trả về mã đặt phòng.
- Giao diện hiển thị QR từ mã đó.

Đây là một website full-stack: các màn hình dùng chung API và database, không phải các trang HTML độc lập.

## 7. Ánh xạ sơ đồ BPMN TO-BE sang chức năng

| Hoạt động trong BPMN | Màn hình/API tương ứng |
|---|---|
| Khách chọn “Đặt lịch”, chọn phòng và thời gian | `/dat-lich` + `GET /api/catalog`, `GET /api/availability` |
| Kiểm tra tính hợp lệ, phòng trống, giữ chỗ | `POST /api/bookings` + transaction PostgreSQL |
| Hiển thị thông tin thanh toán, nhận thông báo thanh toán | Trang xác nhận đơn; hiện chỉ có API thanh toán demo |
| Cập nhật trạng thái Đã đặt phòng | Demo endpoint; khi thật phải thay bằng xác thực webhook cổng thanh toán |
| Quá 20 phút | Cột `hold_expires_at`; API kiểm tra và chuyển đơn hết hạn khi truy vấn/đặt lịch tiếp theo |
| Khách chọn “Tra cứu”, nhập mã | `/tra-cuu` + `GET /api/bookings/lookup/:code` |
| Nhân viên quét QR/nhập mã | `/nhan-vien/check-in` + `POST /api/staff/check-in/:code` |
| Nhân viên phê duyệt/thực hiện hoàn tiền theo BPMN | Nhân viên gửi yêu cầu → chủ quán duyệt → nhân viên xác nhận đã thực hiện; kết nối cổng thanh toán thật là bước triển khai tiếp theo |
| Chủ quán quản lý nhân viên | `/chu-quan/nhan-vien` + `/api/owner/staff` |

## 8. Những phần còn là demo — cần hoàn thiện trước khi mở cho khách thật

- **Thanh toán:** nút demo chỉ đổi trạng thái trên database. Cần tích hợp nhà cung cấp thanh toán thật, xác thực chữ ký webhook và đối soát mã giao dịch. Không nhận số thẻ hoặc OTP trực tiếp trong website.
- **Hoàn tiền:** chủ quán duyệt yêu cầu, nhưng chưa có API chuyển tiền thật. Cần kết nối API hoàn tiền của nhà cung cấp và xử lý callback.
- **Đăng nhập:** ví dụ hiện lưu JWT trong localStorage để dễ học. Khi triển khai công khai nên chuyển sang cookie `HttpOnly`, `Secure`, `SameSite`, bổ sung CSRF protection, chính sách mật khẩu và khôi phục tài khoản.
- **Tra cứu:** mã theo thứ tự trong ngày; vì dễ đoán, tra cứu yêu cầu thêm đúng số điện thoại đã đặt, kèm giới hạn số lần tra cứu.
- **Nhắc lịch/email:** đã tạo lịch SMS và worker, nhưng chưa gửi thật nếu chưa cấu hình dịch vụ SMS hợp lệ và Sender ID/mẫu tin theo yêu cầu nhà mạng.
- **Hết hạn giữ chỗ:** API đánh dấu các hold hết hạn khi có truy vấn; vận hành thật nên có job nền để tự động cập nhật và gửi thông báo đúng giờ.
- **Camera:** cần HTTPS hoặc localhost, camera được cấp quyền và thiết bị có camera. Có thể vẫn nhập mã thủ công nếu không quét được.
- **Triển khai:** cần domain, HTTPS, hosting cho frontend/backend, PostgreSQL được backup, log giám sát, chính sách riêng tư và bảo vệ dữ liệu cá nhân.

Không dùng các tài khoản demo, mật khẩu mẫu hoặc cấu hình demo cho môi trường công khai.

Đọc thêm hướng dẫn từng bước trong `docs/HUONG_DAN_CODE_TUNG_MAN_HINH.md`.

## 9. Tài liệu chính thức

- Vite: https://vite.dev/guide/
- React Router: https://reactrouter.com/start/declarative/routing
- Express: https://expressjs.com/
- PostgreSQL: https://www.postgresql.org/docs/
- html5-qrcode: https://www.npmjs.com/package/html5-qrcode
- MDN getUserMedia (điều kiện camera): https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

---

## Cập nhật gần nhất: Trang chủ và màu phòng (04/11/2026)

- Rút gọn trang chủ, bỏ khối đặt lịch lặp ở cuối và nút đặt lịch lặp ở băng slogan.
- Trang chọn phòng hiển thị 4 mẫu màu phông có thể nhấp chọn trực tiếp (đỏ, đen, trắng, xám).
- Hệ thống **có lưu lịch nhắc SMS sau khi đơn đã thanh toán**, nhưng **mặc định chưa gửi SMS thật** (`SMS_PROVIDER=disabled`).
- Không có thay đổi database. Hướng dẫn chi tiết: `docs/CAP_NHAT_TRANG_CHU_MAU_PHONG_NHAC_LICH.md`.

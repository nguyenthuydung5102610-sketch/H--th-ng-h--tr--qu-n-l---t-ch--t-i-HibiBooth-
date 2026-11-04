# HIBI BOOTH – Email tự động và Google Calendar (04/11/2026)

## Đã lập trình

- **Form đặt lịch**: khách điền họ tên, số điện thoại và **email bắt buộc**. API kiểm tra email phía máy chủ; email chỉ dùng cho thông báo giao dịch, không hiển thị trong API tra cứu công khai.
- **Xác nhận thanh toán**: cả Webhook payOS, đối soát payOS và thanh toán demo đều gọi `scheduleBookingEmails(client, bookingId)` bên trong giao dịch PostgreSQL sau khi đơn chuyển `CONFIRMED/PAID`.
- **Hàng đợi**: bảng `email_notifications` có khóa `UNIQUE(booking_id,kind)` tránh tạo trùng. Hai loại: `CONFIRMATION` gửi ngay; `REMINDER` gửi trước giờ chụp 60 phút. Nếu thời gian chụp còn chưa tới 60 phút thì lịch nhắc đến hạn ngay sau khi thanh toán được xác minh, do không thể gửi ngược thời gian.
- **Email worker**: chạy khi backend đang hoạt động, kiểm tra hàng đợi mỗi 20 giây; gửi qua REST API Resend khi được bật; có retry tối đa 5 lần, tránh gửi nhắc cho đơn không còn hợp lệ, lưu trạng thái và mã ID do provider trả về.
- **Tránh gửi trùng**: dùng `Idempotency-Key` riêng cho từng loại email/đơn; Resend hiện hỗ trợ chống gửi lặp trong khoảng thời gian 24 giờ. Trạng thái `SUBMITTED` **chỉ có nghĩa nhà cung cấp đã chấp nhận gửi**, không đảm bảo thư vào inbox.
- **Google Calendar**: sau thanh toán thành công, có nút “Thêm vào Google Calendar” trên màn hình thành công và trang Tra cứu đơn. Nút mở sự kiện đã điền sẵn giờ Việt Nam, phòng và mã đặt chỗ. Khách phải **tự bấm Lưu** trong Google Calendar; không truy cập tài khoản Google của khách, không cần API key của Google.
- **SMS**: mã SMS và bảng cũ được giữ để tương thích database, nhưng đường chạy mới không lập lịch SMS và không khởi động SMS worker.

## Cấu hình gửi email thật (server/.env)

1. Tạo tài khoản với nhà cung cấp Resend (https://resend.com), xác minh tên miền email gửi và tạo API key theo chính sách của nhà cung cấp. Nếu không có tên miền đã xác minh, dịch vụ có thể giới hạn người nhận thử nghiệm.
2. Trong file `server/.env` trên máy của bạn, thêm:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=your_secret_resend_key
EMAIL_FROM=HIBI BOOTH <booking@your-verified-domain.example>
```

3. Không đăng API key công khai; không chèn vào `client/.env`. Khởi động lại Backend để áp dụng.
4. Bảo đảm `server/.env` vẫn có cấu hình PostgreSQL/payOS hiện tại. Không cần cài SDK Resend vì Backend dùng `fetch` tích hợp sẵn trong Node.js LTS.
5. Kiểm tra API nhật ký gửi thư chỉ dành cho chủ quán: `GET /api/owner/email-notifications` (yêu cầu token OWNER). Trạng thái `PENDING`, `SUBMITTED`, `FAILED`, `SKIPPED`; dữ liệu trả về không bao gồm email nhận.

Nếu chưa đăng ký dịch vụ email, để `EMAIL_PROVIDER=disabled`. Hệ thống **vẫn tạo hàng đợi nhưng sẽ không gửi email thật**. Khi vừa bật dịch vụ, các thư đang chờ có thể được xử lý; thư nhắc của lịch đã qua sẽ bị bỏ qua.

## Lệnh chạy trên Windows (CMD), không xóa dữ liệu cũ

```cmd
npm install
npm run db:init
npm run test:rules
npm run dev
```

**Bắt buộc chạy `npm run db:init` đúng một lần sau khi chuyển sang phiên bản này** để thêm cột `customer_email` và bảng `email_notifications`. Mã SQL dùng `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`, không xóa đơn trước đó. Nên sao lưu PostgreSQL trước khi thay đổi schema; **không chạy `db:seed` hoặc `docker compose down -v`** khi muốn giữ dữ liệu.

## Test demo không cần gửi email thật

1. Để `EMAIL_PROVIDER=disabled`, tạo đơn mới với email hợp lệ.
2. Ở chế độ DEMO_ONLY local, xác nhận thanh toán mô phỏng. Ở chế độ PAYOS, chỉ xác nhận sau kết quả thanh toán được xác minh.
3. Xem dấu tích đặt phòng thành công và nút Google Calendar; nhấp vào nút để thấy thời gian chụp và giờ kết thúc +60 phút.
4. Với cấu hình Resend thật được quản trị viên chấp thuận, làm một lượt đặt lịch test; kiểm tra email xác nhận trong inbox/spam và trạng thái `SUBMITTED` trong API chủ quán. Để kiểm tra nhắc giờ, sử dụng lịch chụp sau ít nhất 60 phút và để Backend chạy liên tục.
5. Kiểm tra nhập email sai định dạng, hủy đơn, Webhook trùng và email retry; không suy luận đã gửi thư từ mỗi trạng thái đơn PAID.

## Điểm cần nêu khi vấn đáp

“Sau khi thanh toán được xác minh, hệ thống tạo hai công việc gửi email trong transaction cơ sở dữ liệu. Background worker kiểm tra các công việc đến hạn và gọi REST API của Resend; mã giao dịch/thông báo được lưu để kiểm tra và chống gửi trùng. Tính năng Google Calendar mở liên kết sự kiện điền sẵn; khách phải tự lưu sự kiện. Không truy cập tài khoản Google của khách. Website vẫn hoạt động khi chưa có khóa email nhưng không tự gửi thư thật.”

## Giới hạn trước khi triển khai công khai

- Server cần chạy liên tục (hoặc tách worker riêng). Worker dùng `setInterval` không hoạt động khi máy chủ tắt hoặc dịch vụ serverless ngủ.
- Cần một địa chỉ gửi email từ tên miền đã xác minh, kiểm soát giới hạn API, bảo mật email/số điện thoại theo chính sách riêng tư.
- Thư đã được nhà cung cấp chấp nhận chưa chắc đến inbox; nếu cần mức độ chính xác cao hơn, cấu hình thêm webhook delivery/bounce.
- API booking đã có giới hạn 20 lần/15 phút/IP, nhưng cần thêm kiểm soát spam trước khi website mở công khai.

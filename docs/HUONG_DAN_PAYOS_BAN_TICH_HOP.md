# HIBI BOOTH — Hướng dẫn bản tích hợp payOS (cần kiểm thử)

## Những gì đã sửa
- Backend: SDK @payos/node, API `POST /api/payments/bookings/:code/create`, Webhook `POST /api/payos/webhook`, và API đọc trạng thái `GET /api/payments/bookings/:code`.
- Database: bảng `payos_payment_requests` giữ một mã `order_code` duy nhất cho mỗi đơn, dùng lại bảng `payment_events` để tránh xử lý sự kiện trùng.
- Frontend: QR payOS và liên kết checkout thay cho QR mô phỏng khi có cấu hình payOS. Tự kiểm tra trạng thái đơn mỗi 4 giây; chỉ xác nhận thành công khi Backend cập nhật sau Webhook hợp lệ.
- Đơn thanh toán sau khi hết hạn giữ chỗ được ghi nhận cần đối soát, không tự cấp phòng.

## Cài đặt trên Windows
1. **Sao lưu toàn bộ dự án và database**. Giải nén bản này vào thư mục mới. **Không xóa Docker volume cũ**.
2. Sao chép `server/.env` hiện tại (có khóa thật) từ bản cũ sang `server/.env` của bản mới. Không gửi file này cho người khác.
3. Kiểm tra `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` trong `.env`. Đặt `ENABLE_DEMO_PAYMENT=false`.
4. Mở Docker Desktop. Tại thư mục gốc dự án chạy `docker compose up -d postgres` (nếu container cũ đã chạy thì không tạo thêm container trùng tên).
5. Chạy `npm install`.
6. Chạy `npm run db:init` để tạo bảng payOS mới bằng `CREATE TABLE IF NOT EXISTS`. **Không chạy `npm run db:seed`** nếu muốn giữ tài khoản và dữ liệu.
7. Chạy `npm run dev` và mở `http://localhost:5173`.
8. Kiểm tra `http://localhost:4000/api/health`: `paymentMode` phải là `PAYOS`.

## Bước bắt buộc để Webhook hoạt động
- Backend `localhost:4000` không thể nhận Webhook từ Internet. Cần một URL HTTPS công khai chuyển tiếp đến Backend, ví dụ qua dịch vụ tunnel HTTPS được phép hoặc deploy Backend.
- Trong quản trị payOS, đăng ký URL Webhook `https://<backend-public-host>/api/payos/webhook` và thực hiện bước xác minh Webhook theo hướng dẫn payOS.
- `PUBLIC_BASE_URL` trong `server/.env` là địa chỉ frontend mà khách truy cập (ví dụ https://hibi.example). Trên local có thể là `http://localhost:5173` khi kiểm thử riêng, nhưng người khác không mở được localhost của bạn.
- Chỉ kiểm thử giao dịch thật với tài khoản và sự cho phép phù hợp; không dùng dữ liệu ngân hàng thật trong ảnh chụp/log.

## Những giới hạn chưa được xác nhận
- Không thể thử kết nối tài khoản payOS thật trong môi trường này vì không có khóa và không có endpoint Webhook HTTPS của bạn.
- Chưa chạy được build toàn bộ ở môi trường này vì npm cache thiếu dependency; bạn cần chạy `npm install` và `npm run build` trên máy mình để kiểm chứng.
- Cần kiểm tra thực tế SDK `@payos/node` phiên bản được cài, cấu hình kênh thanh toán, xác minh Webhook, và trạng thái thanh toán trước khi mở công khai.
- Chưa tự động hoàn tiền. Chủ quán vẫn là người phê duyệt; thao tác hoàn tiền phải được đối soát riêng.
- Không dùng tài khoản demo và JWT localStorage cho website công khai; cần hoàn thiện xác thực và bảo mật trước khi deploy.
- Tình huống tạo payment link thành công nhưng phản hồi mạng bị mất cần quy trình đối soát mã orderCode trước khi thử lại; không tự tạo đơn thanh toán mới.

## Kiểm thử
1. Tạo đơn: QR payOS xuất hiện, số tiền đúng.
2. Không thanh toán: sau 20 phút đơn hết hạn.
3. Thanh toán hợp lệ: Webhook có chữ ký đúng -> đơn CONFIRMED, PAID.
4. Gửi lại Webhook: không xác nhận hai lần.
5. Webhook sai chữ ký/sai số tiền: không xác nhận.
6. Thanh toán đến muộn: ghi REVIEW_REQUIRED, không tự cấp phòng.
7. QR check-in chỉ xuất hiện sau khi PAID; check-in trùng phải bị từ chối.

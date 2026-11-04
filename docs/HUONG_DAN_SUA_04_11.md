# HIBI BOOTH – sửa giao diện, tổng quan chủ quán, đồng bộ payOS

## Đã sửa
- Sửa import SDK payOS 2.x (`import { PayOS } from '@payos/node'`).
- Bổ sung `GET /api/owner/summary`, khắc phục lỗi 404 ở tổng quan chủ quán.
- Bổ sung API `POST /api/payments/bookings/:code/reconcile`: Backend hỏi trực tiếp payOS về trạng thái giao dịch, không dựa vào redirect của trình duyệt. Frontend kiểm tra định kỳ 10 giây trong khi chờ thanh toán. Hữu ích khi chạy localhost không nhận được Webhook công khai.
- Khi trạng thái thanh toán được xác minh là PAID, trang đặt lịch hiển thị dấu tích, “Thanh toán thành công!”, “Đặt phòng thành công!” và QR check-in.
- Bỏ nút Quét QR check-in ở đầu dashboard nhân viên, bỏ nút Quản lý nhân viên ở đầu dashboard chủ quán.
- Đổi “Khám phá lịch trống” → “Đặt lịch ngay”, “Khu vực nhân viên” → “Đăng nhập”.

## Cách chạy Windows
1. Giải nén ra **thư mục mới**, không ghi đè bản đang dùng. Sao lưu database trước khi cập nhật.
2. Sao chép file `server/.env` từ dự án cũ sang `server/.env` bản này. **Không chia sẻ file .env**.
3. Đảm bảo có ba biến `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, và `ENABLE_DEMO_PAYMENT=false`.
4. Từ thư mục gốc: `npm install`, `npm run dev` (nếu DB đã tồn tại thì không chạy `db:seed`).
5. Mở `http://localhost:5173/dat-lich`, tạo đơn mới và kiểm thử với giao dịch được chủ tài khoản thanh toán cho phép.

## Quan trọng
- Tính năng đối soát chỉ xác nhận đơn khi **API payOS trả về trạng thái PAID** và mã đơn/số tiền khớp; không dựa vào ảnh hoặc trang chuyển hướng thành công.
- Thanh toán sau thời hạn giữ chỗ **không tự xác nhận đơn**, cần đối soát thủ công.
- Nếu trạng thái vẫn không đổi, kiểm tra log Backend và phản hồi của endpoint `/api/payments/bookings/:code/reconcile` trong Network; không gửi khóa bí mật.
- Đây là mã nguồn **chưa được kiểm thử giao dịch payOS thực tế**. Cần kiểm tra lại webhook, tính đúng đắn dữ liệu, lỗi mạng và bảo mật trước khi triển khai công khai.
- Không chạy `docker compose down -v`, không chạy lại `db:seed` trên DB cần giữ.

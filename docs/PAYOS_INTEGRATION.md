# Kết nối payOS THẬT — hướng dẫn tiếp tục phát triển

## Trạng thái bàn giao
- Website demo CHẠY ĐƯỢC với PostgreSQL; QR có chữ `DEMO-ONLY` và KHÔNG phải mã VietQR.
- Nút “Mô phỏng payOS báo thanh toán thành công” chỉ hoạt động trên máy local (`ENABLE_DEMO_PAYMENT=true`, `NODE_ENV` không phải production).
- Endpoint `/api/payos/webhook` trả HTTP 501 để tránh tưởng rằng đã có xác nhận tiền thật.
- Chưa tích hợp API payment link, chữ ký webhook, giao dịch ngân hàng hay payout thật.

## Bước tiếp theo để tự tích hợp
1. Hoàn tất đăng ký payOS với người đứng tên/tổ chức hợp lệ và kiểm tra quyền ngân hàng, phí, tài liệu SDK tại https://payos.vn/docs/ .
2. Cài SDK Node.js hiện hành theo tài liệu payOS; kiểm tra lại chính xác chữ ký hàm vì API SDK có thể thay đổi.
3. Bổ sung `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` vào Secret Manager hoặc `server/.env` trên máy (file này đã nằm trong `.gitignore`). KHÔNG đưa khóa vào frontend hoặc commit.
4. Tạo endpoint backend `POST /api/payments/bookings/:code/create`:
   - SELECT đơn PENDING_PAYMENT; xác định số tiền bằng dữ liệu trong PostgreSQL, không đọc số tiền từ frontend.
   - Tạo `orderCode` số nguyên duy nhất cho payOS; ghi `orderCode`, `booking_id`, `paymentLinkId`, trạng thái vào bảng thanh toán.
   - Gọi payOS để tạo payment link và trả `qrCode`/`checkoutUrl` về frontend.
   - Thiết lập hạn thanh toán gắn với `hold_expires_at` của đơn.
5. Thay `GET /api/payments/bookings/:code` để trả thông tin thanh toán payOS thay cho mã `HIBI-DEMO-ONLY`. Thay nút demo bằng hướng dẫn quét QR và kiểm tra trạng thái.
6. Thay `POST /api/payos/webhook` 501 bằng hàm nhận Webhook thực:
   - Verify signature bằng SDK/backend Checksum Key trước khi tin vào dữ liệu.
   - Đối chiếu đúng orderCode, số tiền, trạng thái giao dịch thành công; kiểm tra mã sự kiện hoặc mã giao dịch unique để chống xử lý trùng.
   - Thực hiện trong transaction, khóa dòng booking bằng SELECT ... FOR UPDATE, xác nhận slot vẫn được giữ hợp lệ, rồi cập nhật `payment_status='PAID'`, `status='CONFIRMED'`.
   - Nếu tiền về sau khi hết hạn/slot đã cấp cho khách khác, KHÔNG xác nhận tự động: ghi giao dịch cần đối soát và hướng xử lý ngoại lệ.
   - Chỉ phản hồi thành công khi đã lưu durable; xử lý retry của nhà cung cấp an toàn.
7. Kiểm tra trạng thái thanh toán bằng Backend API; không tin redirect URL, nút khách bấm hoặc localStorage làm bằng chứng nhận tiền.
8. Tắt/xóa demo route `/api/demo/bookings/:code/pay` trước khi deploy. Đổi JWT_SECRET, tài khoản seed và mật khẩu demo. Bắt buộc HTTPS, rate limit, backup, audit, CSRF/session security nếu dùng cookie.
9. Payout/hoàn tiền: API chỉ có OWNER quyết định APPROVE/REJECT; hoàn tiền thật là tích hợp riêng, chỉ đánh dấu REFUNDED sau khi có bằng chứng tiền đã hoàn.

## Bảng trạng thái
- PENDING_PAYMENT + PENDING: giữ phòng tối đa 20 phút.
- CONFIRMED + PAID: đã xác nhận thanh toán (trong demo là giả lập).
- EXPIRED + PENDING: quá 20 phút.
- APPROVED (refund): chủ quán duyệt, KHÔNG có nghĩa tiền đã hoàn.
- REFUNDED: chỉ khi provider xác nhận hoàn tiền thật hoặc đã kiểm chứng kết quả thực tế.

## API có sẵn của demo
- `GET /api/health` – kiểm tra service và PAYMENT_MODE.
- `POST /api/bookings` – đặt và giữ chỗ.
- `GET /api/payments/bookings/:code` – thông tin QR mô phỏng và trạng thái.
- `POST /api/demo/bookings/:code/pay` – hoàn tất thanh toán giả lập, local-only.
- `POST /api/payos/webhook` – trả 501, **điểm để bạn tự tích hợp**.
- `GET /api/bookings/lookup/:code` – tra cứu QR check-in.
- `POST /api/staff/bookings/:id/refunds` – gửi yêu cầu hoàn tiền.
- `PATCH /api/owner/refunds/:id/decision` – chủ quán phê duyệt/từ chối.

# COMMIT 06 — Khách hủy đơn, nhân viên duyệt, khởi động local

## Nội dung
- Khách tra cứu bằng mã đơn + số điện thoại, gửi hủy.
- Đơn `PENDING_PAYMENT` / `PENDING`: hủy giữ chỗ ngay, không cần hoàn tiền.
- Đơn `CONFIRMED` / `PAID`: tạo yêu cầu chờ duyệt. Nhân viên/chủ quán duyệt hoặc từ chối.
- Khi duyệt hủy: hủy đơn, giải phóng khung giờ, tạo yêu cầu hoàn tiền `PENDING_APPROVAL` để **chủ quán duyệt riêng**.
- Không tự chuyển tiền. Refund APPROVED cũng không có nghĩa tiền đã hoàn.
- Không duyệt đổi lịch khi có yêu cầu hủy đang chờ, và ngược lại.
- Giao diện đặt lịch vô hiệu hóa các khung giờ backend báo đã kín.

## Nâng cấp từ commit 05
1. Sao lưu thư mục dự án và DB trước.
2. Chép đè file của Commit 06 vào thư mục gốc (không xóa `server/.env`).
3. Nếu chưa có `.env`: `npm run setup:local`; nếu đã có `.env`, giữ nguyên.
4. `docker compose up -d postgres` (cần Docker Desktop).
5. `npm install`.
6. `npm run db:init` **để tạo bảng booking_cancellation_requests mới** (lệnh này chỉ tạo/ALTER bảng; không chạy `db:seed` để giữ tài khoản).
7. `npm run test:rules` và `npm run build`.
8. `npm run dev`. Website: http://localhost:5173 (hoặc 5174 nếu 5173 bận); API: http://localhost:4000/api/health.

## Luồng kiểm thử
1. Khách đặt đơn nhưng chưa thanh toán, tra cứu rồi hủy -> `CANCELLED`, giờ trống trở lại.
2. Khách có đơn PAID/CONFIRMED gửi hủy -> yêu cầu PENDING, lịch vẫn được giữ.
3. Nhân viên/chủ quán vào `Duyệt hủy đơn` -> duyệt -> booking CANCELLED, refunds PENDING_APPROVAL.
4. Chủ quán vào `Duyệt hoàn tiền` -> APPROVED/REJECTED; không có tiền tự động chuyển đi.
5. Thử hủy 2 lần, duyệt 2 lần, đổi lịch và hủy đồng thời -> bị chặn hợp lệ.

## Giới hạn cần giải quyết trước khi triển khai thật
- Chính sách điều kiện hủy và số tiền hoàn hiện tạm mặc định toàn phần khi chấp thuận; cần chốt với chủ quán.
- Chưa tích hợp kênh thanh toán hoàn tiền thật hoặc thông báo khách hàng về quyết định hủy qua email/SMS.
- Cần kiểm tra toàn luồng với PostgreSQL và frontend trình duyệt; build TypeScript không thay thế được kiểm thử nghiệp vụ.
- Trang demo/ JWT trong localStorage không đủ tiêu chuẩn bảo mật production.

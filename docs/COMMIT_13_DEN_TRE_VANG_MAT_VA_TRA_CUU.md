# HIBIBOOTH – Git Commit 13

## Nội dung

### A. Giao diện khách hàng – Tra cứu đơn

- Giữ phần thông tin đơn, QR check-in và liên kết lịch như trước.
- Phần quản lý đơn chỉ có **hai ô lựa chọn**: **Đổi lịch** hoặc **Hủy lịch**.
- Chỉ mở một biểu mẫu/lịch sử tại một thời điểm; mặc định đóng cả hai.
- Khi khách đổi mã đặt phòng hoặc số điện thoại, kết quả tra cứu cũ được ẩn.
- Nếu không tải được lịch sử yêu cầu, không cho gửi yêu cầu khác nhằm tránh gửi trùng.
- Khi backend đã nhận yêu cầu nhưng truy vấn lại thất bại, hướng dẫn tra cứu lại; không khuyến khích gửi lại.

### B. Nhân viên – Đến trễ / Không đến

- Sau **20 phút kể từ giờ hẹn**, nếu đơn còn `CONFIRMED` và `PAID`, nhân viên có thể chọn:
  - **Đến trễ**: ghi nhận thông tin và nhật ký, giữ nguyên trạng thái `CONFIRMED`; **không thực hiện check-in**.
  - **Không đến**: đổi trạng thái thành `NO_SHOW`, giải phóng suất đặt và ghi nhật ký.
- Hai hành động đều yêu cầu ghi chú dài 5–500 ký tự và xác nhận của nhân viên.
- Chỉ tài khoản `EMPLOYEE` sử dụng được API `POST /api/staff/bookings/:id/attendance`.
- Mỗi đơn chỉ được ghi nhận một trong hai sự kiện nhờ ràng buộc `UNIQUE`.
- PostgreSQL khóa đơn bằng `FOR UPDATE`, lấy giờ bằng `clock_timestamp()` để đối chiếu khi giao dịch đã nhận khóa.
- Giao dịch thanh toán **không** được đổi thành `REFUNDED`; không tự tạo hoặc gửi tiền hoàn lại.
- Chủ quán có thể đối chiếu nhân viên ghi nhận qua `audit_logs` (hành động `MARK_NO_SHOW` hoặc `RECORD_LATE_ARRIVAL`).

## Cài đặt

1. Sao lưu PostgreSQL trước khi chạy migration. Giải nén ZIP tại gốc `HIBIBOOTH-V5-PUBLIC`, không ghi đè `.env`.
2. Chạy `npm run db:init` để bổ sung trạng thái `NO_SHOW` và bảng `booking_attendance_incidents`. **Không chạy `db:seed`** khi cần giữ dữ liệu.
3. Chạy `npm run test:rules` và `npm run build`.
4. Chạy `npm run dev`, kiểm tra trên frontend hiện ra ở terminal (thường là cổng 5173 hoặc cao hơn).

## Kiểm thử thủ công nên làm trên máy

1. Tra cứu đơn hợp lệ: hiện đúng **hai ô** Đổi lịch / Hủy lịch, không hiển thị hai form cùng lúc.
2. Bấm Đổi lịch: chỉ hiện phần đổi lịch. Chuyển sang Hủy lịch: form đổi lịch ẩn đi.
3. Mã/SĐT không hợp lệ: thông báo tra cứu, không giữ thông tin đơn trước.
4. Với đơn đã thanh toán đang chờ duyệt đổi lịch: không tạo được yêu cầu hủy trùng.
5. Với đơn `CONFIRMED/PAID` đúng mốc +20 phút: nhân viên chưa thể ghi nhận vắng/trễ; vẫn nằm trong khoảng check-in.
6. Sau mốc +20 phút: ghi nhận Đến trễ với ghi chú -> thành công, lần thứ hai bị chặn; không check-in tự động.
7. Đơn tương tự sau +20 phút: ghi nhận Không đến -> trạng thái `NO_SHOW`, slot được giải phóng cho lượt đặt hợp lệ khác.
8. Đơn `NO_SHOW` đã trả tiền vẫn có `payment_status=PAID` và không có khoản hoàn tiền tự động.
9. Đơn đã `CHECKED_IN`, `CANCELLED`, `EXPIRED` hoặc chưa thanh toán bị từ chối xử lý.
10. Hai nhân viên xử lý cùng một đơn gần đồng thời: chỉ một thao tác được nhận; thao tác còn lại trả 409.
11. Tắt PostgreSQL ngay khi thao tác: trả lỗi, không hiện thành công giả. Sau khi kết nối trở lại, truy vấn không có bản ghi xử lý dở.
12. Đăng nhập `OWNER` và gọi API nhân viên: phải nhận `403`.

## Kiểm thử tự động

- `server/tests/attendance-exceptions.test.js` kiểm tra ngưỡng 20 phút, trạng thái, ghi chú không hợp lệ, đơn không tồn tại, cập nhật có điều kiện, thao tác lặp, clock DB, lỗi DB/audit.
- Chạy chung với bộ kiểm thử của các Commit 01–12 qua `npm run test:rules`.

**Giới hạn kiểm thử ở môi trường tạo bản vá:** các unit test và TypeScript đã được chạy; Vite bundle trên Linux không hoàn tất do thiếu native Rolldown trong bộ `node_modules` đang có. Cần build và kiểm thử tích hợp PostgreSQL bằng máy của bạn trước khi commit lên Git.

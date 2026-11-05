# HIBIBOOTH – Điều chỉnh Commit 13: Khách tự đổi/hủy lịch

## Quy tắc nghiệp vụ được thống nhất

- Khách tra cứu bằng **mã đặt phòng + số điện thoại**. Giao diện giữ đúng hai lựa chọn **Đổi lịch** và **Hủy lịch**.
- **Đổi lịch trực tiếp**: chỉ đơn `CONFIRMED`/`PAID` chưa check-in/hủy và chưa qua giờ bắt đầu được đổi; giờ mới phải hợp lệ, trước ít nhất 30 phút và không xung đột bất kỳ lượt 60 phút nào cùng phòng. Trong một transaction khóa bản ghi phòng, kiểm tra trùng lịch, cập nhật ngày/giờ, lưu lịch sử `APPROVED` do khách tự thao tác và cập nhật lịch nhắc. Không qua bước nhân viên/chủ quán duyệt.
- **Hủy trực tiếp**: đơn giữ chỗ chưa thanh toán còn hạn, hoặc đơn `CONFIRMED`/`PAID` chưa đến giờ bắt đầu đều tự hủy ngay. Phòng/khung giờ được giải phóng bởi trạng thái `CANCELLED`. Khách xác nhận trước khi thực hiện. Không cho hủy đơn `CHECKED_IN`, `NO_SHOW`, `EXPIRED`, đã hủy hoặc giờ chụp đã bắt đầu.
- **Tách hoàn tiền**: hủy đơn đã thanh toán **không làm phát sinh chuyển tiền hoặc tự duyệt hoàn tiền**. Khách liên hệ nhân viên để gửi đề nghị hoàn tiền; chủ quán duyệt riêng trong quy trình `refunds`. Chính sách số tiền hoàn cần được quán quyết định.
- Các yêu cầu đổi/hủy **PENDING** cũ được kết thúc trong transaction khi khách tự thao tác. API POST/PATCH xét duyệt cũ cho nhân viên/chủ quán trả **410**, tránh thao tác đồng thời. Các API danh sách lịch sử vẫn có thể tra cứu.
- Nhật ký `audit_logs` ghi hành động do **khách tự thực hiện** (`user_id=NULL`), mã đặt phòng, lịch cũ/mới hoặc lý do hủy; không ghi giả tên nhân viên.

## Các ngoại lệ cần kiểm thử ở máy Windows với PostgreSQL

1. Đổi sang giờ trống: `bookings.booking_date`/`time_slot` đổi ngay; lịch sử được ghi `APPROVED`; không cần tài khoản nhân viên.
2. Hai khách cùng phòng, cùng giờ gửi đồng thời: một thao tác thành công, thao tác kia HTTP `409`, không trùng đặt phòng.
3. Đổi sang giờ chồng lấn 30 phút của một buổi chụp 60 phút: HTTP `409`, giữ nguyên lịch cũ.
4. Đổi sát hơn 30 phút trước giờ mới, đổi vào giờ đã bắt đầu, QR/check-in xong, đơn hủy: HTTP `400`/`409`; lịch cũ không đổi.
5. Hủy đơn chưa trả tiền trong 20 phút: đơn thành `CANCELLED` ngay; không hoàn tiền.
6. Hủy đơn đã thanh toán trước giờ chụp: đơn thành `CANCELLED` ngay; `payment_status` vẫn là `PAID` cho đến khi quy trình hoàn tiền riêng diễn ra.
7. Hủy lần hai hoặc hủy sau khi check-in: HTTP `409` và không thay đổi lịch.
8. Hai yêu cầu hủy/đổi cùng lúc: database khóa giao dịch; chỉ thao tác phù hợp trạng thái cuối cùng được chấp nhận.
9. Lỗi ghi lịch sử hoặc nhật ký: rollback toàn bộ, lịch cũ/đơn cũ vẫn giữ nguyên.
10. Dùng URL xét duyệt cũ: trả `410`; menu nhân viên/chủ quán không còn các mục duyệt đổi/hủy.
11. Xem lịch sử trong tra cứu và Google Calendar: lịch mới phải hiển thị sau khi đổi.
12. Kiểm tra chủ quán vẫn có **phê duyệt hoàn tiền**, nhân viên vẫn có **gửi yêu cầu hoàn tiền**.

## Cập nhật an toàn

1. Sao lưu PostgreSQL trước.
2. Chép đè các file theo đúng đường dẫn vào `HIBIBOOTH-V5-PUBLIC`, không thay đổi `.env`.
3. Chạy `npm run db:init` để thay đổi ràng buộc của bảng `booking_reschedule_requests`. **Không chạy `db:seed`** trên database đang dùng.
4. Chạy `npm run test:rules`, `npm run build`, `npm run dev` và thực hiện các tình huống tích hợp trên.
5. Đây là **bản sửa của Commit 13**, không cần tăng số lượng commit nếu chưa lưu Commit 13 trước đó. Nếu Commit 13 đã push, tạo một commit sửa riêng thay vì viết đè lịch sử Git.

## Ghi chú về mức kiểm thử

160/160 bài kiểm thử Node.js đạt; TypeScript không lỗi. Chưa xác minh Vite build và các tình huống PostgreSQL thực tế vì môi trường đóng gói thiếu native Rolldown cho Linux. Chỉ coi việc đổi/hủy đã chạy thật sau khi kiểm thử trên máy.

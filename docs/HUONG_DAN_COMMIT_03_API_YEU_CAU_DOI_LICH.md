# COMMIT 03 – API tiếp nhận yêu cầu đổi lịch

## Phạm vi

Thêm `POST /api/bookings/:code/reschedule-requests` cho khách gửi yêu cầu đổi lịch. API **chỉ tạo bản ghi `PENDING`**, không thay đổi `bookings.booking_date`, `bookings.time_slot` hoặc trạng thái thanh toán. Chức năng xét duyệt và giao diện thuộc các commit tiếp theo.

## Đầu vào (JSON)

```json
{
  "customerPhone": "0901234567",
  "newDate": "2026-11-08",
  "newTimeSlot": "09:00",
  "reason": "Khách có việc bận và cần chuyển lịch"
}
```

`code` là mã đơn có thật của khách (ví dụ `HB-104112026`), ngày giờ mới phải ở tương lai và đặt trước ít nhất 30 phút.

## Điều kiện xử lý

- Mã đơn và số điện thoại khớp, đơn `CONFIRMED` và thanh toán `PAID`.
- Không được trùng ngày giờ hiện tại.
- Khung giờ phải hợp lệ, còn khả dụng ở thời điểm gửi yêu cầu.
- Một đơn chỉ có tối đa một yêu cầu `PENDING` (ràng buộc partial unique index trong SQL).
- Toàn bộ thao tác lưu yêu cầu và nhật ký chạy trong một transaction.
- Trả HTTP 201 khi gửi thành công, 400 với dữ liệu sai, 404 khi không khớp thông tin đơn, 409 khi xung đột.

## Lưu ý quan trọng

Kiểm tra phòng trống lúc khách gửi yêu cầu chỉ là bước sàng lọc. **Tại thời điểm phê duyệt**, Backend vẫn phải khóa phòng và kiểm tra lại trùng lịch trong transaction, vì người khác có thể đặt khung giờ đó trong lúc chờ duyệt.

Cần chạy cập nhật cấu trúc DB từ Commit 02 trước khi gọi API này. Để tránh làm thay đổi dữ liệu thật, thử trên database sao lưu hoặc môi trường kiểm thử. Không gọi API với thông tin khách thật trong khi demo chưa hoàn thiện.

## Kiểm thử

Tại thư mục gốc dự án: `npm run test:rules`.

Sau khi xác nhận code và test đúng:

```cmd
git add server/src/server.js server/src/reschedule-rules.js server/tests/reschedule-rules.test.js docs/HUONG_DAN_COMMIT_03_API_YEU_CAU_DOI_LICH.md
git commit -m "Add customer reschedule request API"
git push origin main
```

Dùng `git rev-list --count HEAD` để xác nhận số commit.

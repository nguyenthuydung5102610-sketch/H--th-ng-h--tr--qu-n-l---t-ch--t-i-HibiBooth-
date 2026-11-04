# COMMIT 06 (Git thực tế) — Xem giờ trống trước khi yêu cầu đổi lịch

## Thay đổi trong commit này

- Khách tra cứu đơn bằng mã và số điện thoại: khi chọn **ngày đổi lịch**, UI gọi API mới `GET /api/bookings/:code/reschedule-availability?phone=...&date=YYYY-MM-DD`.
- Các khung giờ hết hạn hoặc trùng với đơn của khách khác được vô hiệu hóa; hệ thống không hiển thị giờ hiện tại là một lựa chọn đổi lịch hợp lệ.
- Yêu cầu **không** tự thay đổi lịch gốc: vẫn qua API xin đổi lịch / duyệt / từ chối đã có ở Commit 03 và 04.
- Nhân viên và chủ quán có ô tìm kiếm nhanh mã đơn, khách, số điện thoại, phòng trong màn hình xét duyệt.
- API mới chỉ trả thông tin lịch của đơn sau khi xác minh **đúng mã đơn và số điện thoại**, giới hạn số lượt gọi. Không tiết lộ danh sách đơn khác.
- 2 bài unit test cho quy tắc tính giờ trống và giới hạn đặt trước.

## Kiểm thử thủ công

1. Chạy `npm run test:rules` và `npm run build`.
2. Chạy `npm run dev`. Đặt một đơn DEMO xác nhận thanh toán (không dùng tiền thật).
3. Vào **Tra cứu đơn**, nhập mã đơn và số điện thoại đã đặt.
4. Chọn ngày đổi lịch: giờ trùng với người khác / quá gần hiện tại bị vô hiệu hóa, giờ hợp lệ chọn được.
5. Gửi yêu cầu: đơn giữ lịch cũ, trạng thái yêu cầu `PENDING`.
6. Đăng nhập nhân viên, chọn **Duyệt đổi lịch**, tìm theo mã đơn, chọn duyệt/từ chối và kiểm tra trạng thái tra cứu của khách.
7. Thử đặt chỗ trùng ngay trước khi phê duyệt: server phải từ chối phê duyệt vì sẽ kiểm tra lại dưới transaction lock.

## Tạo Git commit (sau khi chép file patch)

```
git status
git add client/src/pages/PublicPages.tsx client/src/pages/RescheduleManagementPage.tsx client/src/styles.css server/src/server.js server/src/reschedule-rules.js server/tests/reschedule-availability.test.js docs/COMMIT_06_GIAO_DIEN_DOI_LICH_THUC_TE.md
git commit -m "feat: add reschedule availability preview and management search"
git log -1 --oneline
```

**Ghi chú:** Bản ZIP không tự tạo Git commit. Database của người dùng cần đang chạy để kiểm thử tích hợp. Trạng thái khả dụng trong UI chỉ là thông tin trước duyệt, không đảm bảo giờ sẽ còn trống đến thời điểm xét duyệt.

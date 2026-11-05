# HIBI BOOTH - Git Commit 08: Tự động hết hạn giữ chỗ

## Mục tiêu BPMN

- **Giữ chỗ tạm thời**: tạo đơn `PENDING_PAYMENT/PENDING` trong 20 phút.
- **Quá 20 phút**: hệ thống chủ động chuyển đơn chưa thanh toán sang `EXPIRED` và trả lại lịch trống.
- **Không giải phóng nhầm** đơn `CONFIRMED/PAID` hoặc `CHECKED_IN`.
- **Giải phóng chỗ giữ tạm** không được tự hiểu là hoàn tiền; thanh toán đến muộn phải được đối soát thủ công.

Thông báo hết hạn trên trang thanh toán đã được bổ sung; **email/SMS thông báo hết hạn chưa triển khai** (dự kiến ở Commit 14).

## File được cập nhật

- `server/src/hold-expiration.js`: nghiệp vụ và worker tự động mỗi 15 giây, lô 50 đơn/lần, tối đa 4 lô/tick; khóa PostgreSQL `FOR UPDATE SKIP LOCKED`, ghi `HOLD_EXPIRED` vào `audit_logs`, rollback khi thất bại.
- `server/src/server.js`: khởi động worker, dùng chung thời lượng giữ chỗ 20 phút, tra cứu trạng thái nhất quán, không trả QR thanh toán với đơn hết hạn; bỏ các lệnh cập nhật hết hạn đại trà trong API.
- `server/sql/schema.sql`: chỉ số riêng cho các đơn chờ thanh toán có thời gian giữ chỗ (an toàn khi chạy lại `db:init`).
- `client/src/pages/PublicPages.tsx`: tự ẩn QR/nút chuyển tới payOS khi đồng hồ xuống 0; có nút tra cứu lại trạng thái từ backend; cập nhật `booking` theo phản hồi API.
- `server/tests/hold-expiration.test.js`: 19 test mới cho ranh giới 20 phút, lỗi database, rollback, không lặp, tránh quá tải và tác vụ chồng lên nhau.

## Cách cập nhật

1. Sao lưu dữ liệu PostgreSQL trước khi nâng cấp. Dừng `npm run dev`.
2. Giải nén ZIP Commit 08 và **chép đè các file theo đường dẫn**, không xóa toàn bộ dự án.
3. **Giữ nguyên** `server/.env`; không chép `node_modules` hoặc `client/dist`.
4. Mở CMD/PowerShell tại gốc dự án:

```bash
npm run db:init
npm run test:rules
npm run build
npm run dev
```

Lưu ý: không chạy `npm run db:seed` trên database có dữ liệu thật.

## Checklist kiểm thử nghiệp vụ và ngoại lệ (thực hiện trên môi trường DEMO)

1. **Đơn mới**: đặt phòng -> nhận `PENDING_PAYMENT`, `payment_status=PENDING`, `hold_expires_at` sau khoảng 20 phút.
2. **Chưa hết hạn**: trước mốc 20 phút, phòng/giờ còn bị chặn; không thể tạo đơn trùng.
3. **Đúng mốc**: khi đến hạn (bao gồm đúng 20 phút), worker đổi đơn thành `EXPIRED` trong tối đa một chu kỳ 15 giây nếu backend và PostgreSQL hoạt động.
4. **Tái sử dụng**: sau hết hạn, phòng/giờ phải hiện trống và khách khác có thể đặt.
5. **Thanh toán hợp lệ trước hạn**: đơn đổi thành `CONFIRMED/PAID`, worker không chuyển sang `EXPIRED`.
6. **QR quá hạn**: trang thanh toán ẩn QR/nút payOS, hiển thị thời gian hết hạn và nút "Kiểm tra trạng thái đơn".
7. **Thanh toán đến muộn**: webhook/reconcile ghi `REVIEW_REQUIRED`, không tự lấy lại phòng, nhân viên phải đối soát.
8. **Xử lý lại**: worker chạy 2 lần không tạo 2 audit log `HOLD_EXPIRED` cho cùng đơn.
9. **Database lỗi giữa giao dịch**: toàn bộ cập nhật rollback, worker không làm mất dữ liệu; thử lại chu kỳ sau.
10. **Backend khởi động lại**: các đơn cũ quá hạn được dọn ở tick đầu tiên.
11. **Nhiều instance**: hai worker dùng `SKIP LOCKED`, không lấy cùng một đơn đang khóa; cần chạy thử tích hợp PostgreSQL thật để xác nhận.
12. **Từ chối/hủy đúng thời điểm**: thao tác hủy ở thời điểm đã hết hạn trả 409, đơn chuyển thành `EXPIRED` và có nhật ký.

### Cách giả lập một đơn quá hạn (chỉ cho đơn TEST, không dùng với dữ liệu khách thật)

Sau khi tạo một đơn chưa thanh toán, trong PostgreSQL thay `MA_TEST` bằng mã đặt phòng thử nghiệm:

```sql
UPDATE bookings
SET hold_expires_at = NOW() - INTERVAL '1 minute'
WHERE booking_code = 'MA_TEST'
  AND status = 'PENDING_PAYMENT'
  AND payment_status = 'PENDING';
```

Sau khi backend chạy khoảng một chu kỳ worker, kiểm tra:

```sql
SELECT booking_code,status,payment_status,hold_expires_at
FROM bookings WHERE booking_code = 'MA_TEST';

SELECT action,created_at,details
FROM audit_logs
WHERE action='HOLD_EXPIRED'
  AND details->>'bookingCode'='MA_TEST';
```

Kết quả mong đợi: `status=EXPIRED`, `payment_status=PENDING`, đúng **1** audit log. Phòng được giải phóng trong `/api/availability`.

## Kết quả kiểm thử tạo gói

- `npm run test:rules`: **60/60 PASS** (41 test trước + 19 test mới).
- `node --check server/src/server.js`: PASS.
- `node --check server/src/hold-expiration.js`: PASS.
- `tsc --noEmit -p client/tsconfig.json`: PASS.
- Build Vite đầy đủ: **chưa xác nhận ở môi trường đóng gói** do `node_modules` của bộ dự án lưu sẵn chỉ có `@rolldown/binding-win32-x64-msvc` và không có bản native Linux. Hãy chạy `npm run build` trên Windows sau khi chép file.
- **Chưa có kiểm thử tích hợp PostgreSQL/payOS thực tế** từ môi trường tạo gói; cần thực hiện checklist trên máy trước khi commit.

## Lưu Git đúng thứ tự

```bash
git status
npm run test:rules
npm run build
git add server/src/hold-expiration.js server/src/server.js server/sql/schema.sql server/tests/hold-expiration.test.js client/src/pages/PublicPages.tsx docs/COMMIT_08_TU_DONG_HET_HAN_GIU_CHO.md
git commit -m "feat: auto-expire unpaid booking holds and release rooms"
git push origin main
git rev-list --count HEAD
```

Khi trước đó có đúng 7 Git commits, kết quả cuối cùng sẽ là **8**.

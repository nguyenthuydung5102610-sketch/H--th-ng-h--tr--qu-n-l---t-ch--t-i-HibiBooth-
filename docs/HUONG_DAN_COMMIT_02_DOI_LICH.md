# Commit 02 — Thêm bảng yêu cầu đổi lịch

## Mục tiêu
Thêm bảng `booking_reschedule_requests` trong `server/sql/schema.sql`. Không đổi bảng `bookings`, API, giao diện, hoặc dữ liệu đơn đang lưu.

## Giải thích
- `id`: PK của yêu cầu.
- `booking_id`: FK → `bookings.id`; một đơn có thể gửi nhiều yêu cầu qua thời gian.
- `requested_by`: bên yêu cầu (CUSTOMER / EMPLOYEE / OWNER); không phải FK vì khách không cần tài khoản.
- `old_booking_date`, `old_time_slot`: bản chụp lịch hiện tại lúc gửi yêu cầu.
- `new_booking_date`, `new_time_slot`: lịch đề xuất.
- `reason`: lý do yêu cầu.
- `status`: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`.
- `reviewed_by`: FK → `users.id` (nhân viên hoặc chủ quán phê duyệt ở các bước kế tiếp).
- `decision_reason`, `reviewed_at`: lý do và thời điểm quyết định.
- `created_at`: thời điểm gửi yêu cầu.

## Quy tắc CSDL
- Yêu cầu phải đề xuất ngày hoặc giờ khác với lịch cũ.
- Mỗi đơn có tối đa một yêu cầu `PENDING` (partial UNIQUE index).
- Khi `APPROVED`/`REJECTED` phải có `reviewed_by` và `reviewed_at`.
- Không tự đổi `bookings.booking_date` và `bookings.time_slot` ở bước này.
- Trong API phê duyệt sau này phải kiểm tra quyền, trạng thái đơn, thời gian, phòng trống *lần nữa* trong transaction rồi mới đổi lịch.

## Chạy trong thư mục gốc HIBIBOOTH-V5-PUBLIC
1. Sao lưu database trước khi thực hiện thay đổi schema.
2. Dừng máy chủ đang chạy nếu cần, không xóa Docker volume.
3. `npm run db:init`
4. `npm run test:rules`
5. Kiểm tra `git diff -- server/sql/schema.sql` và `git status`; tránh commit `.env`.
6. `git add server/sql/schema.sql docs/HUONG_DAN_COMMIT_02_DOI_LICH.md`
7. `git commit -m "Add reschedule request database schema"`
8. `git push origin main`

## Trạng thái
Bước này **chỉ thêm schema**. Chưa có API gửi yêu cầu, API phê duyệt, giao diện hay kiểm thử tích hợp mới. Không nói đã triển khai nghiệp vụ đổi lịch hoàn chỉnh.

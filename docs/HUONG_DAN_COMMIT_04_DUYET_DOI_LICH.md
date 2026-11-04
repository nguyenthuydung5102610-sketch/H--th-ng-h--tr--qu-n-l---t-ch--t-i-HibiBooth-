# HIBI BOOTH V5 – Commit 04: Xét duyệt đổi lịch (theo TO-BE)

## Căn cứ

Đã đối chiếu nhánh **“Muốn đổi lịch/hủy lịch?” → Đổi lịch → Chọn thời gian → Kiểm tra phòng trống** với file `to_b_e_v3 (1) (1)(1).bpmn` người dùng cung cấp. Quy tắc bổ sung đã thống nhất: **khách chỉ gửi đề nghị, nhân viên hoặc chủ quán mới xác nhận để đổi lịch thành công**. Không bỏ các task hoặc thông báo trong BPMN; nhiều phần nghiệp vụ (hủy, đổi giờ do đến trễ, hoàn tiền...) thuộc các commit sau và vẫn cần đối chiếu riêng.

## Những gì Commit 04 thực hiện

1. `GET /api/management/reschedule-requests?status=PENDING` – nhân viên và chủ quán xem danh sách yêu cầu. Các trạng thái lọc: PENDING/APPROVED/REJECTED/CANCELLED/ALL.
2. `PATCH /api/management/reschedule-requests/:id/decision` – có JWT hợp lệ và quyền EMPLOYEE hoặc OWNER, body: `{ "decision": "APPROVE" | "REJECT", "decisionReason": "..." }`.
3. Với **APPROVE**: khóa dòng phòng, khóa đơn + yêu cầu, xác minh đơn PAID/CONFIRMED, lịch cũ còn đúng, giờ mới cách hiện tại ≥30 phút, nằm trong giờ hoạt động, không chồng lấn phiên 60 phút, rồi mới cập nhật `bookings.booking_date/time_slot` và `booking_reschedule_requests.status=APPROVED`, cùng giao dịch PostgreSQL.
4. Với **REJECT**: yêu cầu nhập lý do (ít nhất 5 ký tự), giữ nguyên ngày giờ đơn, cập nhật yêu cầu thành REJECTED và ghi thời điểm/người duyệt/lý do.
5. Với cả hai nhánh: ghi `audit_logs`, lưu thông báo xét duyệt vào bảng `reschedule_decision_notifications` (nếu khách có email), để worker gửi qua Resend khi cấu hình dịch vụ. Nếu email chưa kích hoạt, thông báo vẫn nằm trong database và khách có thể tra cứu kết quả qua API.
6. `GET /api/bookings/:code/reschedule-requests?phone=09xxxxxxxx` – khách xem lịch sử yêu cầu kèm trạng thái, lý do từ chối; kiểm tra cặp mã đơn + số điện thoại.
7. Sau khi duyệt, hàng đợi nhắc lịch email/SMS đã có sẽ được chuyển sang lịch mới (nếu đủ điều kiện); email thông báo đổi lịch nhắc khách cập nhật Google Calendar đã lưu trước đó. Google Calendar không tự thay đổi sự kiện bên ngoài tài khoản khách.
8. Worker dùng idempotency key theo **requestId** cho thông báo xét duyệt; lịch nhắc email dùng thời gian chụp trong key để tránh nhà cung cấp hiểu lịch mới là bản gửi trùng lịch cũ.

## Thông báo và ngoại lệ

| Trường hợp | HTTP | Kết quả |
|---|---:|---|
| Không đăng nhập | 401 | Yêu cầu đăng nhập |
| Đăng nhập sai vai trò hoặc tài khoản đã bị khóa | 403 | Không có quyền duyệt |
| Mã yêu cầu sai | 400 | Thông báo đầu vào không hợp lệ |
| Đề nghị không tồn tại | 404 | Không tìm thấy yêu cầu |
| Yêu cầu đã được xử lý | 409 | Không duyệt hai lần |
| Lịch cũ đổi/trạng thái đơn không phù hợp | 409 | Giữ nguyên dữ liệu, hướng dẫn xử lý |
| Giờ mới không đủ trước 30 phút | 409 | Không cập nhật lịch |
| Giờ mới đã có khách khác đặt | 409 | Không cập nhật lịch, nhắc lựa chọn khác |
| Duyệt | 200 | Cập nhật lịch mới và ghi nhận thông báo |
| Từ chối có lý do | 200 | Giữ lịch cũ và ghi nhận thông báo |

## Cài đặt sau khi giải nén

1. Sao lưu database hiện tại (tuyệt đối không xóa Docker volume).
2. Sao chép **đúng 6 file** trong ZIP vào thư mục `HIBIBOOTH-V5-PUBLIC`, giữ nguyên `server/.env`:
   - `server/src/server.js`
   - `server/src/reschedule-rules.js`
   - `server/src/email-notifications.js`
   - `server/sql/schema.sql`
   - `server/tests/reschedule-decision.test.js`
   - `docs/HUONG_DAN_COMMIT_04_DUYET_DOI_LICH.md`
3. Ở **thư mục gốc có `package.json`**, chạy: `npm run test:rules`.
4. Bảo đảm `server/.env` có `DATABASE_URL` (không gửi khóa hoặc ảnh có mật khẩu). Trên máy nếu trước đây gặp `SASL ... client password must be a string`, kiểm tra file `.env` trước khi chạy `npm run db:init`.
5. Khi database hoạt động bình thường, chạy `npm run db:init` để tạo bảng `reschedule_decision_notifications`; lệnh không xóa bảng hiện có. **Không chạy `db:seed`.**
6. Chạy `npm run dev`, dùng API client/Postman để thử gửi/duyệt/từ chối. Chức năng **chưa có giao diện nút xét duyệt** trong Commit 04; giao diện sẽ thực hiện ở các commit tiếp theo.
7. Khi đã kiểm thử cục bộ, tạo commit và push:

```cmd
git add server/src/server.js server/src/reschedule-rules.js server/src/email-notifications.js server/sql/schema.sql server/tests/reschedule-decision.test.js docs/HUONG_DAN_COMMIT_04_DUYET_DOI_LICH.md
git commit -m "Add reschedule approval and rejection API"
git push origin main
git rev-list --count HEAD
```

## Ví dụ HTTP body khi thử bằng Postman

Đường dẫn: `PATCH http://localhost:4000/api/management/reschedule-requests/1/decision`

Header: `Authorization: Bearer <JWT nhân viên hoặc chủ quán>` và `Content-Type: application/json`.

Chấp thuận: `{ "decision": "APPROVE" }`.

Từ chối: `{ "decision": "REJECT", "decisionReason": "Khung giờ này không thể bố trí nhân viên." }`.

**Không dán JWT, mật khẩu hoặc `.env` vào báo cáo/ChatGPT.**

## Mức độ kiểm thử

`npm run test:rules` đạt 22/22 test Node thuần (bao gồm 5 test mới về quyết định XOR, kiểm tra 30 phút, nội dung email). `node --check` cho các file JS đạt. **Chưa kiểm thử giao dịch thực trên PostgreSQL, gửi Resend thật hoặc chạy toàn bộ luồng UI**, vì môi trường không có DB và tài khoản dịch vụ của người dùng. Phải kiểm tra ở máy cục bộ trước khi nộp.

## Ranh giới chức năng

- Đây là **Commit 04 (Backend)**. Không tuyên bố đã hoàn thiện giao diện gửi/duyệt đổi lịch.
- BPMN có các bước hủy đơn, khách đến trễ, đề xuất khung giờ, hoàn tiền và các thông báo khác. Không chức năng nào bị xóa bởi bản sửa này, nhưng cần tiếp tục bảo đảm từng task được triển khai và kiểm thử trước khi khẳng định BPMN và website đã khớp 100%.
- Khi lịch đổi trong lúc một email nhắc lịch đã gửi đi, email cũ không thể thu hồi; email kết quả yêu cầu khách cập nhật lại lịch và worker sẽ lên lịch nhắc theo giờ mới.

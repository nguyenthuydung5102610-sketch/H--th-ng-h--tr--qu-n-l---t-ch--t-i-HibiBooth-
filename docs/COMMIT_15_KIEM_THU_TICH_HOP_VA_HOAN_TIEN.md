# HIBIBOOTH – Git Commit 15: Kiểm thử hệ thống và phê duyệt hoàn tiền an toàn

## Mục tiêu

Đối chiếu các chức năng theo BPMN và khắc phục nguy cơ **phê duyệt hoàn tiền dang dở**: trước đây chủ quán đổi trạng thái yêu cầu hoàn tiền, cập nhật đơn đặt và ghi nhật ký bằng các truy vấn độc lập. Nếu một truy vấn thất bại, dữ liệu có thể mâu thuẫn.

## Thay đổi mã nguồn

- `server/src/refund-decision.js`: Phê duyệt/từ chối hoàn tiền trong **một** giao dịch PostgreSQL `BEGIN`–`COMMIT`/`ROLLBACK`. Khóa đơn và yêu cầu theo thứ tự cố định để giảm rủi ro tranh chấp; từ chối xử lý trùng và đơn không còn hợp lệ.
- `server/src/server.js`: API `PATCH /api/owner/refunds/:id/decision` gọi cùng một dịch vụ giao dịch; chủ quán bắt buộc xác thực. Sai dữ liệu trả HTTP 400, không tìm thấy 404, xung đột 409.
- `client/src/pages/OwnerPages.tsx`: Khóa nút **Duyệt/Từ chối** trong lúc gửi yêu cầu, tải lại danh sách nếu API báo lỗi.
- `server/tests/refund-decision.test.js`: Test chấp thuận, từ chối, xử lý trùng, thiếu dữ liệu, sai trạng thái, lỗi COMMIT/ghi nhật ký/ghi đơn, rollback và quyền chủ quán ở API.
- `scripts/smoke-public-api.mjs` + `package.json`: Bổ sung `npm run test:smoke` để kiểm tra API đang chạy, kết nối PostgreSQL, dữ liệu catalog và availability **không ghi/sửa/xóa dữ liệu**.

**Quan trọng:** Duyệt hoàn tiền KHÔNG có nghĩa là chuyển tiền thật. Trạng thái `REFUND_PENDING` thể hiện yêu cầu đã được chủ quán chấp thuận nhưng còn phải thực hiện hoàn tiền qua nhà cung cấp và đối soát.

## Cài đặt an toàn

1. Sao lưu thư mục dự án và database, đặc biệt nếu đang có đơn đặt thật.
2. Chép đè các file từ ZIP theo đúng cấu trúc. Không xóa `server/.env`, không xóa volume Docker.
3. Không cần `db:init` vì Commit 15 không thay đổi cấu trúc database.
4. Chạy `npm run test:rules` và `npm run build`.
5. Chạy `npm run dev` trên terminal khác; sau khi backend chạy ở cổng 4000, chạy `npm run test:smoke`.
6. Kiểm thử thủ công các luồng theo bảng dưới rồi mới commit.

Nếu backend dùng cổng khác, chạy `set API_BASE_URL=http://localhost:4001` trong CMD trước `npm run test:smoke`.

## Danh sách kiểm thử tích hợp theo BPMN

| Mã | Kịch bản | Kỳ vọng |
|---|---|---|
| IT01 | Khởi động cả frontend và backend | `/api/health` trả `ok: true` |
| IT02 | Lấy danh sách phòng, gói chụp | `/api/catalog` trả dữ liệu; không báo lỗi kết nối |
| IT03 | Kiểm tra giờ trống khi đặt lịch | Không cho 2 đơn cùng phòng có giờ chụp chồng lấn |
| IT04 | Khách tạo đơn giữ chỗ | Đơn `PENDING_PAYMENT`, thời hạn giữ 20 phút |
| IT05 | Giữ chỗ hết hạn, không thanh toán | Tự chuyển `EXPIRED`, mở lại lịch |
| IT06 | Thanh toán xác thực hợp lệ | Đơn được xác nhận đúng một lần (không dùng demo làm bằng chứng giao dịch thật) |
| IT07 | payOS mất kết nối / trả lỗi | Không tự chuyển đơn thành đã thanh toán; hiển thị lỗi có thể thử lại |
| IT08 | Khách tự đổi lịch sang giờ trống | Cập nhật ngay; lưu lịch sử |
| IT09 | Khách tự đổi lịch sang giờ vừa bị người khác đặt | Trả 409; giữ nguyên lịch cũ |
| IT10 | Khách tự hủy đơn hợp lệ | Đơn `CANCELLED`, trả lại lịch, không cần duyệt |
| IT11 | Hủy đơn đã thanh toán | Không tự hoàn tiền; có thể làm yêu cầu riêng |
| IT12 | Quét QR check-in 2 lần | Chỉ lần đầu được xác nhận, lần sau báo xung đột |
| IT13 | Check-in trước/sau giờ cho phép | Từ chối đúng theo quy tắc thời gian |
| IT14 | Nhân viên ghi nhận khách đến trễ/không đến | Ghi trạng thái và nhật ký; không hoàn tiền tự động |
| IT15 | Nhân viên gửi đề nghị hoàn tiền đúng điều kiện | Chủ quán thấy yêu cầu `PENDING_APPROVAL` |
| IT16 | Chủ quán duyệt hoàn tiền | Yêu cầu `APPROVED`, đơn `REFUND_PENDING`, nhật ký xuất hiện đồng thời |
| IT17 | Chủ quán từ chối hoàn tiền | Yêu cầu `REJECTED`; trạng thái thanh toán của đơn không thay đổi |
| IT18 | Hai lần duyệt cùng yêu cầu | Một thành công; lần còn lại HTTP 409 |
| IT19 | Xử lý duyệt hoàn tiền khi database lỗi | Cả yêu cầu, đơn và nhật ký được rollback (test tự động bằng DB giả lập) |
| IT20 | Nhân viên tự gọi API duyệt hoàn tiền | HTTP 403; không đổi dữ liệu |
| IT21 | Mở trang tra cứu đơn trên điện thoại | Hai lựa chọn chính: Đổi lịch / Hủy lịch |
| IT22 | Email/SMS không cấu hình | Không làm thất bại luồng đặt phòng; hiển thị trạng thái cấu hình phù hợp |

## Phạm vi đã kiểm tra và giới hạn

- Nếu kết nối PostgreSQL bị ngắt đúng lúc `COMMIT`, kết quả có thể chưa xác định được từ phản hồi HTTP. Trước khi thử duyệt lại, cần tra cứu trạng thái yêu cầu và nhật ký để đối chiếu, không mặc định giao dịch chắc chắn đã rollback.

- Chạy `npm run test:rules` để kiểm tra quy tắc nghiệp vụ với mock DB, bao gồm lỗi giao dịch và rollback.
- Kiểm tra TypeScript bằng `tsc --noEmit`.
- **Chưa** kiểm thử tích hợp với PostgreSQL, API payOS thực tế, email/SMS trên máy người dùng. Chạy `test:smoke` và các bước thủ công ở trên mới xác nhận được các phần đó.
- Môi trường tạo bản vá là Linux có node_modules dành cho Windows; lệnh `vite build` có thể không chạy được ở đây. Người dùng cần chạy `npm run build` trên Windows trước khi commit.

## Tạo Git Commit 15

Chỉ stage các file đúng phạm vi của Commit 15, tránh vô tình gộp thay đổi chưa hoàn thành từ các commit trước:

```bat
git add server/src/refund-decision.js server/src/server.js server/tests/refund-decision.test.js client/src/pages/OwnerPages.tsx scripts/smoke-public-api.mjs package.json docs/COMMIT_15_KIEM_THU_TICH_HOP_VA_HOAN_TIEN.md
git diff --cached --stat
git commit -m "fix: make refund approvals atomic and add integration smoke checks"
git push origin main
git rev-list --count HEAD
```

Nếu trước đó đã có 14 Git commits thực tế, kết quả mong đợi là `15`.

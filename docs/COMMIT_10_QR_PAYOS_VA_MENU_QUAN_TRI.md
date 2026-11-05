# Git Commit 10 — Khôi phục QR payOS và tối ưu menu quản trị

## Các thay đổi

1. `server/src/payos-link.js`: Đối chiếu giao dịch payOS theo `orderCode` đã có. Nếu payOS phản hồi rõ ràng **101 – mã thanh toán không tồn tại**, cho phép thử tạo lại giao dịch với **cùng orderCode**. Không tạo một `orderCode` mới khi lỗi mạng hoặc trạng thái không rõ. Xử lý trường hợp create chạy đồng thời và khôi phục qua get.
2. `server/src/server.js`: Dùng hàm trên ở endpoint `POST /api/payments/bookings/:code/create`; kiểm tra hết hạn/đã thanh toán trong database trước khi lưu QR. Không thay đổi logic webhook xác nhận thanh toán.
3. `client/src/pages/PublicPages.tsx`: Hiển thị liên kết mở trang thanh toán payOS làm phương án thay thế nếu chỉ thiếu chuỗi QR; lời nhắc thử tải lại rõ hơn.
4. `client/src/components/Layout.tsx`, `client/src/styles.css`: Nhóm menu khác nhau theo vai trò, compact sidebar, làm nổi mục đang mở, và menu mở/đóng trên màn hình điện thoại.
5. `server/tests/payos-link.test.js`: 14 test mới cho truy vấn payOS, mạng lỗi, code 101, race, hold hết hạn, mã/số tiền sai, link không hợp lệ.

## Nguyên nhân lỗi QR quan sát được

Ở Commit 09, backend đã lưu `orderCode` trong PostgreSQL trước khi gọi `payos.paymentRequests.create`. Nếu gọi create đầu tiên lỗi, những lần tiếp theo chỉ gọi `get(orderCode)`. Khi payOS trả về `code: 101` (chưa tồn tại), API sẽ mắc kẹt và luôn trả lỗi. Commit 10 thử tạo lại **đúng mã đã lưu**, sau khi xác định rõ rằng payOS không có yêu cầu ấy.

## Cài đặt trên máy đã có Commit 09

1. Sao lưu project đang chạy. Dừng `npm run dev`.
2. Giải nén ZIP, chép đè các file theo cấu trúc thư mục; **không** chép đè `server/.env`.
3. Mở CMD tại thư mục gốc `HIBIBOOTH-V5-PUBLIC`:

   ```bat
   npm run test:rules
   npm run build
   npm run dev
   ```

4. Mở frontend tại URL Vite hiện trong terminal; tạo một **đơn thử mới** rồi vào thanh toán. Thử lại mã của đơn cũ đang còn hạn nếu có. Chỉ dùng giao dịch thử được nhà cung cấp hỗ trợ; không chuyển tiền thật khi chưa kiểm thử an toàn.
5. Kiểm tra menu cả hai vai trò: `/nhan-vien` và `/chu-quan`; trên màn hình nhỏ mở/đóng menu, chuyển trang, đăng xuất.

**Không thay đổi schema PostgreSQL** nên không cần `db:init` cho Commit 10. Không chạy `db:seed` hoặc xóa volume.

## Tình huống kiểm thử ngoại lệ

| Trường hợp | Kết quả mong đợi |
|---|---|
| get() trả mã giao dịch đang PENDING | Dùng lại QR và checkoutUrl; không create |
| get() trả lỗi 101 | Gọi create với đúng orderCode đã lưu |
| get() bị timeout/ECONNRESET | Không create; báo lỗi thử lại |
| Hai request cùng create | Nếu một request đã tạo, request kia đọc lại và trả kết quả; không cấp orderCode khác |
| payOS trả sai amount/orderCode | Không trả QR để chuyển khoản |
| payOS trả giao dịch PAID/CANCELLED/EXPIRED | Không hiển thị QR để trả tiền thêm |
| Giữ chỗ hết hạn đúng lúc lấy QR | Từ chối phát hành QR, không xác nhận đơn |
| payOS chỉ trả checkoutUrl hợp lệ | Hiện nút mở trang payOS, không tự dựng QR giả |
| payOS trả checkoutUrl lạ/javascript | Không dùng link không an toàn |
| Dịch vụ bị lỗi hoàn toàn | Hiển thị lỗi hữu ích, đơn không tự chuyển PAID |

## Giới hạn và cấu hình

- Nếu payOS trả mã lỗi khác 101, khóa API sai, chưa kích hoạt tài khoản hoặc mạng mất kết nối, **không thể tạo QR thành công** cho đến khi xử lý phía payOS. Xem log backend để biết mã lỗi, tránh đưa khóa bí mật vào ảnh chụp.
- Không tự xác nhận thanh toán dựa vào frontend, redirect, hay thao tác bấm nút.
- Cần kiểm thử tích hợp thực tế trên PostgreSQL, SDK payOS, trình duyệt trước khi triển khai công khai.
- Ở môi trường tạo bản vá: 93/93 test quy tắc backend đạt, TypeScript `tsc --noEmit` đạt. Vite build chưa hoàn tất do thiếu native binding `@rolldown/binding-linux-x64-gnu` tại môi trường Linux; kiểm tra trên máy Windows của bạn.

## Git

```bat
git status
git add server/src/server.js server/src/payos-link.js server/tests/payos-link.test.js client/src/pages/PublicPages.tsx client/src/components/Layout.tsx client/src/styles.css docs/COMMIT_10_QR_PAYOS_VA_MENU_QUAN_TRI.md
git commit -m "fix: recover PayOS QR safely and organize admin navigation"
git push origin main
git rev-list --count HEAD
```

Khi 9 Git commits trước đã được lưu, kết quả dự kiến: **10**.

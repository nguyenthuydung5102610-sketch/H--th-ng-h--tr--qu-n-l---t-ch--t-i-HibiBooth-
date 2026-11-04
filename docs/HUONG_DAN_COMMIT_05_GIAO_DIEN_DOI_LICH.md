# HIBIBOOTH-V5-PUBLIC — Commit 05: Giao diện yêu cầu và duyệt đổi lịch

## Nền tảng

Áp dụng sau Commit 02 (database), Commit 03 (API khách yêu cầu đổi lịch), Commit 04 (API nhân viên/chủ quán duyệt hoặc từ chối).
Không thay đổi/xóa chức năng check-in QR, hủy, hoàn tiền, thanh toán và gửi nhắc lịch hiện có.

## Màn hình triển khai

- `/tra-cuu`: khách xác minh mã đặt phòng + số điện thoại, xem lịch sử đổi lịch, gửi đề nghị ngày/giờ mới và lý do (ít nhất 5 ký tự). Chỉ đơn CONFIRMED + PAID mới được đề nghị. Chặn yêu cầu mới khi còn yêu cầu PENDING. Sau khi gửi, lịch cũ vẫn giữ nguyên. Khách có thể nhấn **Cập nhật trạng thái xét duyệt**. Khi đổi lịch được duyệt, tra cứu lại để lấy thông tin lịch mới và tạo link Google Calendar mới.
- `/nhan-vien/doi-lich`: nhân viên lọc, xem và xét duyệt yêu cầu bằng JWT/role EMPLOYEE.
- `/chu-quan/doi-lich`: chủ quán dùng cùng màn hình, JWT/role OWNER.
- Duyệt (APPROVE): hiển thị xác nhận và cảnh báo kiểm tra khung giờ; backend khóa/cập nhật dữ liệu và thông báo theo Commit 04.
- Từ chối (REJECT): bắt buộc lý do tối thiểu 5 ký tự; lịch cũ được giữ nguyên.
- Xử lý thất bại/409: hiển thị lỗi thật từ API, nạp lại danh sách; không tự hiển thị thành công hoặc suy đoán tình trạng phòng trống.

## Các file thay đổi (chỉ 4 file)

1. `client/src/pages/RescheduleManagementPage.tsx` — mới.
2. `client/src/pages/PublicPages.tsx` — mở rộng tra cứu.
3. `client/src/App.tsx` — bổ sung route nhân viên/chủ quán.
4. `client/src/components/Layout.tsx` — menu xét duyệt.

Ngoài ra kèm file hướng dẫn này.

## Cách cài đặt

1. Giải nén ZIP vào **đúng thư mục HIBIBOOTH-V5-PUBLIC đã áp dụng Commit 04**, ghi đè đúng các file cùng tên; không thay đổi `.env`, database, Docker volume.
2. Ở thư mục gốc, chạy `npm install` (nếu chưa cài dependencies), `npm run test:rules`, `npm run build`, `npm run dev`.
3. Dùng tài khoản nhân viên/chủ quán hiện có kiểm thử luồng thực; không chia sẻ mật khẩu/JWT.
4. Để thử: tạo đơn PAID/CONFIRMED trong môi trường kiểm thử → khách tra cứu → gửi đề nghị khác lịch cũ → xem PENDING → nhân viên/chủ quán duyệt hoặc từ chối → khách làm mới trạng thái và tra cứu lại thông tin đơn.
5. Thử các ngoại lệ: ngày/giờ quá gần, trùng lịch, lý do dưới 5 ký tự, sai số điện thoại, yêu cầu còn PENDING, yêu cầu đã được người khác duyệt, lỗi kết nối.

## Git

```
git add client/src/pages/RescheduleManagementPage.tsx client/src/pages/PublicPages.tsx client/src/App.tsx client/src/components/Layout.tsx docs/HUONG_DAN_COMMIT_05_GIAO_DIEN_DOI_LICH.md
git commit -m "Add customer and staff reschedule UI"
git push origin main
```

## Trạng thái kiểm thử

- Đã chạy `npm run test:rules`: 22/22 PASS (backend, không phải test UI).
- Chưa xác nhận build TypeScript/Vite: môi trường tạo ZIP không có đầy đủ React type dependencies và `npm install` bị timeout.
- Chưa thử thực tế PostgreSQL, trình duyệt, dịch vụ email/SMS; cần kiểm tra trên máy của người dùng.
- Đây là Commit 05 nối giao diện API đổi lịch, **không tuyên bố đã hoàn thiện tất cả nghiệp vụ BPMN khác**. Các luồng hủy/khách đến trễ/hoàn tiền cần đối chiếu riêng với BPMN.

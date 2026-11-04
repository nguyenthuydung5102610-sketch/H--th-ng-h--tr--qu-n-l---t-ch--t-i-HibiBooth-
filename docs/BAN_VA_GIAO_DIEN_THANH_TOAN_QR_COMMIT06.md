# HIBIBOOTH V5 – Bản vá giao diện thanh toán Commit 06

## Phạm vi

- Rút gọn trang thanh toán: bỏ các hộp mô tả nền xanh dương/xanh lá.
- Sửa trạng thái “Đang tải QR” kéo dài: có thời gian chờ tối đa 12 giây và báo lỗi có hướng dẫn, nút tải lại.
- Nếu chạy chế độ mô phỏng, không hiển thị một mã QR trông giống mã thanh toán thật.
- Giữ nguyên: mã đơn, tổng tiền, thời gian giữ chỗ, trạng thái đơn, nút tra cứu, QR check-in sau xác nhận.
- Backend hỗ trợ khôi phục QR của giao dịch payOS đã tạo nhưng chưa lưu xong vào cơ sở dữ liệu, sử dụng orderCode cũ; không âm thầm tạo giao dịch mới.
- KHÔNG giả mạo thanh toán thành công, không tự chuyển tiền, không làm thay đổi cấu hình dữ liệu.

## Cài đặt

1. Dừng `npm run dev` (`Ctrl+C`).
2. Sao lưu 3 file tương ứng trong dự án đang dùng.
3. Chép đè đúng theo cây thư mục:
    - `client/src/pages/PublicPages.tsx`
    - `client/src/styles.css`
    - `server/src/server.js`
4. Giữ nguyên `server/.env`, database và `node_modules`.
5. Ở thư mục gốc: chạy `npm run build` rồi `npm run dev`.
6. Truy cập cổng Vite hiện tại, nhấn `Ctrl+Shift+R`.

## Kiểm tra thanh toán

- `http://localhost:4000/api/health` cho biết `paymentMode` là `PAYOS` hay `DEMO_ONLY`.
- `DEMO_ONLY`: không có QR chuyển tiền thật; sử dụng thanh toán giả lập để kiểm thử.
- `PAYOS`: QR chỉ xuất hiện sau khi backend nhận dữ liệu hợp lệ từ payOS; nếu không có, trang báo lỗi thay vì tải mãi.
- Nếu payOS chưa kết nối được hoặc thông tin xác thực sai, bản vá KHÔNG thể tự tạo QR hợp lệ. Kiểm tra log backend, cấu hình payOS và trạng thái giao dịch trên payOS. Không thanh toán hoặc tạo lại đơn liên tục khi chưa xác nhận trạng thái giao dịch.

## Kiểm tra trong môi trường tạo bản vá

- Kiểm tra cú pháp JS backend: đạt.
- Kiểm tra cú pháp TypeScript/JSX: đạt.
- `npm run test:rules`: 25/25 bài kiểm thử đạt.
- Chưa xác minh được `npm run build` trong môi trường tạo bản vá, vì bản sao runtime thiếu `@types/react` và `@types/react-dom`. Cần chạy trên máy đã `npm install` đủ thư viện.
- Chưa kiểm thử tích hợp thanh toán payOS thực tế vì không có khóa dịch vụ/tài khoản thử nghiệm.

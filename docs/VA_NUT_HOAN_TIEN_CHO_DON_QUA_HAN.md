# HIBIBOOTH – Sửa điều kiện hiển thị và tạo yêu cầu hoàn tiền

## Quy tắc nghiệp vụ

- `CONFIRMED` + `PAID`, còn trong thời hạn check-in: **không hiển thị** nút **Hoàn tiền**.
- `CONFIRMED` + `PAID`, **quá 20 phút** sau giờ hẹn: hiển thị trạng thái hiển thị `Quá giờ check-in`, và nút **Hoàn tiền**.
- `NO_SHOW` + `PAID`: hiển thị **Hoàn tiền**.
- `EXPIRED` + `PAID`: hiển thị **Hoàn tiền** để nhân viên gửi đề nghị xét duyệt (tình huống ngoại lệ, cần đối soát tiền thực nhận).
- `CANCELLED` + `PAID`: giữ quyền tạo đề nghị hoàn tiền của quy trình hủy lịch.
- `EXPIRED` + `PENDING` hoặc các đơn **chưa thanh toán**: **không** hiển thị Hoàn tiền vì chưa có tiền được ghi nhận để hoàn.
- `CHECKED_IN`: không được gửi yêu cầu hoàn tiền theo quy trình quá giờ.
- Đơn đã có yêu cầu hoàn tiền đang xử lý/đã được duyệt: không hiển thị nút gửi trùng.

Các điều kiện tương tự được kiểm tra **trong API**, sau khi khóa bản ghi đơn và lấy thời gian từ PostgreSQL; không thể bỏ qua chỉ bằng việc gọi HTTP trực tiếp. Chủ quán mới được phép duyệt/từ chối; không tự chuyển tiền.

## File thay đổi

- `client/src/pages/StaffPages.tsx`: chỉ hiện nút khi API xác nhận đủ điều kiện; phân biệt trạng thái `Quá giờ check-in`.
- `server/src/server.js`: bổ sung tính toán điều kiện trả về trong danh sách và chặn ở API gửi đề nghị hoàn tiền.
- `server/src/staff-refund-rules.js`: hàm xác định điều kiện.
- `server/src/refund-assistance.js`: hỗ trợ tình huống đã thanh toán nhưng trạng thái EXPIRED.
- `server/tests/staff-refund-eligibility.test.js`: 12 bài kiểm thử mới.

## Cập nhật và kiểm tra

1. Sao lưu thư mục dự án đang chạy, dừng `npm run dev`.
2. Giải nén ZIP vào thư mục gốc `HIBIBOOTH-V5-PUBLIC`, ghi đè **đúng các file liệt kê**. Không thay đổi `.env` hay database.
3. Chạy:

```bash
npm run test:rules
npm run build
npm run dev
```

4. Đăng nhập nhân viên, mở **Quản lý đơn đặt phòng** và kiểm thử ít nhất:
   - Đơn xác nhận / đã thanh toán, chưa đến giờ: không có nút hoàn tiền.
   - Đơn xác nhận / đã thanh toán, quá giờ hẹn + 20 phút: có nút hoàn tiền.
   - Đơn đã ghi nhận khách không đến / đã thanh toán: có nút hoàn tiền.
   - Đơn hết hạn giữ chỗ / chưa thanh toán: không có nút hoàn tiền.
   - Đơn đã gửi yêu cầu hoàn tiền: không gửi trùng.
5. Nhân viên gửi yêu cầu với lý do và số tiền; chủ quán xét duyệt trong giao diện quản trị.

## Kết quả kiểm tra ở môi trường tạo bản vá

- Kiểm thử quy tắc Node.js: **198/198 PASS**.
- Kiểm tra TypeScript frontend `tsc --noEmit`: **PASS**.
- Build Vite: **chưa kiểm chứng**, do thư viện Rolldown trong node_modules có bản Windows, thiếu binary Linux cho môi trường tạo bản vá. Chạy `npm run build` trên máy Windows.
- PostgreSQL, các API thực tế và quy trình hoàn tiền chưa được kiểm thử tích hợp tại máy bạn.

## Lưu ý về lỗi payOS 502

Bản vá này **không khắc phục lỗi tạo QR payOS 502** từ ảnh trước. Đó là vấn đề khác, cần xem log backend và phản hồi của payOS; không nên xác nhận thanh toán hoặc tạo giao dịch giả để vượt lỗi.

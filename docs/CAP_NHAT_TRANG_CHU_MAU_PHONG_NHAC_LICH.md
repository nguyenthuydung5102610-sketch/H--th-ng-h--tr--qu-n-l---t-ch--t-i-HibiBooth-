# HIBI BOOTH – Giao diện rút gọn, màu phông và nhắc lịch (04/11/2026)

## Những thay đổi của bản này

1. Trang chủ: bỏ khối kêu gọi đặt lịch ở cuối trang và bỏ nút đặt lịch trùng trong băng slogan. Nút **Đặt lịch ngay** ở hero được giữ lại; các liên kết chọn gói vẫn dẫn đến trang đặt lịch.
2. Trong `/dat-lich`, danh sách phòng kiểu dropdown được thay bằng 4 thẻ có nền minh họa: đỏ, đen, trắng, xám; mỗi thẻ gồm tên màu, phong cách, dấu chọn và giữ nguyên mã `roomId` lấy từ API.
3. Chỉ thay đổi cách hiển thị/chọn phòng ở Frontend. Không thay đổi mã đặt phòng, dữ liệu hoặc quy tắc xử lý thanh toán payOS.
4. Chỉnh dòng giới thiệu SMS trong form để không tuyên bố chắc chắn khách sẽ nhận được tin nhắn khi nhà cung cấp SMS chưa bật.

## Nhắc lịch khách hàng: trạng thái thực tế

- **Đã có logic lên lịch:** `server/src/sms-reminders.js` có `scheduleBookingReminder`, được gọi khi đơn chuyển thành `CONFIRMED` / `PAID` qua demo, xác minh Webhook payOS hoặc đối soát API payOS.
- **Lưu ở PostgreSQL:** bảng `sms_reminders`, dự kiến gửi trước giờ chụp một tiếng; nếu đơn được đặt sát giờ thì lịch gửi tới hạn ngay khi được xác nhận.
- **Worker:** khi SMS được cấu hình, worker chạy mỗi 30 giây, kiểm tra trạng thái thanh toán và đơn, thử gửi qua API Twilio và có chính sách thử lại khi lỗi.
- **Chưa gửi SMS thật mặc định:** `server/.env.example` có `SMS_PROVIDER=disabled`. Chưa thiết lập Twilio, chưa kiểm thử gửi tới điện thoại Việt Nam và chưa cấu hình callback để xác nhận tin đã đến máy. `SUBMITTED` chỉ có nghĩa nhà cung cấp chấp nhận yêu cầu.
- **Không tự động bật SMS** trong bản này để tránh phát sinh phí hoặc gửi tin khi chưa được phép. Việc kích hoạt và đăng ký mẫu gửi cần tài khoản hợp lệ và người quản lý cửa hàng đồng ý.

## Chạy bản cập nhật

- Giải nén vào thư mục **mới**, sao chép `server/.env` từ bản đang sử dụng (giữ bí mật).
- **Không cần `db:init` hoặc `db:seed`** vì bản này chỉ thay Frontend và tài liệu.
- Tại thư mục gốc: `npm install` và `npm run dev`.
- Mở `http://localhost:5173/`, rồi `Ctrl+Shift+R`, vào `/dat-lich` để thử chọn một trong bốn phông.
- Bảng màu chỉ minh họa tông phông, không cam kết màu ảnh cuối cùng chính xác tuyệt đối (phụ thuộc ánh sáng/thiết bị).

## Đã kiểm tra

- `node --test server/tests/*.test.js`: **7/7** bài kiểm thử đạt.
- TypeScript `tsc --noEmit`: đạt.
- Chưa hoàn tất Vite build trong môi trường đóng gói do thiếu native binding của Rolldown. Hãy chạy `npm install` / `npm run dev` trên máy Windows để kiểm tra hiển thị thực tế.
- Không kiểm thử giao dịch payOS thật hoặc SMS thật trong lượt cập nhật này.

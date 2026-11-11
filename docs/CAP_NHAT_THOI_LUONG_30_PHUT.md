# HIBIBOOTH – Chuyển lượt chụp từ 60 phút xuống 30 phút

- Áp dụng **30 phút/lượt** cho đơn đặt mới. Giờ bắt đầu mỗi 30 phút từ **09:00 đến 22:30**; giờ đóng cửa vẫn 23:00.
- Các đơn có trước khi cập nhật CSDL **vẫn giữ thời lượng 60 phút** nhờ trường `bookings.duration_minutes`.
- Kiểm tra khung giờ trống và đổi lịch có xét khoảng thời gian thực của từng đơn; không đặt chồng lịch cũ.
- Email xác nhận, Google Calendar hiển thị theo thời lượng của đơn. Thời điểm gửi email **nhắc trước 60 phút** không thay đổi.
- Giá gói PHOTO4/PHOTO8 không thay đổi; mô tả gói chứa "60 phút sử dụng phòng" được cập nhật thành "30 phút sử dụng phòng".

## Thao tác cập nhật trên Windows

1. Sao lưu cơ sở dữ liệu PostgreSQL trước khi đổi cấu trúc. **Không xóa Docker volume hoặc chạy `db:seed`**.
2. Dừng `npm run dev` bằng Ctrl+C. Chép đè các file mới, giữ nguyên cấu hình `.env` và database hiện tại.
3. Bật Docker Desktop và PostgreSQL. Chạy `npm run db:init` để thêm trường thời lượng vào bảng bookings và cập nhật mô tả gói.
4. Chạy `npm run test:rules`, `npm run build`, `npm run dev`.
5. Kiểm tra trên cùng một phòng: đặt mới 09:00 và 09:30 phải được phép nếu không có đơn 60 phút cũ. Nếu có đơn cũ 09:00–10:00 thì 09:30 phải bị khóa.

### Lưu ý
Giữ 30 phút **đặt trước**, 20 phút **giữ chỗ**, 20 phút **check-in muộn** và 60 phút **nhắc lịch email** như cũ: chúng là các quy tắc độc lập với thời lượng chụp.

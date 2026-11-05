# HIBI BOOTH – Bản vá sau Commit 15: quá giờ check-in, yêu cầu xem xét hoàn tiền, đổi/hủy lịch

## Luồng nghiệp vụ

1. **Chưa thanh toán, quá thời gian giữ chỗ**: đơn EXPIRED; không được tạo yêu cầu hoàn tiền vì không có khoản thanh toán đã xác nhận.
2. **Đã thanh toán, quá 20 phút từ giờ chụp**: hiển thị **Quá giờ check-in** trên trang Tra cứu; QR check-in không còn được cấp. Khách có thể gửi **đề nghị xem xét hoàn tiền** với lý do dài 5–500 ký tự.
3. **Đã thanh toán, nhân viên ghi nhận NO_SHOW hoặc khách đã hủy đơn**: vẫn cho phép gửi đề nghị xem xét hoàn tiền. Hệ thống không tự hoàn tiền và không hứa chắc chắn được hoàn.
4. **Khách gửi đề nghị**: tạo duy nhất một bản ghi `customer_refund_assistance` cho mỗi đơn; hiển thị trạng thái đã tiếp nhận. Phải nhập đúng mã đặt phòng và số điện thoại khi gửi.
5. **Nhân viên**: tại Quản lý đơn, thấy danh sách đề nghị hoàn tiền từ khách và có thể kiểm tra trước khi chuyển sang luồng phê duyệt hoàn tiền hiện có.
6. **Chủ quán**: duyệt/từ chối đề nghị hoàn tiền qua bảng `refunds` hiện có. Không tự chuyển tiền thật.
7. **Đổi lịch**: sau khi API xác nhận thành công, UI cập nhật giờ mới ngay trước bước tra cứu xác nhận lại.
8. **Hủy lịch**: cập nhật trạng thái đã hủy ngay sau khi API thành công; không phụ thuộc việc API lịch sử tạm thời lỗi. Lý do hủy phải dài từ 5 đến 500 ký tự.

## Cài đặt

- Sao lưu PostgreSQL trước khi cập nhật schema.
- Giải nén bản vá và chép đè các file theo đường dẫn tương ứng vào dự án `HIBIBOOTH-V5-PUBLIC`. **Không đụng tới `server/.env`, Docker volume hay dữ liệu người dùng**.
- Dừng tiến trình `npm run dev` đang chạy, sau đó tại thư mục gốc:

```bash
npm run db:init
npm run test:rules
npm run build
npm run dev
```

`db:init` tạo bảng mới `customer_refund_assistance`; không chạy `db:seed` vì có thể ảnh hưởng dữ liệu demo và tài khoản đang dùng. Nếu `db:init` báo lỗi, không thực hiện các thay đổi CSDL thủ công trước khi xem thông báo lỗi.

## Kịch bản nghiệm thu

1. Đơn `CONFIRMED`/`PAID`: trước hoặc **đúng mốc +20 phút** không xuất hiện nút gửi đề nghị hoàn tiền do quá giờ.
2. Sau +20 phút, tải lại Tra cứu: thấy nhãn **Quá giờ check-in**, phần Hoàn tiền, và không thấy QR check-in hợp lệ.
3. Nhập lý do hợp lệ -> gửi: thông báo **đã tiếp nhận để xem xét**, không tự đổi thanh toán thành REFUNDED.
4. Gửi lại cùng mã/số điện thoại: backend trả 409, không tạo yêu cầu thứ hai.
5. Sai số điện thoại: backend không tiết lộ thông tin đơn; trả 404.
6. Lý do dưới 5 ký tự: nút bị vô hiệu và backend từ chối nếu cố gửi trực tiếp.
7. Đơn `EXPIRED`/`PENDING`: **không** hiển thị đề nghị hoàn tiền.
8. Đơn `NO_SHOW`/`PAID`: cho khách gửi đề nghị nếu chưa có yêu cầu.
9. Nhân viên đăng nhập, mở Quản lý đơn -> thấy đề nghị, có thể kiểm tra và gửi đề nghị hoàn tiền cho chủ quán.
10. Chủ quán duyệt hoặc từ chối theo quy trình hiện tại, không có chuyển tiền tự động.
11. Khách đổi lịch sang 17:00 -> trang tra cứu hiển thị 17:00 sau khi API xác nhận; tra cứu lại vẫn phải hiện 17:00.
12. Hủy lịch với lý do hợp lệ -> trang tra cứu cập nhật Đã hủy; không cần nhân viên/chủ quán duyệt hủy.

## Giới hạn kiểm thử ở môi trường xây dựng

Kiểm thử quy tắc nghiệp vụ và TypeScript đã chạy. Vite build không thể xác nhận ở môi trường Linux hiện tại vì thư viện Rolldown native tương thích bị thiếu. Việc tạo bảng bằng PostgreSQL và xác thực luồng từ trình duyệt tới nhân viên/chủ quán phải chạy trên máy triển khai của bạn.

**Không khẳng định người đến trễ mặc nhiên đủ điều kiện nhận tiền hoàn.** Đây chỉ là đề nghị để nhân viên đánh giá và chủ quán phê duyệt, căn cứ chính sách hoàn tiền của quán.

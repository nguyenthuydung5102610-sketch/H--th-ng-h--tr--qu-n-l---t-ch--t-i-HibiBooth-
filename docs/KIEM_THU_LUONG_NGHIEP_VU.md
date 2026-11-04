# HIBI BOOTH — Kiểm thử luồng đặt phòng, thanh toán và check-in

## Phạm vi bản cập nhật này

- Kiểm soát cấp QR check-in ở cả Backend và Frontend. Khách chỉ nhận QR khi **đã thanh toán** (`PAID`) và đơn **đang có hiệu lực** (`CONFIRMED` hoặc `CHECKED_IN`).
- Với đơn chưa thanh toán, trang Tra cứu chỉ hiện thông báo, **không phát hành QR check-in**.
- Bổ sung hàm kiểm tra trùng khung giờ 60 phút, thêm unit test cho lịch chồng lấn và quyền nhận QR.
- Cập nhật thông báo tạo đơn theo chế độ payOS thật / demo. Không sửa bảng dữ liệu, không xóa đơn, không can thiệp Docker.

## Cách chạy tại máy tính

1. Sao lưu thư mục dự án đang chạy và dữ liệu PostgreSQL trước khi cập nhật.
2. Giải nén bản ZIP vào **một thư mục mới**. Sao chép `server/.env` đang dùng vào `server/.env` bản mới; không đưa `.env` lên mạng hoặc gửi cho người khác.
3. Khởi động Docker/PostgreSQL có sẵn, rồi ở thư mục gốc chạy `npm install`, `npm run test:rules` và `npm run dev`.
4. Truy cập `http://localhost:5173`. Không chạy lại `db:seed`; không xóa volume Docker.
5. Kiểm tra API: `http://localhost:4000/api/health` phải trả về `ok: true`. Trường `paymentMode` cho biết chế độ thanh toán đang cấu hình, không phải bằng chứng giao dịch thật đã thành công.

## Bảng kiểm thử nghiệp vụ thủ công

| Mã | Kịch bản | Kết quả mong đợi |
| --- | --- | --- |
| TC01 | Khách chọn phòng, ngày, giờ, gói, tên và SĐT hợp lệ | Tạo đơn `PENDING_PAYMENT` và giữ phòng tối đa 20 phút |
| TC02 | Khách thử đặt cùng phòng 09:30 khi có đơn 09:00–10:00 | Từ chối trùng lịch; chọn 10:00 phải được phép nếu còn trống và đáp ứng điều kiện đặt trước |
| TC03 | Khách chọn giờ bắt đầu cách hiện tại dưới 30 phút | Từ chối tạo đơn |
| TC04 | Khách xem Tra cứu khi chưa thanh toán | Hiển thị trạng thái chờ; **không hiện QR check-in** |
| TC05 | Giao dịch payOS được Backend xác minh hợp lệ, đúng số tiền, đơn còn hạn | Đơn `CONFIRMED`, thanh toán `PAID`, xuất hiện dấu tích và QR check-in |
| TC06 | Khách nhập mã đơn đúng nhưng SĐT sai | Không trả về thông tin đặt phòng |
| TC07 | Nhân viên quét QR đơn `PENDING_PAYMENT` | Từ chối check-in |
| TC08 | Nhân viên check-in đơn `CONFIRMED/PAID` trong khung giờ hợp lệ | Check-in thành công một lần; lần thứ hai bị từ chối |
| TC09 | Check-in sau giờ đặt 20 phút 01 giây | Từ chối check-in (mốc 20 phút tròn vẫn hợp lệ) |
| TC10 | Đơn giữ chỗ quá 20 phút chưa thanh toán | Trạng thái hết hạn; phòng có thể được đặt lại |
| TC11 | payOS xác nhận tiền về sau khi đơn đã hết hạn | Không tự xác nhận phòng; đánh dấu cần đối soát |
| TC12 | Webhook cùng giao dịch gửi lặp lại | Không ghi nhận thanh toán trùng hoặc cấp phòng lặp |
| TC13 | Nhân viên tạo yêu cầu hoàn tiền; chủ quán phê duyệt | Thể hiện đúng trạng thái yêu cầu; **không tuyên bố tiền đã tự động hoàn** |
| TC14 | Nhân viên thử truy cập API dành cho chủ quán | Bị chặn bởi kiểm tra quyền Backend |
| TC15 | Chủ quán mở trang tổng quan | Không còn lỗi 404 ở `GET /api/owner/summary` |

**Để ghi nhận kết quả:** thực hiện từng TC, chụp màn hình trạng thái trên giao diện, ghi mã đơn và kết quả Đạt/Không đạt. Đừng chia sẻ khóa API hoặc dữ liệu thanh toán nhạy cảm trong ảnh.

## Kiểm thử tự động hiện có

Chạy `npm run test:rules` để kiểm tra các quy tắc: tên khách, mã đơn, ngày hợp lệ, đặt trước 30 phút, check-in ± thời gian cho phép, lịch chồng lấn 60 phút và điều kiện cấp QR.

Các unit test này **không thay thế** kiểm thử thực tế với PostgreSQL, payOS hoặc SMS. Với tài khoản thanh toán thật, chỉ nên chạy thử khi có sự cho phép của chủ tài khoản; không thực hiện nhiều giao dịch chỉ để thử giao diện.

## Giới hạn trước khi triển khai công khai

- Chưa hoàn tất kiểm thử giao dịch payOS đầu-cuối trong môi trường này.
- Webhook phải dùng URL HTTPS truy cập được công khai; máy local có thể dùng cơ chế đối soát qua Backend nhưng cần kiểm thử lỗi mạng, timeout và webhook gửi lặp.
- Chưa có SMS thật nếu chưa cấu hình nhà cung cấp; cảnh báo SMS chưa kích hoạt là bình thường.
- Cần kiểm tra bảo mật trước production: xác thực, phân quyền, token, rate limits, thông tin khách hàng, backup PostgreSQL, tài khoản demo và monitoring.

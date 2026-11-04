# HIBI BOOTH – Hướng dẫn cập nhật nghiệp vụ (04/11/2026)

## 1. Những gì đã sửa trong mã nguồn

- **Tên khách:** có ít nhất 2 chữ cái Unicode; cho phép dấu tiếng Việt, dấu cách và dấu nối; không nhận tên chỉ có số hoặc chứa số. Kiểm tra cả Frontend và Backend.
- **Thiếu thông tin:** form không tự chọn phòng/gói; khi chưa chọn ngày/phòng/giờ/gói hoặc chưa nhập tên/SĐT, hiển thị thông báo cụ thể `Vui lòng chọn/điền ...`.
- **Mã đơn mới:** `HB-[n][DDMMYYYY]`, `[n]` là số thứ tự đơn *được tạo trong ngày theo giờ Việt Nam*. VD đơn thứ **10** ngày **04/11/2006** → **HB-1004112006**. SQL dùng bộ đếm nguyên tử theo ngày để tránh trùng mã khi nhiều khách đặt đồng thời. Mã kiểu cũ vẫn tra cứu/check-in được.
- **Đặt trước 30 phút:** thời gian bắt đầu buổi chụp phải cách thời điểm tạo đơn ít nhất 30 phút. Kiểm tra ở API giờ trống và trước khi ghi đơn (cả lúc đã khóa phòng).
- **Giờ hoạt động:** 09:00–23:00 hằng ngày, lượt 60 phút, cách nhau 30 phút, slot bắt đầu cuối 22:00.
- **Check-in:** chỉ các đơn `CONFIRMED`/`PAID` mới được check-in; sớm tối đa 30 phút, trễ tối đa 20 phút. Ví dụ lịch 11:00: 11:04 hợp lệ, 11:20:00 hợp lệ, 11:20:01 từ chối. Đến trễ không tự hoàn tiền/hủy đơn.
- **Check-in QR dùng một lần:** nhân viên quét QR thì API check-in chạy luôn; nếu quét lại hoặc nhập lại mã đã check-in, trả về HTTP 409 với thông báo rõ `Đơn đã được check-in. Không thể quét hoặc nhập lại mã này.` Backend khóa bản ghi khi xử lý để tránh check-in đồng thời.
- **Giao diện:** phóng ảnh Polaroid và cho tràn nhẹ ra khỏi khung; tăng biểu tượng và tên HIBI; slogan `Book lịch liền tay, tới là chụp ngay.` đặt giữa hero và phần giới thiệu (không dồn hết vào đầu trang).
- **Nhắc lịch SMS:** ghi một lịch gửi theo mã đơn sau khi thanh toán được hệ thống xác nhận; hạn thông thường là 1 tiếng trước lịch. Nếu đặt sát giờ (30–59 phút trước), tin nhắn được đưa vào hàng đợi để gửi **ngay sau khi đơn xác nhận** (không thể gửi ngược thời gian). Nếu đơn bị hủy/chưa thanh toán thì không gửi.
- **Bảo mật tra cứu:** vì mã đơn có thứ tự và đoán được, tra cứu khách hàng cần **mã đơn + SĐT đã đăng ký**, không chỉ mã đơn. Quét QR của nhân viên vẫn dùng mã và yêu cầu đăng nhập quyền `EMPLOYEE`.

## 2. Cài bản sửa trên máy Windows KHÔNG mất dữ liệu

1. Sao lưu thư mục dự án hiện tại và backup PostgreSQL trước khi đổi: ví dụ trong CMD (nếu container tên `hibi-booth-db`):
   ```cmd
   docker exec -t hibi-booth-db pg_dump -U hibi_user -d hibi_booth > backup_hibi.sql
   ```
2. Giải nén bản ZIP mới vào một thư mục mới; không chép đè hết dự án cũ.
3. Sao chép **riêng** `server/.env` từ bản đang chạy sang `server/.env` trong dự án mới (không gửi file này cho người khác).
4. Docker Desktop phải chạy. Dùng lại container PostgreSQL cũ, tránh xung đột tên:
   ```cmd
   docker start hibi-booth-db
   ```
   Nếu container đang chạy, dòng này có thể báo đang chạy, không ảnh hưởng. **Không chạy** `docker compose up -d postgres` ở dự án mới nếu container cũ dùng tên đó.
5. Tại thư mục mới chạy:
   ```cmd
   npm install
   npm run db:init
   npm run dev
   ```
   `db:init` chỉ chạy các lệnh `CREATE TABLE IF NOT EXISTS` để thêm hai bảng mới `booking_daily_sequences` và `sms_reminders`, không xóa đơn/tài khoản cũ. **Không chạy `npm run db:seed`** vì có thể đặt lại mật khẩu tài khoản demo.
6. Mở http://localhost:5173 rồi bấm `Ctrl+Shift+R`.

### Lưu ý: giờ hiển thị và thời điểm kiểm thử

- Chọn giờ 11:00, check-in lúc 11:04 → **thành công** vì chưa quá 20 phút. Check-in **lúc 11:21** → từ chối.
- Nếu muốn thử check-in ngay, hãy dùng một đơn có giờ bắt đầu trong vòng 30 phút tới (nhưng việc tạo đơn mới phải diễn ra trước giờ bắt đầu ít nhất 30 phút). Có thể đợi đến đúng cửa sổ check-in; không nên sửa dữ liệu thật chỉ để kiểm thử.
- Đăng nhập vai trò nhân viên; quét QR lần một thành công; quét lại cùng mã báo **Đơn đã được check-in**, không ghi check-in lần thứ hai.
- Trong cùng một phòng, 09:00–10:00 sẽ khóa 09:30–10:30. Phòng khác không bị chặn.

## 3. Nhắc lịch SMS: cái gì đã chạy và cái gì chưa

Đã triển khai **hàng đợi và worker** (đọc bảng `sms_reminders` mỗi 30 giây, quản lý trạng thái, chống tạo trùng, tối đa 5 lần thử với lỗi gửi). Lịch nhắc được tạo khi demo thanh toán được xác nhận. Khi sau này tích hợp payOS thật, cần gọi `scheduleBookingReminder(client, bookingId)` **trong transaction xác thực Webhook thành công**.

**Mặc định `SMS_PROVIDER=disabled`**: Không có SMS thật nào được gửi và không phát sinh phí. Trong trang chủ quán có trạng thái nhắc lịch. Không dùng thông báo `SUBMITTED` để khẳng định thuê bao đã nhận được SMS — trạng thái này chỉ có nghĩa nhà cung cấp đã tiếp nhận yêu cầu gửi.

Ví dụ để dùng Twilio (chỉ sau khi đã có tài khoản dịch vụ hợp lệ, đăng ký sender/template và cấu hình phù hợp Việt Nam):

```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_secret_not_for_github
TWILIO_FROM=HIBIBOOTH
```

- Gửi đến số di động đã cung cấp, đổi `0...` thành `+84...`.
- `server/src/sms-reminders.js` chứa mã tích hợp HTTP API của Twilio và xử lý hàng đợi.
- Thông tin bí mật chỉ giữ trong `server/.env` hoặc Cloud Secret Manager; không lưu vào giao diện/GitHub.
- **Rất quan trọng tại Việt Nam:** Các mạng di động có quy định đăng ký trước Sender ID và mẫu tin, có thể từ chối SMS chưa đăng ký. Kiểm tra kỹ chi phí, các điều kiện và cơ chế đồng ý nhận thông báo trước khi gửi thật. Tham khảo hướng dẫn chính thức: https://www.twilio.com/en-us/guidelines/vn/sms
- SMS nhắc lịch khác với quảng cáo; dữ liệu khách dùng cho mục đích nhắc lịch và cần công khai trong giao diện/chính sách riêng tư.
- Dịch vụ báo tiếp nhận không bảo đảm điện thoại thực sự đã nhận; muốn theo dõi giao tận máy cần triển khai thêm delivery status callback.

## 4. Trạng thái giao dịch

Thanh toán vẫn là **mô phỏng**, không kết nối ngân hàng. QR demo không dùng để chuyển tiền. Tích hợp payOS thật theo `docs/PAYOS_INTEGRATION.md`, xác minh chữ ký và số tiền/mã đơn; chỉ sau xác nhận thật mới cập nhật đơn và tạo lịch SMS. Hoàn tiền thực tế chưa tự chuyển — chủ quán chỉ phê duyệt.

## 5. Cách kiểm thử nhanh trên máy và trong Terminal

```cmd
node --test server/tests/business-rules.test.js
npm run dev
```

Bộ kiểm thử độc lập bao gồm tên chỉ chứa số, mã HB theo thứ tự/ngày, thời gian đặt trước 30 phút và cửa sổ check-in. Để kiểm tra thực tế PostgreSQL/QR/SMS phải khởi động hệ thống và thử từng kịch bản; mã nguồn này không bảo đảm đã kiểm thử end-to-end trên máy Windows của bạn.

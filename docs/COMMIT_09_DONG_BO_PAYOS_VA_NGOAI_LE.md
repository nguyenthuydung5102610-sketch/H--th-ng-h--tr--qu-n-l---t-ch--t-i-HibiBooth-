# HIBIBOOTH – GIT COMMIT 09

## Phạm vi
Đồng bộ trạng thái thanh toán payOS và đơn đặt phòng một lần duy nhất từ **hai kênh đáng tin cậy**: webhook đã xác thực chữ ký và API server-to-server truy vấn payOS. Khách hàng không thể tự đánh dấu đơn thành công qua frontend/redirect.

### Thành phần sửa đổi
- `server/src/payos-sync.js` (mới): dùng chung một luồng giao dịch cho webhook/đối soát.
- `server/src/server.js`: dùng cùng hàm xử lý thanh toán, chặn mã đơn nhận về từ payOS không khớp; thêm API chủ quán.
- `server/sql/schema.sql`: bảng `payment_reconciliation_cases` lưu trường hợp sai tiền hoặc chuyển tiền quá hạn.
- `client/src/pages/OwnerPages.tsx`: chủ quán xem các trường hợp cần kiểm tra trên trang tổng quan.
- `server/tests/payos-sync.test.js` (mới): kiểm thử trạng thái, thời điểm hết hạn, lỗi DB và xử lý lặp.

### Quy tắc nghiệp vụ
1. **Thanh toán hợp lệ**: đã xác thực qua payOS; mã `orderCode` và `amount` phải trùng bản ghi CSDL; đơn đang `PENDING_PAYMENT`, `payment_status=PENDING`, còn thời hạn giữ chỗ **theo đồng hồ PostgreSQL**. Hệ thống cập nhật `CONFIRMED/PAID`, ghi `VERIFIED`, thêm thông báo email vào hàng đợi trong **cùng giao dịch**.
2. **Gửi lại webhook hoặc nhấn đối soát liên tiếp**: booking được khóa `FOR UPDATE`, giao dịch ghi event với UNIQUE `(provider, provider_event_id)`, không xác nhận hai lần, không tạo email trùng.
3. **Sai số tiền**: không cập nhật đặt phòng; ghi `payment_events=AMOUNT_MISMATCH`, thêm vào `payment_reconciliation_cases` để chủ quán kiểm tra.
4. **Thanh toán đến muộn, đơn hủy hoặc không còn hợp lệ**: ghi `REVIEW_REQUIRED` và trường hợp đối soát; không tự khôi phục phòng/chỗ giữ; không tự hoàn tiền.
5. **Mất kết nối hoặc lỗi DB**: rollback toàn bộ giao dịch để retry an toàn. Không thông báo thanh toán thành công nếu chưa commit.
6. **Webhook không hợp lệ**: từ chối chữ ký sai. Kết quả không thành công từ payOS không xác nhận đặt phòng. payOS có thể gửi sự kiện mẫu khi cài đặt webhook; mã không tồn tại được xác nhận nhận (HTTP 200) nhưng không cấp phòng.
7. **Đơn đã trả tiền nhưng sau đó hủy**: không chuyển lại sang `CONFIRMED` chỉ vì nhận thêm thông báo thanh toán cũ.
8. **Tách bạch tiền thật và demo**: giữ nguyên cấu hình demo local; không sử dụng nút giả lập để xác nhận giao dịch payOS.

## Cài đặt
1. Sao lưu cơ sở dữ liệu hiện tại. Dừng `npm run dev` trước khi sao chép file.
2. Giải nén ZIP vào thư mục `HIBIBOOTH-V5-PUBLIC`, **giữ nguyên `server/.env`**.
3. Chạy theo thứ tự:

```bash
npm run db:init
npm run test:rules
npm run build
npm run dev
```

4. Mở trang chủ quán > Tổng quan để thấy danh sách giao dịch cần đối soát khi có bản ghi `OPEN`.
5. Lưu commit sau khi kiểm thử thành công. Không commit file `.env`, API key hay password.

## Ma trận kiểm thử tích hợp đề xuất (cần môi trường PostgreSQL & payOS)
| ID | Kịch bản | Kết quả mong đợi |
|----|----------|-----------------|
| P09-01 | Thanh toán đủ tiền trong hạn | Booking `CONFIRMED`, payment `PAID`, một event `VERIFIED`, email chờ gửi |
| P09-02 | Webhook lặp 3 lần | Chỉ một lần chuyển trạng thái; không tạo email xác nhận trùng |
| P09-03 | Poll reconcile đồng thời webhook | Kết quả xác nhận tối đa 1 lần; không có hai event `VERIFIED` cho cùng một booking |
| P09-04 | Số tiền payOS khác giá đặt | Booking không đổi; xuất hiện `AMOUNT_MISMATCH` trên dashboard chủ quán |
| P09-05 | payOS trả về orderCode khác yêu cầu | API 409, không thay đổi trạng thái bất kỳ booking nào |
| P09-06 | Thanh toán vào đúng ranh giới 20 phút | Nếu hết hạn theo DB, không cấp phòng, tạo review |
| P09-07 | Webhook đến sau khi worker hết hạn đơn | Không khôi phục phòng, trả acknowledgement và lưu review |
| P09-08 | Đơn đã hủy nhận webhook cũ | Không tự tái xác nhận đặt phòng |
| P09-09 | Webhook chữ ký sai | HTTP 400, dữ liệu giữ nguyên |
| P09-10 | Lỗi DB khi ghi `payment_events` | Rollback, có thể retry khi DB phục hồi |
| P09-11 | Lỗi DB lúc xếp hàng email | Rollback, không có đơn `PAID` giả |
| P09-12 | Nhân viên không phải OWNER truy cập `/api/owner/payment-reviews` | Bị từ chối bởi kiểm tra role |
| P09-13 | Không cấu hình payOS | Chế độ demo không phát sinh tiền thật |

## Giới hạn kiểm thử
- Unit tests dùng FakeDb mô phỏng lệnh giao dịch, **chưa phải kiểm thử tích hợp PostgreSQL thực**, webhook payOS thực hay chuyển tiền thật.
- Trong môi trường tạo ZIP, TypeScript và `node --check` đã chạy thành công. Nếu `npm run build` trên Linux không chạy vì `@rolldown` native binding Windows, cần build trên Windows của người dùng; không được coi là lỗi code khi mới thiếu native dependency.
- Những giao dịch cần đối soát chỉ hiển thị read-only trong Commit 09; quy trình kết luận/hoàn tiền thực hiện thủ công và sẽ được triển khai riêng, **không tự động chuyển tiền**.

### Tài liệu SDK payOS
- https://payos.vn/docs/sdks/back-end/node/
- https://payos.vn/docs/du-lieu-tra-ve/webhook/

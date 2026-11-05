# HIBIBOOTH – GIT Commit 12: đối chiếu và xác nhận check-in

## Mục tiêu

- Quét mã QR `HIBI|HB-...` hoặc nhập mã đặt phòng `HB-...` để **xem trước** thông tin; không tự check-in sau khi quét.
- Nhân viên xác nhận thủ công sau khi đối chiếu khách, phòng và giờ.
- Chỉ cho check-in đơn `CONFIRMED` + thanh toán `PAID`, trong cửa sổ 30 phút trước đến 20 phút sau giờ đặt.
- Khóa bản ghi và kiểm tra lại trong transaction để ngăn hai nhân viên check-in cùng đơn.
- Bổ sung unit test ngoại lệ (đầu vào QR lạ, không tồn tại, thanh toán chưa thành công, đã check-in, hết giờ, database lỗi, audit lỗi).

## Cấu trúc file thay đổi

- `server/src/checkin-rules.js`: xử lý QR, điều kiện, cập nhật transaction.
- `server/src/server.js`: API GET `/api/staff/check-in/preview/:code`, nâng cấp API POST `/api/staff/check-in/:code`.
- `server/tests/checkin-flow.test.js`: kiểm thử các trường hợp bình thường và lỗi.
- `client/src/pages/StaffPages.tsx`: quét QR -> đối chiếu -> xác nhận; nút ở danh sách đơn đòi xác nhận.
- `client/src/styles.css`: bảng xem trước.

**Không sửa database. Không sửa cấu hình `.env`.** Chỉ dùng cho hệ thống đã áp dụng các phiên bản đến bản vá PostgreSQL 42P18; không yêu cầu cài bản phân quyền chủ quán bị bỏ qua.

## Các bước kiểm thử thủ công trên máy Windows

1. Chạy `npm run test:rules` và `npm run build`, cả hai phải thành công.
2. Chạy `npm run dev`; đăng nhập bằng nhân viên.
3. Vào **Check-in QR**, nhập mã đơn đã thanh toán và được xác nhận; nhấn **Kiểm tra đơn**. Màn hình phải hiển thị khách, phòng, gói, ngày/giờ. Đơn chưa được cập nhật.
4. Nhấn **Xác nhận check-in**. Chỉ lúc này mới chuyển sang `CHECKED_IN`. Kiểm tra nhật ký có người thực hiện.
5. Nhập lại cùng mã: hệ thống báo đã check-in và không có nút xác nhận.
6. Quét QR bất kỳ không phải mã HIBIBOOTH, ví dụ QR thanh toán: hệ thống phải từ chối.
7. Thử mã không tồn tại, đơn chưa thanh toán, đơn đã hủy/hết hạn: từ chối.
8. Thử trước giờ 31 phút, trước 30 phút, sau giờ 20 phút, sau 21 phút để kiểm tra ranh giới.
9. Mở 2 trình duyệt/tài khoản nhân viên, cùng tra cứu một đơn; bấm xác nhận liên tiếp: chỉ lần đầu thành công.
10. Thử ngắt kết nối database khi gửi: không báo thành công sai; khôi phục kết nối và kiểm tra trạng thái thực tế trước khi thử lại.

## Giới hạn và lưu ý

- Unit test được chạy bằng mock database và kiểm tra luồng khóa/cập nhật/ghi audit. Chưa thay thế được kiểm thử tích hợp thực tế với PostgreSQL.
- Không chỉnh sửa luồng xử lý khách đến trễ: quá 20 phút sẽ từ chối check-in thường; cần quy trình riêng ở commit tiếp theo.
- Check-in vẫn yêu cầu nhân viên đăng nhập. Không thể sử dụng QR này như mã thanh toán.

## Lệnh commit sau khi test thành công

```bash
git add server/src/checkin-rules.js server/src/server.js server/tests/checkin-flow.test.js client/src/pages/StaffPages.tsx client/src/styles.css docs/COMMIT_12_CHECKIN_QR_CO_XAC_NHAN.md
git commit -m "feat: verify booking before QR check-in and handle duplicate scans"
git push origin main
git rev-list --count HEAD
```

Lưu ý: Nếu Git của bạn đang có 11 commit, tạo commit này thành công thì tổng cộng sẽ là 12. Những file `hold-expiration.js` và test của nó có thay đổi chưa stage không bị đưa vào commit này vì đã liệt kê chính xác đường dẫn cho `git add`.

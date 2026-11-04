# HIBIBOOTH · Git Commit 07 — Ngoại lệ hủy đơn

## Phạm vi

- Đơn giữ chỗ chưa thanh toán: hủy ngay **chỉ khi thời hạn giữ chỗ còn hiệu lực**.
- Đơn đã thanh toán: khách gửi yêu cầu; nhân viên/chủ quán quyết định; chỉ tạo yêu cầu hoàn tiền chứ **không tự chuyển tiền**.
- Khi hai yêu cầu đến đồng thời, backend khóa phòng rồi khóa đơn và CSDL chỉ cho phép một yêu cầu đang chờ.
- Hệ thống từ chối xét duyệt lại, xét duyệt đơn thay đổi trạng thái và xét duyệt hủy khi có đề nghị đổi lịch đang chờ.
- API từ chối sai định dạng, yêu cầu trùng, lý do sai kiểu dữ liệu và lý do từ chối quá ngắn.
- Nếu lưu thành công nhưng tải trạng thái thất bại, frontend khuyên khách **không gửi lại** để tránh trùng yêu cầu.
- Nếu lỗi ở thao tác SQL, giao dịch rollback, không ghi dở trạng thái hủy hoặc yêu cầu hoàn tiền.

## Kiểm thử tự động
`npm run test:rules` kiểm thử các hàm quy tắc, bao gồm trạng thái, hạn giữ chỗ, đầu vào bất thường, duyệt trùng, dữ liệu thay đổi và rollback khi lỗi.

## Kiểm thử tích hợp cần chạy trên máy có PostgreSQL
1. Tạo giữ chỗ chưa trả tiền: hủy thành công -> status CANCELLED, phòng có thể đặt lại.
2. Tạo giữ chỗ đã quá 20 phút: API trả 409 HOLD_EXPIRED -> status EXPIRED.
3. Đơn đã thanh toán: gửi yêu cầu -> PENDING, giữ phòng, không tạo refund.
4. Gửi lại cùng mã và số điện thoại -> 409, chỉ một yêu cầu PENDING.
5. Nhân viên duyệt -> CANCELLED, refund PENDING_APPROVAL, KHÔNG chuyển tiền.
6. Nhân viên khác duyệt tiếp -> 409; chỉ một refund được tạo.
7. Từ chối -> booking giữ CONFIRMED/PAID; lý do từ chối hiện với khách.
8. Thay trạng thái đơn thành CHECKED_IN trước khi duyệt -> 409, không hủy.
9. Khi có yêu cầu đổi lịch PENDING, không cho duyệt hủy.
10. Tắt PostgreSQL thử thao tác -> API trả lỗi, sau khi bật lại xác nhận không có thay đổi nửa chừng.
11. Đăng nhập vai trò không hợp lệ hoặc chưa đăng nhập -> 401/403.
12. Thử JSON reason là object/array hoặc decisionReason sai kiểu -> 400.

> Không khẳng định các ca kiểm thử PostgreSQL/payOS đã chạy nếu chưa thực hiện trên máy có dịch vụ thật. Không sửa file `.env`, không dùng `db:seed` trên dữ liệu thật.

## Thao tác Git
```
npm run test:rules
npm run build
git status
git add server/src/cancellation-rules.js server/src/server.js server/tests/cancellation-exceptions.test.js client/src/pages/PublicPages.tsx client/src/pages/CancellationManagementPage.tsx docs/COMMIT_07_XU_LY_NGOAI_LE_HUY_DON.md
git commit -m "fix: handle cancellation exceptions and stale requests"
git push origin main
git rev-list --count HEAD
```

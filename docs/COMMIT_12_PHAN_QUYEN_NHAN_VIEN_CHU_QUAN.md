# HIBIBOOTH — Git Commit 12: Phân quyền xử lý yêu cầu và nhật ký

## Mục tiêu

- **Nhân viên (EMPLOYEE)**: xem và xét duyệt yêu cầu đổi lịch, hủy đặt phòng; chịu trách nhiệm xử lý và được ghi nhận trong nhật ký.
- **Chủ quán (OWNER)**: không thực hiện duyệt đổi lịch/hủy đơn; trong nhóm **Phê duyệt** chỉ còn **Phê duyệt hoàn tiền**. Chủ quán vẫn được theo dõi đơn, nhân sự và **Nhật ký hệ thống** theo vai trò quản trị.
- Gỡ route `/chu-quan/doi-lich`, `/chu-quan/huy-lich`; chặn cả API GET/PATCH đổi lịch và hủy đơn đối với token OWNER (403). Nhân viên vẫn được thao tác bình thường.

## Các file thay đổi

1. `client/src/components/Layout.tsx`: bỏ hai mục phê duyệt đổi lịch/hủy đơn khỏi menu OWNER, đổi nhãn hoàn tiền.
2. `client/src/App.tsx`: bỏ route xử lý đổi lịch/hủy đơn của chủ quán; giữ nguyên route nhân viên.
3. `client/src/pages/OwnerPages.tsx`: bổ sung tra cứu nhật ký theo nhân viên/email/mã đặt phòng; hiển thị tên, loại tài khoản, email, hành động tiếng Việt; có ID tài khoản dự phòng nếu tên không còn.
4. `server/src/server.js`: bốn API quản lý yêu cầu chỉ cho EMPLOYEE, kiểm tra lại trạng thái/role tài khoản trong DB khi quyết định; API nhật ký trả actor ID/email/role.
5. `server/tests/commit12-permissions.test.js`: thêm 11 kiểm thử phân quyền, route, audit.

## Kiểm thử đã chạy trong môi trường tạo patch

- `npm run test:rules`: **105/105 đạt** (bao gồm 11 test Commit 12).
- `node --check server/src/server.js`: đạt.
- `tsc --noEmit`: đạt.
- Vite production build: **chưa xác nhận trong môi trường tạo patch** vì thiếu binary Rolldown cho Linux. Chạy `npm run build` trên máy Windows của bạn.
- Chưa kiểm thử tích hợp API/PostgreSQL với tài khoản đang đăng nhập thật.

## Kiểm thử thủ công trên máy của bạn

1. Khởi động: `npm run test:rules`, `npm run build`, `npm run dev`.
2. Đăng nhập **Chủ quán**: menu PHÊ DUYỆT chỉ có **Phê duyệt hoàn tiền**; menu QUẢN TRỊ vẫn có **Nhật ký hệ thống**.
3. Truy cập URL `/chu-quan/doi-lich` hoặc `/chu-quan/huy-lich`: không còn trang duyệt.
4. Dùng token OWNER để gọi `GET /api/management/reschedule-requests`, `GET /api/management/cancellation-requests`, `PATCH /api/management/reschedule-requests/:id/decision`, `PATCH /api/management/cancellation-requests/:id/decision` — phải trả HTTP **403** (không thay đổi dữ liệu).
5. Đăng nhập **Nhân viên**: vẫn thấy 2 menu xử lý và được duyệt/từ chối khi nghiệp vụ hợp lệ.
6. Duyệt hoặc từ chối một yêu cầu bằng tài khoản nhân viên rồi vào Chủ quán → Nhật ký hệ thống: xem tên nhân viên, email, thời gian và mã đơn.
7. Kiểm tra quyền phê duyệt hoàn tiền của chủ quán vẫn hoạt động; nhân viên không được truy cập API quyết định hoàn tiền.
8. Kiểm tra tài khoản nhân viên bị khóa sau khi phát hành JWT không duyệt được (middleware đối chiếu trạng thái trong DB).

Lưu ý: 11 test mới kiểm tra middleware, wiring route và ghi audit ở mức đơn vị/source; **không thay thế kiểm thử HTTP tích hợp với database**.

## Cập nhật file và lưu Git

Giải nén ZIP và chép đúng đường dẫn, giữ nguyên `.env` và database. Không cần `db:seed` hoặc chạy migration.

```bash
npm run test:rules
npm run build
git status
git add client/src/components/Layout.tsx client/src/App.tsx client/src/pages/OwnerPages.tsx server/src/server.js server/tests/commit12-permissions.test.js docs/COMMIT_12_PHAN_QUYEN_NHAN_VIEN_CHU_QUAN.md
git commit -m "refactor: restrict booking change approvals to staff and improve owner audit"
git push origin main
git rev-list --count HEAD
```

Nếu đã có 11 commit Git thực tế, sau lệnh commit thành công kết quả sẽ là **12**. Không commit nếu các lệnh kiểm thử/build trên máy chưa đạt.

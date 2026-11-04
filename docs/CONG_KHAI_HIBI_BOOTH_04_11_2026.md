# HIBI BOOTH – Hướng dẫn công khai an toàn (04/11/2026)

## Tình trạng hiện tại

Đây là bản **triển khai xem trước công khai** dựa trên bản Email + Google Calendar (04/11). Mặc định khi `NODE_ENV=production` và `ENABLE_PUBLIC_BOOKINGS=false`, khách chỉ xem website; Backend **không tiếp nhận tạo đơn hoặc thanh toán mới**. Không được khẳng định đây là một hệ thống thu tiền thật đã được kiểm thử production.

**Chưa thực hiện:** kết nối vào tài khoản GitHub/Vercel/Render/Neon của bạn, tạo tên miền thật, thử chuyển khoản, gửi email thật, hoặc kiểm toán bảo mật chuyên nghiệp. Không có URL thật được cấp trong gói mã nguồn.

### Những gì đã gia cố

- Chặn mật khẩu JWT mẫu/yếu và cấu hình HTTP khi chạy `NODE_ENV=production`.
- Không cho phép bật chế độ thanh toán giả lập trên production.
- Muốn bật `ENABLE_PUBLIC_BOOKINGS=true` phải đủ cấu hình payOS và email Resend.
- API trạng thái/tạo/đối soát thanh toán yêu cầu đồng thời mã đặt phòng **và số điện thoại đã đặt** (header `X-Booking-Phone`); tăng rate limit.
- Xác thực tài khoản nhân viên/chủ quán dựa vào trạng thái và vai trò **đang lưu trên database** ở mỗi request, nên tài khoản bị khóa không thể tiếp tục thao tác chỉ bằng token cũ.
- API nhận webhook có thể trả `200` cho webhook mẫu đã xác minh chữ ký nhưng không khớp đơn, để hỗ trợ đăng ký webhook payOS.
- Chặn `db:seed` mật khẩu demo trên production; thêm script khởi tạo dữ liệu catalog/owner lần đầu bằng biến môi trường.
- Cấu hình SPA rewrite của Vercel để truy cập trực tiếp `/dat-lich`, `/tra-cuu`, `/nhan-vien` không bị 404.
- Tắt nhận đặt phòng ở Backend trong giai đoạn giới thiệu. Frontend hiện thông báo chưa mở đặt lịch.

## Kiến trúc

| Dịch vụ | Vai trò | Cấu hình |
| --- | --- | --- |
| GitHub | Lưu mã nguồn riêng tư | Repo **Private**, KHÔNG commit `server/.env`, mật khẩu, key |
| Vercel | React/Vite Frontend | HTTPS domain `...vercel.app`, biến `VITE_API_URL` trỏ tới Render API |
| Render (Web Service, Node) | Express API, webhook payOS và worker email | `NODE_ENV=production`, `CLIENT_ORIGIN`, `PUBLIC_BASE_URL`, PostgreSQL, JWT |
| Neon PostgreSQL | Database online, riêng với Docker máy bạn | `DATABASE_URL` từ Neon, SSL/TLS theo hướng dẫn Neon |
| payOS | Tạo yêu cầu thanh toán và webhook | Cấu hình URL webhook sau khi Render live; KHÔNG mở thu tiền trước kiểm thử |
| Resend | Gửi email xác nhận và nhắc lịch | Cần API key, domain đã xác minh và Backend luôn hoạt động |

## Trình tự triển khai công khai – bản xem trước, chưa nhận thanh toán

### 1) Lưu và đẩy mã nguồn lên GitHub

Giải nén ZIP vào một folder riêng. Giữ repo Private. **Không sao chép `server/.env` vào repo**. Gói này không chứa khóa thật. Kiểm tra với `git status` trước khi push.

### 2) Tạo database mới trên Neon

Tạo project Postgres và copy connection string (có `sslmode=require`) vào **Render Environment** dưới tên `DATABASE_URL`. Không đưa chuỗi này lên GitHub, Vercel hoặc frontend. Không dùng lại database Docker đang chứa dữ liệu demo.

### 3) Triển khai Vercel

- Import repository GitHub.
- Root directory: **để trống** (root monorepo); Framework Preset: Vite nếu Vercel nhận dạng được.
- Install Command: `npm ci`
- Build Command: `npm run build -w client`
- Output Directory: `client/dist`
- Environment Variable `VITE_API_URL`: tạm điền `https://TEN-BACKEND.onrender.com/api` rồi cập nhật sau khi có URL Render thật.
- Có file `vercel.json` ở root để làm SPA rewrite.
- Sau khi deploy xong, lấy URL HTTPS thật do Vercel cấp.

### 4) Triển khai Render

- New Web Service -> Connect same private GitHub repository; runtime Node.js.
- Root Directory: **để trống** (repository root).
- Build Command: `npm ci`
- Start Command: `npm run db:init -w server && npm run db:setup:production -w server && npm start -w server`
- Health Check Path: `/api/health`.
- Đặt environment variables trong Render Dashboard, KHÔNG viết trực tiếp trong Git:

```
NODE_ENV=production
CLIENT_ORIGIN=https://YOUR-VERCEL-URL.vercel.app
PUBLIC_BASE_URL=https://YOUR-VERCEL-URL.vercel.app
DATABASE_URL=postgresql://...  # Neon connection string, điền trong Dashboard
JWT_SECRET=<chuỗi ngẫu nhiên ít nhất 32 ký tự>
JWT_EXPIRES_IN=2h
ENABLE_DEMO_PAYMENT=false
ENABLE_PUBLIC_BOOKINGS=false
EMAIL_PROVIDER=disabled
OWNER_EMAIL=<email quản trị thật>
OWNER_PASSWORD=<mật khẩu riêng, >=16 ký tự>
OWNER_NAME=<tên chủ quán>
```

Lần chạy đầu `db:init` tạo bảng, `db:setup:production` tạo các phòng, gói và owner an toàn. Lần chạy sau sẽ không đặt lại password owner. Nếu database có tài khoản demo `owner@hibibooth.local` / `staff@hibibooth.local`, script **từ chối** khởi chạy để tránh công khai tài khoản mẫu. Sau khi owner được tạo, có thể xóa `OWNER_PASSWORD` khỏi Render Environment (lệnh setup sẽ bỏ qua khi owner đã tồn tại).

**Quan trọng**: Render Free web service tự ngủ nếu không có yêu cầu; worker nhắc email không đáng tin cậy nếu máy chủ ngủ. Để nhận đặt phòng và nhắc giờ thực sự, dùng dịch vụ chạy liên tục (ví dụ Render paid) hoặc chuyển worker nhắc lịch sang scheduled worker/cron chạy độc lập.

### 5) Hoàn tất kết nối frontend/backend

Copy domain API HTTPS thật của Render (VD `https://YOUR-ACTUAL-BACKEND.onrender.com/api`) vào Vercel Environment Variable `VITE_API_URL`; Deploy lại Vercel. Mở trang chủ và `/dat-lich`: trang đặt lịch phải thông báo chưa mở nhận đặt phòng. `https://YOUR-ACTUAL-BACKEND.onrender.com/api/health` trả JSON `ok: true`. Đăng nhập bằng owner đã tạo, không phải tài khoản demo.

## Chỉ mở nhận đơn và thanh toán thật khi đã qua checklist

1. Có dữ liệu phòng, gói và giá thật; cập nhật tên địa điểm, chính sách hủy/hoàn và thông tin liên hệ của quán. Có chính sách dữ liệu cá nhân phù hợp khi thu thập họ tên, email và số điện thoại.
2. Kết nối payOS đã được kích hoạt hợp lệ (nếu tài khoản cần người đại diện hợp pháp quản lý, người đó thực hiện các bước xác minh và cấu hình tài chính). Thêm `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` **chỉ trong Render Environment**.
3. Đăng ký Webhook HTTPS `https://YOUR-ACTUAL-BACKEND.onrender.com/api/payos/webhook` ở payOS, kiểm tra webhook đã được xác thực.
4. Thêm `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` trên Render; email gửi từ domain đã xác minh. Đảm bảo worker chạy liên tục (không dùng Render Free để hứa nhắc giờ chuẩn xác).
5. Kiểm thử nhiều trường hợp: thanh toán thành công, chưa thanh toán, sai tiền, webhook trùng, thanh toán chậm sau 20 phút, đặt trùng phòng, check-in một lần, hoàn tiền (duyệt **không đồng nghĩa** chuyển tiền thật), quyền nhân viên/chủ quán. Kiểm thử với tài khoản/giao dịch được chủ tài khoản cho phép, không chuyển tiền chỉ để thử nếu chưa sẵn sàng đối soát.
6. Trước khi cho khách thật: rà soát rủi ro còn lại, đặc biệt JWT trong `localStorage` (nên chuyển sang cookie HttpOnly), đăng nhập/khôi phục tài khoản, rate limiting bằng store dùng chung, logging và sao lưu database. Đối soát tiền chuyển khoản với đơn đặt.
7. Chỉ khi toàn bộ đạt, đổi `ENABLE_PUBLIC_BOOKINGS=true` trên Render và deploy lại. Khi đó khách mới có thể tạo đơn và thanh toán. Không nên bật biến này chỉ để bỏ thông báo bản xem trước.

## Lưu ý dữ liệu / vận hành

- Không dùng `docker compose down -v`, không chạy `db:seed` trên production.
- Không commit `.env` của Backend, URL Neon có mật khẩu, payOS API Key, payOS Checksum Key hay Resend key.
- `VITE_API_URL` xuất hiện trong mã JavaScript frontend **không phải khóa bí mật**; nó chỉ là địa chỉ Backend HTTPS.
- `SUBMITTED` của email nghĩa là nhà cung cấp đã nhận yêu cầu, **không phải** chắc chắn người dùng đã thấy trong hộp thư.
- Việc trang payOS hiển thị thành công hoặc khách quay lại URL không phải bằng chứng thanh toán: chỉ tin trạng thái được Backend xác minh.

## Tham khảo chính thức

- Vercel Vite & SPA: https://vercel.com/docs/frameworks/frontend/vite
- Render Node deployment: https://render.com/docs/your-first-deploy
- Render Free service: https://render.com/docs/faq
- Neon connection string: https://neon.com/docs/connect/connect-from-any-app
- payOS Node SDK: https://payos.vn/docs/sdks/back-end/node/
- payOS webhook: https://payos.vn/docs/api/

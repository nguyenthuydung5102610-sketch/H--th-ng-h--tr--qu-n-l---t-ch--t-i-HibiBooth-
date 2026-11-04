# Kết quả kiểm tra mã nguồn Email + Google Calendar – 04/11/2026

- Đã chạy `npm run test:rules`: 12/12 bài kiểm thử đạt, gồm gửi email qua Resend **giả lập bằng mock HTTP**, kiểm tra chống gửi trùng, tạo Google Calendar đúng giờ Việt Nam, và quy tắc đặt/chụp trước đó.
- Đã chạy `tsc --noEmit --project client/tsconfig.json`: không phát hiện lỗi TypeScript.
- Đã chạy `node --check` đối với hai file Backend cập nhật: hợp lệ về cú pháp.
- Chưa hoàn tất `vite build` trong môi trường này: bộ thư viện cài sẵn thiếu native binding `@rolldown/binding-linux-x64-gnu`; khi chạy trên máy của bạn, dùng `npm install` rồi `npm run build`.
- Chưa thử tích hợp với PostgreSQL và dịch vụ Resend thật. Chưa có API key hay tên miền gửi email của bạn, do đó chưa gửi thư thật.
- Sau khi khôi phục `server/.env` từ bản đang dùng và chạy `npm run db:init`, cần kiểm thử đầu-cuối trên môi trường local trước khi triển khai công khai.

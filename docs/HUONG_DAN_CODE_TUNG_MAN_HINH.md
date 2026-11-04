# Hướng dẫn đọc và tự code Hibi Booth theo từng màn hình

## A. Hiểu cách một website có nhiều màn hình hoạt động

Website có một địa chỉ gốc, nhưng mỗi chức năng có một URL riêng. React Router đọc URL và hiển thị component tương ứng. Các màn hình không lưu dữ liệu riêng; chúng gọi chung Backend API, backend đọc/ghi PostgreSQL.

Ví dụ:

```text
Khách mở /dat-lich
       ↓
BookingPage.tsx (form chọn lịch)
       ↓ fetch POST /api/bookings
server.js (kiểm tra luật + quyền + dữ liệu)
       ↓ SQL
PostgreSQL (lưu đơn đặt phòng)
       ↓ JSON trả về
BookingPage hiển thị mã đặt phòng và QR
```

## B. Tạo một màn hình mới

### Bước 1 — Tạo component

Ví dụ tạo `client/src/pages/RevenuePage.tsx`:

```tsx
export function RevenuePage() {
  return (
    <section>
      <span className="eyebrow">OWNER WORKSPACE</span>
      <h1>Báo cáo doanh thu</h1>
      <p>Màn hình báo cáo doanh thu của chủ quán.</p>
    </section>
  );
}
```

### Bước 2 — Thêm URL vào App.tsx

```tsx
import { RevenuePage } from './pages/RevenuePage';

// Đặt bên trong Route cha /chu-quan để chỉ OWNER truy cập được.
<Route path="bao-cao-doanh-thu" element={<RevenuePage />} />
```

URL hoàn chỉnh sẽ là `/chu-quan/bao-cao-doanh-thu` vì nó nằm bên trong route cha `/chu-quan`.

### Bước 3 — Thêm đường dẫn vào thanh menu

Mở `client/src/components/Layout.tsx`, thêm một mục vào mảng `ownerLinks`:

```tsx
{ to: '/chu-quan/bao-cao-doanh-thu', label: 'Báo cáo doanh thu', icon: ChartColumn }
```

Nhớ import icon `ChartColumn` từ `lucide-react` nếu dùng icon này.

## C. Đưa dữ liệu thật vào màn hình

Không viết dữ liệu giả trực tiếp trong component nếu đó là dữ liệu nghiệp vụ. Tạo API ở backend, sau đó gọi API từ component.

Ví dụ tải danh sách đơn:

```tsx
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Booking = {
  id: number;
  booking_code: string;
  customer_name: string;
  status: string;
};

export function MyBookingsPage() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Booking[]>('/staff/bookings')
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <section>
      <h1>Đơn đặt phòng</h1>
      {error && <p>{error}</p>}
      {rows.map((row) => (
        <article key={row.id}>
          <strong>{row.booking_code}</strong>
          <span>{row.customer_name}</span>
          <span>{row.status}</span>
        </article>
      ))}
    </section>
  );
}
```

## D. Thêm API mới ở backend

Mở `server/src/server.js`. API chỉ đọc dữ liệu có thể dùng `GET`; tạo dữ liệu dùng `POST`; cập nhật một phần dùng `PATCH`.

Ví dụ endpoint cần chủ quán đăng nhập:

```js
app.get('/api/owner/example',
  requireAuth,
  requireRole('OWNER'),
  asyncHandler(async (_req, res) => {
    const result = await pool.query('SELECT NOW() AS server_time');
    res.json(result.rows[0]);
  }),
);
```

Không dựa vào việc ẩn menu ở giao diện để bảo vệ dữ liệu. API phải gọi `requireAuth` và `requireRole` cho mọi thao tác nội bộ.

## E. Khi nào cần sửa cơ sở dữ liệu?

Nếu màn hình chỉ trình bày dữ liệu hiện có, thường không cần thêm bảng. Nếu xuất hiện một khái niệm nghiệp vụ mới (ví dụ voucher, ca làm việc, thiết bị), hãy:

1. Thêm bảng hoặc cột vào `server/sql/schema.sql`.
2. Xác định khóa chính và khóa ngoại.
3. Viết API đọc/ghi dữ liệu.
4. Gọi API từ màn hình React.
5. Thêm phân quyền, validate đầu vào và ghi audit log nếu là thao tác quan trọng.

## F. Thứ tự học nên theo

1. Chạy thành công dự án theo README.
2. Thay đổi chữ, màu và nội dung trang chủ trong `PublicPages.tsx` / `styles.css`.
3. Thêm trường vào form đặt lịch và hiểu API `POST /bookings`.
4. Thêm bộ lọc đơn trong `StaffBookingsPage`.
5. Thử camera QR và hiểu hàm `normalizeQr`.
6. Tạo thêm một màn hình chủ quán.
7. Sau cùng mới tích hợp thanh toán, email và triển khai công khai.

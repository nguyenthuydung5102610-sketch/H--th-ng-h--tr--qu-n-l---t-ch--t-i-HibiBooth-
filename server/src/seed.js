if (process.env.NODE_ENV === 'production') { console.error('Không chạy dữ liệu và mật khẩu demo trên production.'); process.exit(1); }
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const demoUsers = [
  { fullName: 'Chủ quán Hibi', email: 'owner@hibibooth.local', password: 'OwnerDemo#2026', role: 'OWNER' },
  { fullName: 'Nhân viên Hibi', email: 'staff@hibibooth.local', password: 'StaffDemo#2026', role: 'EMPLOYEE' },
];

try {
  await pool.query(`
    INSERT INTO rooms (code, name, description) VALUES
      ('GRAY', 'Gray Room', 'Phông nền xám hiện đại.'),
      ('BLACK', 'Black Room', 'Phông đen cá tính.'),
      ('WHITE', 'White Room', 'Phông trắng tối giản.'),
      ('RED', 'Red Room', 'Phông đỏ nổi bật.')
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO packages (code, name, description, price_vnd) VALUES
      ('PHOTO4', 'Gói 4 ảnh', '4 ảnh in · 30 phút sử dụng phòng.', 70000),
      ('PHOTO8', 'Gói 8 ảnh', '8 ảnh in · 30 phút sử dụng phòng.', 100000)
    ON CONFLICT (code) DO NOTHING;
  `);

  for (const user of demoUsers) {
    const hash = await bcrypt.hash(user.password, 12);
    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, active = TRUE`,
      [user.fullName, user.email, hash, user.role],
    );
  }
  console.log('Đã tạo dữ liệu mẫu. Tài khoản demo chỉ dùng trên máy local:');
  console.log('Chủ quán: owner@hibibooth.local / OwnerDemo#2026');
  console.log('Nhân viên: staff@hibibooth.local / StaffDemo#2026');
} catch (error) {
  console.error('Không thể seed dữ liệu:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

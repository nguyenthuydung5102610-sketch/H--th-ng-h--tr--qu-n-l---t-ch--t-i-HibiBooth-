import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

try {
  if (process.env.NODE_ENV !== 'production') throw new Error('Setup nay chi chay tren NODE_ENV=production.');
  const demo = await pool.query("SELECT email FROM users WHERE email IN ('owner@hibibooth.local','staff@hibibooth.local') LIMIT 1");
  if (demo.rowCount) throw new Error('Database dang co tai khoan DEMO. Khong mo cong khai; hay xu ly tai khoan mau truoc.');
  await pool.query(`INSERT INTO rooms(code,name,description) VALUES
      ('GRAY','Gray Room','Phông nền xám hiện đại.'),
      ('BLACK','Black Room','Phông đen cá tính.'),
      ('WHITE','White Room','Phông trắng tối giản.'),
      ('RED','Red Room','Phông đỏ nổi bật.')
    ON CONFLICT(code) DO NOTHING;
    INSERT INTO packages(code,name,description,price_vnd) VALUES
      ('PHOTO4','Gói 4 ảnh','4 ảnh in · 30 phút sử dụng phòng.',70000),
      ('PHOTO8','Gói 8 ảnh','8 ảnh in · 30 phút sử dụng phòng.',100000)
    ON CONFLICT(code) DO NOTHING;`);
  const owner=await pool.query("SELECT id FROM users WHERE role='OWNER' AND active=TRUE LIMIT 1");
  if (!owner.rowCount) {
    const email=String(process.env.OWNER_EMAIL||'').trim().toLowerCase();
    const password=String(process.env.OWNER_PASSWORD||'');
    const name=String(process.env.OWNER_NAME||'Chủ quán HIBI').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<16 || password.length>200)
      throw new Error('Thieu OWNER_EMAIL hop le hoac OWNER_PASSWORD >=16 ky tu. Khong su dung mat khau mau.');
    const hash=await bcrypt.hash(password,12);
    await pool.query('INSERT INTO users(full_name,email,password_hash,role) VALUES ($1,$2,$3,\'OWNER\') ON CONFLICT(email) DO NOTHING',[name,email,hash]);
    console.log('Da tao tai khoan chu quan. Khong in mat khau ra log.');
  } else { console.log('Tai khoan chu quan da ton tai; khong dat lai mat khau.'); }
  console.log('Cau hinh rooms/packages va owner da san sang.');
} catch(error){console.error('Production setup failed:',error.message);process.exitCode=1;}
finally { await pool.end(); }

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  const sql = await fs.readFile(path.join(here, '../sql/schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Đã khởi tạo cấu trúc cơ sở dữ liệu.');
} catch (error) {
  console.error('Không thể khởi tạo database:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

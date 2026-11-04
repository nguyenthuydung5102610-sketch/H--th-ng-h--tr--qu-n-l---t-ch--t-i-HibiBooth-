import jwt from 'jsonwebtoken';
import { pool } from './db.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Vui lòng đăng nhập.' });
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const result = await pool.query('SELECT id,email,role,active FROM users WHERE id=$1', [claims.id]);
    if (!result.rowCount || !result.rows[0].active) return res.status(401).json({ message: 'Tài khoản không còn hoạt động.' });
    const user = result.rows[0];
    req.user = { id: user.id, email: user.email, role: user.role };
    return next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError' || error?.name === 'NotBeforeError') {
      return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    }
    return next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện chức năng này.' });
    }
    return next();
  };
}

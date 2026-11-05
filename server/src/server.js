import 'dotenv/config';
import express from 'express';
import { PayOS } from '@payos/node';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validCustomerName, isValidDate, isBookableAt, checkinWindow, formatBookingCode, isBookingCode, BOOKING_ADVANCE_MINUTES, slotsOverlap, canIssueCheckinQr } from './business-rules.js';
import { scheduleBookingEmails, startEmailNotificationWorker, isValidCustomerEmail, emailServiceEnabled } from './email-notifications.js';
import { pool, writeAudit } from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { normalizeCustomerPhone, validateRescheduleInput, canRequestReschedule, validateRescheduleDecision, canApproveReschedule, unavailableRescheduleSlots } from './reschedule-rules.js';
import { cancellationMode, isCancellationReasonValid, validateCancellationDecision, validateCancellationReview, rollbackCancellation } from './cancellation-rules.js';
import { HOLD_MINUTES, expireOverdueHolds, expireLockedHold, createHoldExpirationWorker } from './hold-expiration.js';
import { syncVerifiedPayosPayment } from './payos-sync.js';
import { recoverOrCreatePayosLink, PayosLinkError } from './payos-link.js';

if (!process.env.JWT_SECRET) {
  console.error('Thiếu JWT_SECRET. Hãy tạo server/.env từ server/.env.example.');
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const DEMO_PAYMENT_ENABLED = process.env.ENABLE_DEMO_PAYMENT === 'true' && process.env.NODE_ENV !== 'production';
const OPENING_HOUR = 9;
const CLOSING_HOUR = 23;
const SESSION_MINUTES = 60;
const SLOT_INTERVAL_MINUTES = 30;

const TIME_SLOTS = [];

for (
  let minutes = OPENING_HOUR * 60;
  minutes + SESSION_MINUTES <= CLOSING_HOUR * 60;
  minutes += SLOT_INTERVAL_MINUTES
) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');

  TIME_SLOTS.push(`${hour}:${minute}`);
}
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN.split(',').map((item) => item.trim()), credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const isText = (value, max = 255) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const maskPhone = (phone) => phone.length > 4 ? `${phone.slice(0, 3)}•••${phone.slice(-3)}` : '••••';
const SLOT_DURATION_MINUTES = 60;
const minuteOf = (slot) => { const [h,m]=String(slot).split(':').map(Number); return h*60+m; };
const blockedSlots = (reserved) => TIME_SLOTS.filter(candidate => reserved.some(existing => slotsOverlap(candidate, existing, SLOT_DURATION_MINUTES)));
const nowInVietnam = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Ho_Chi_Minh', year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`, time:`${p.hour}:${p.minute}`};
};
const PAYOS_ENABLED = ['PAYOS_CLIENT_ID','PAYOS_API_KEY','PAYOS_CHECKSUM_KEY'].every(k => Boolean(process.env[k]?.trim()));
const PAYMENT_MODE = PAYOS_ENABLED ? 'PAYOS' : 'DEMO_ONLY';
const payos = PAYOS_ENABLED ? new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
}) : null;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || CLIENT_ORIGIN.split(',')[0].trim();



app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'hibi-booth-api', paymentMode: PAYMENT_MODE }));

app.get('/api/catalog', asyncHandler(async (_req, res) => {
  const [rooms, packages] = await Promise.all([
    pool.query('SELECT id, code, name, description FROM rooms WHERE active = TRUE ORDER BY id'),
    pool.query('SELECT id, code, name, description, price_vnd FROM packages WHERE active = TRUE ORDER BY price_vnd'),
  ]);
  res.json({ rooms: rooms.rows, packages: packages.rows, timeSlots: TIME_SLOTS });
}));

app.get('/api/availability', asyncHandler(async (req, res) => {
  const { date, roomId } = req.query;
  if (!isValidDate(String(date || '')) || !/^\d+$/.test(String(roomId || ''))) {
    return res.status(400).json({ message: 'Ngày hoặc phòng không hợp lệ.' });
  }
  const result = await pool.query(
    `SELECT time_slot FROM bookings
     WHERE booking_date = $1 AND room_id = $2
       AND status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
       AND (status <> 'PENDING_PAYMENT' OR hold_expires_at > NOW())`,
    [date, Number(roomId)],
  );
  const occupiedSlots = blockedSlots(result.rows.map(row => row.time_slot));
  const unavailable = TIME_SLOTS.filter(slot =>
    occupiedSlots.includes(slot) || !isBookableAt(String(date), slot)
  );
  res.json({ date, roomId: Number(roomId), unavailable, timeSlots: TIME_SLOTS });
}));

app.post('/api/bookings', rateLimit({windowMs:15*60*1000,limit:20}), asyncHandler(async (req, res) => {
  const { customerName, customerPhone, customerEmail, roomId, packageId, date, timeSlot } = req.body || {};
  const validPhone = 
      typeof customerPhone === 'string' && 
      /^(03|05|07|08|09)\d{8}$/.test(customerPhone);
  if (!validPhone) {
    return res.status(400).json({
      message: 'Số điện thoại không hợp lệ. Vui lòng nhập lại!.',
    });
  }
  if (!validCustomerName(customerName)) {
    return res.status(400).json({ message: 'Họ và tên chỉ được chứa chữ cái, dấu cách và dấu nối; phải có ít nhất 2 chữ cái.' });
  }
  if (!isValidCustomerEmail(customerEmail)) return res.status(400).json({ message: 'Vui lòng nhập email hợp lệ để nhận xác nhận và nhắc lịch chụp.' });
  if (!/^\d+$/.test(String(roomId || ''))) return res.status(400).json({ message: 'Vui lòng chọn phòng chụp.' });
  if (!/^\d+$/.test(String(packageId || ''))) return res.status(400).json({ message: 'Vui lòng chọn gói chụp.' });
  if (!date) return res.status(400).json({ message: 'Vui lòng chọn ngày chụp.' });
  if (!isValidDate(date)) return res.status(400).json({ message: 'Ngày chụp không hợp lệ.' });
  if (!timeSlot) return res.status(400).json({ message: 'Vui lòng chọn khung giờ.' });
  if (!TIME_SLOTS.includes(timeSlot)) return res.status(400).json({ message: 'Khung giờ ngoài giờ mở cửa của quán.' });
  if (!isBookableAt(date, timeSlot)) return res.status(400).json({ message: `Vui lòng đặt lịch trước ít nhất ${BOOKING_ADVANCE_MINUTES} phút.` });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const room = await client.query('SELECT id FROM rooms WHERE id = $1 AND active = TRUE FOR UPDATE', [Number(roomId)]);
    if (!room.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy phòng chụp.' });
    }
    const occupied = await client.query(
      `SELECT id FROM bookings WHERE room_id = $1 AND booking_date = $2
       AND ABS((split_part(time_slot, ':', 1)::int * 60 + split_part(time_slot, ':', 2)::int) - $3) < $4
       AND status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
       AND (status <> 'PENDING_PAYMENT' OR hold_expires_at > NOW()) LIMIT 1`,
      [Number(roomId), date, minuteOf(timeSlot), SLOT_DURATION_MINUTES],
    );
    if (occupied.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Khung giờ này vừa được khách khác giữ. Vui lòng chọn giờ khác.' });
    }
    const pack = await client.query('SELECT id, price_vnd FROM packages WHERE id = $1 AND active = TRUE', [Number(packageId)]);
    if (!pack.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy gói chụp.' });
    }
    // Recheck after DB lock; use an atomic counter per VN calendar date.
    if (!isBookableAt(date, timeSlot)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Giờ đã quá gần. Vui lòng đặt trước ít nhất 30 phút.' });
    }
    const issueDate = nowInVietnam().date;
    const number = await client.query(`INSERT INTO booking_daily_sequences (issue_date, last_number)
      VALUES ($1, 1) ON CONFLICT (issue_date) DO UPDATE SET last_number=booking_daily_sequences.last_number+1
      RETURNING last_number`, [issueDate]);
    const code = formatBookingCode(Number(number.rows[0].last_number), issueDate);
    const booking = await client.query(
      `INSERT INTO bookings (booking_code, customer_name, customer_phone, customer_email, room_id, package_id,
        booking_date, time_slot, amount_vnd, hold_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW() + ($10::int * INTERVAL '1 minute'))
       RETURNING id, booking_code, amount_vnd, status, payment_status, hold_expires_at`,
      [code, customerName.trim(), customerPhone.trim(), customerEmail.trim().toLowerCase(), Number(roomId), Number(packageId), date, timeSlot, pack.rows[0].price_vnd, HOLD_MINUTES],
    );
    await writeAudit(client, null, 'CUSTOMER_CREATE_BOOKING', 'BOOKING', booking.rows[0].id, { bookingCode: code });
    await client.query('COMMIT');
    res.status(201).json({ ...booking.rows[0], note: PAYOS_ENABLED ? 'Giữ chỗ 20 phút. Chỉ xác nhận khi payOS xác minh thanh toán.' : 'Giữ chỗ 20 phút. QR thanh toán trong demo KHÔNG thể chuyển tiền thật.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.get('/api/bookings/lookup/:code', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }), asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const phone = String(req.query.phone || '').replace(/[\s.-]/g,'');
  if (!isBookingCode(code)) return res.status(400).json({ message: 'Mã đặt phòng không đúng định dạng.' });
  if (!/^(03|05|07|08|09)\d{8}$/.test(phone)) return res.status(400).json({ message: 'Vui lòng nhập số điện thoại đã đăng ký (10 chữ số).' });
  await expireOverdueHolds(pool,{limit:1,bookingCode:code});
  const result = await pool.query(
    `SELECT b.booking_code, b.customer_name, b.customer_phone, b.booking_date, b.time_slot,
            b.amount_vnd, b.status, b.payment_status, b.hold_expires_at, b.created_at,
            r.name AS room_name, p.name AS package_name
     FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN packages p ON p.id=b.package_id
     WHERE b.booking_code=$1 AND b.customer_phone=$2`, [code, phone],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Không tìm thấy đơn hoặc số điện thoại không khớp.' });
  const booking = result.rows[0];
  res.json({ ...booking, customer_phone: maskPhone(booking.customer_phone), qr_content: canIssueCheckinQr(booking.status, booking.payment_status) ? `HIBI|${booking.booking_code}` : null });
}));

// COMMIT 06: customer cancellation. Unpaid holds are cancelled immediately;
// paid bookings require a review and a separate owner refund approval.
app.post('/api/bookings/:code/cancellation',
  rateLimit({ windowMs: 15*60*1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const phone = normalizeCustomerPhone(req.body?.customerPhone);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : null;
    if (!isBookingCode(code) || !phone) return res.status(400).json({message:'Mã đơn hoặc số điện thoại không hợp lệ.'});
    if (!isCancellationReasonValid(reason)) return res.status(400).json({message:'Nhập lý do hủy từ 5 đến 500 ký tự.'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock order is ROOM -> BOOKING (same order as booking/reschedule flows).
      // Reload booking after the lock so a concurrent webhook or reviewer cannot cause stale decisions.
      const peek = await client.query('SELECT room_id FROM bookings WHERE booking_code=$1 AND customer_phone=$2',[code,phone]);
      if (!peek.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({message:'Không tìm thấy đơn hoặc số điện thoại không khớp.'}); }
      await client.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[peek.rows[0].room_id]);
      const found = await client.query(`SELECT id,status,payment_status,booking_date::text AS booking_date,time_slot,hold_expires_at
        FROM bookings WHERE booking_code=$1 AND customer_phone=$2 FOR UPDATE`,[code,phone]);
      if (!found.rowCount) { await client.query('ROLLBACK');return res.status(404).json({message:'Không tìm thấy đơn hoặc số điện thoại không khớp.'}); }
      const b=found.rows[0];
      const mode = cancellationMode(b.status, b.payment_status, { holdExpiresAt: b.hold_expires_at });
      if (mode === 'EXPIRED') {
        // A stale hold must not be treated as an active cancellation.
        await expireLockedHold(client,b.id);
        await client.query('COMMIT');
        return res.status(409).json({code:'HOLD_EXPIRED',message:'Giữ chỗ đã hết hạn. Không thể hủy một đơn đã hết hạn.'});
      }
      if (mode === 'IMMEDIATE') {
        // Hủy hold chưa thanh toán; không tạo yêu cầu hoàn tiền.
        // Recheck with PostgreSQL clock: hold may expire between reading and updating.
        const updated=await client.query(`UPDATE bookings SET status='CANCELLED',updated_at=NOW()
          WHERE id=$1 AND status='PENDING_PAYMENT' AND payment_status='PENDING'
          AND hold_expires_at > NOW() RETURNING id`,[b.id]);
        if(!updated.rowCount){
          await expireLockedHold(client,b.id);
          await client.query('COMMIT');
          return res.status(409).json({code:'HOLD_EXPIRED',message:'Thời hạn giữ chỗ vừa kết thúc. Vui lòng tra cứu lại đơn.'});
        }
        await client.query(`UPDATE booking_reschedule_requests SET status='CANCELLED' WHERE booking_id=$1 AND status='PENDING'`,[b.id]);
        await writeAudit(client,null,'CUSTOMER_CANCEL_UNPAID','BOOKING',b.id,{bookingCode:code,reason});
        await client.query('COMMIT');
        return res.json({status:'CANCELLED',message:'Đã hủy đơn chưa thanh toán và giải phóng khung giờ.'});
      }
      if (mode!=='REVIEW') {
        await client.query('ROLLBACK');return res.status(409).json({message:'Trạng thái đơn hiện tại không cho phép gửi yêu cầu hủy.'});
      }
      const existing=await client.query(`SELECT id FROM booking_cancellation_requests WHERE booking_id=$1 AND status='PENDING'`,[b.id]);
      if (existing.rowCount) {await client.query('ROLLBACK');return res.status(409).json({message:'Đơn đã có yêu cầu hủy đang chờ xét duyệt.'});}
      const other=await client.query(`SELECT id FROM booking_reschedule_requests WHERE booking_id=$1 AND status='PENDING'`,[b.id]);
      if (other.rowCount) {await client.query('ROLLBACK');return res.status(409).json({message:'Vui lòng xử lý yêu cầu đổi lịch đang chờ trước khi hủy đơn.'});}
      const created=await client.query(`INSERT INTO booking_cancellation_requests(booking_id,reason) VALUES($1,$2) RETURNING id,status`,[b.id,reason]);
      await writeAudit(client,null,'CUSTOMER_REQUEST_CANCELLATION','CANCELLATION_REQUEST',created.rows[0].id,{bookingCode:code});
      await client.query('COMMIT');
      res.status(201).json({...created.rows[0],message:'Đã gửi yêu cầu hủy. Lịch hiện tại được giữ nguyên cho đến khi nhân viên hoặc chủ quán duyệt. Hoàn tiền phải được chủ quán duyệt riêng.'});
    } catch(error) {
      if (error.code === '23505') {
        await client.query('ROLLBACK');
        return res.status(409).json({code:'DUPLICATE_CANCELLATION',message:'Yêu cầu hủy đã tồn tại. Vui lòng tra cứu lại trạng thái.'});
      }
      await rollbackCancellation(client,error);
    } finally {client.release();}
  })
);

app.get('/api/bookings/:code/cancellation-requests',
  rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false}),
  asyncHandler(async (req,res)=>{
    const code=String(req.params.code||'').trim().toUpperCase();
    const phone=normalizeCustomerPhone(req.query.phone);
    if(!isBookingCode(code)||!phone)return res.status(400).json({message:'Mã đơn hoặc số điện thoại không hợp lệ.'});
    const result=await pool.query(`SELECT c.id,c.reason,c.status,c.decision_reason,c.created_at,c.reviewed_at
      FROM booking_cancellation_requests c JOIN bookings b ON b.id=c.booking_id
      WHERE b.booking_code=$1 AND b.customer_phone=$2 ORDER BY c.created_at DESC LIMIT 20`,[code,phone]);
    const matches=await pool.query('SELECT 1 FROM bookings WHERE booking_code=$1 AND customer_phone=$2',[code,phone]);
    if(!matches.rowCount)return res.status(404).json({message:'Không tìm thấy đơn hoặc số điện thoại không khớp.'});
    res.json({requests:result.rows});
  })
);

app.get('/api/management/cancellation-requests',requireAuth,requireRole('EMPLOYEE'),
  asyncHandler(async(req,res)=>{
    const status=String(req.query.status||'PENDING').toUpperCase();
    if(!['PENDING','APPROVED','REJECTED','ALL'].includes(status))return res.status(400).json({message:'Bộ lọc không hợp lệ.'});
    const r=await pool.query(`SELECT c.id,c.reason,c.status,c.decision_reason,c.created_at,c.reviewed_at,
      b.booking_code,b.customer_name,b.customer_phone,b.booking_date::text AS booking_date,
      b.time_slot,b.status AS booking_status,b.payment_status,b.amount_vnd,room.name AS room_name
      FROM booking_cancellation_requests c JOIN bookings b ON b.id=c.booking_id
      JOIN rooms room ON room.id=b.room_id WHERE ($1='ALL' OR c.status=$1)
      ORDER BY c.created_at DESC LIMIT 100`,[status]);
    res.json({requests:r.rows});
  })
);

app.patch('/api/management/cancellation-requests/:id/decision',requireAuth,requireRole('EMPLOYEE'),
  asyncHandler(async(req,res)=>{
    const id=Number(req.params.id),decision=req.body?.decision;
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:'Mã yêu cầu không hợp lệ.'});
    const decisionError=validateCancellationDecision(req.body);
    if(decisionError)return res.status(400).json({message:decisionError});
    const reason=(req.body.decisionReason||'').trim();
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const actor=await client.query('SELECT id,role,active FROM users WHERE id=$1',[req.user.id]);
      if(!actor.rowCount||!actor.rows[0].active||actor.rows[0].role !== 'EMPLOYEE'){
        await client.query('ROLLBACK');return res.status(403).json({message:'Tài khoản không có quyền xét duyệt.'});
      }
      const peek=await client.query(`SELECT b.room_id FROM booking_cancellation_requests c JOIN bookings b ON b.id=c.booking_id WHERE c.id=$1`,[id]);
      if(!peek.rowCount){await client.query('ROLLBACK');return res.status(404).json({message:'Không tìm thấy yêu cầu.'});}
      // Same room -> booking lock ordering as creation / reschedule approval.
      await client.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[peek.rows[0].room_id]);
      const found=await client.query(`SELECT c.id,c.status AS request_status,c.booking_id,b.status AS booking_status,
        b.payment_status,b.booking_code,b.amount_vnd FROM booking_cancellation_requests c
        JOIN bookings b ON b.id=c.booking_id WHERE c.id=$1 FOR UPDATE OF c,b`,[id]);
      if(!found.rowCount){await client.query('ROLLBACK');return res.status(404).json({message:'Không tìm thấy yêu cầu.'});}
      const r=found.rows[0];
      const reviewError=validateCancellationReview(r.request_status,r.booking_status,r.payment_status,decision);
      if(reviewError){await client.query('ROLLBACK');return res.status(409).json({message:reviewError});}
      if(decision==='APPROVE'){
        // An active reschedule request has to be resolved first to avoid conflicting decisions.
        const pendingReschedule=await client.query(`SELECT id FROM booking_reschedule_requests WHERE booking_id=$1 AND status='PENDING'`,[r.booking_id]);
        if(pendingReschedule.rowCount){await client.query('ROLLBACK');return res.status(409).json({message:'Đơn có yêu cầu đổi lịch chờ duyệt; xử lý đổi lịch trước khi duyệt hủy.'});}
        const current=await client.query(`SELECT 1 FROM refunds WHERE booking_id=$1 AND status IN ('PENDING_APPROVAL','APPROVED','COMPLETED')`,[r.booking_id]);
        if(current.rowCount){await client.query('ROLLBACK');return res.status(409).json({message:'Đơn đã có quy trình hoàn tiền; cần kiểm tra thủ công.'});}
        await client.query(`UPDATE bookings SET status='CANCELLED',updated_at=NOW() WHERE id=$1`,[r.booking_id]);
        // Không giả lập chuyển tiền. Tạo yêu cầu hoàn tiền cho chủ quán quyết định.
        await client.query(`INSERT INTO refunds(booking_id,requested_by,reason,amount_vnd)
          VALUES($1,$2,$3,$4)`,[r.booking_id,req.user.id,'Khách yêu cầu hủy đặt phòng: '+r.booking_code,r.amount_vnd]);
        await client.query(`UPDATE email_notifications SET status='SKIPPED' WHERE booking_id=$1 AND kind='REMINDER' AND status IN ('PENDING','FAILED')`,[r.booking_id]);
        await client.query(`UPDATE sms_reminders SET status='SKIPPED' WHERE booking_id=$1 AND status IN ('PENDING','FAILED')`,[r.booking_id]);
      }
      await client.query(`UPDATE booking_cancellation_requests SET status=$1,reviewed_by=$2,
        reviewed_at=NOW(),decision_reason=$3 WHERE id=$4`,[decision==='APPROVE'?'APPROVED':'REJECTED',req.user.id,reason||null,id]);
      await writeAudit(client,req.user.id,decision==='APPROVE'?'APPROVE_CANCELLATION':'REJECT_CANCELLATION',
        'CANCELLATION_REQUEST',id,{bookingCode:r.booking_code,decisionReason:reason});
      await client.query('COMMIT');
      res.json({message:decision==='APPROVE'?'Đã hủy đơn và tạo yêu cầu hoàn tiền để chủ quán xét duyệt. Chưa chuyển tiền.':'Đã từ chối yêu cầu; đơn vẫn giữ nguyên.'});
    } catch(error){await rollbackCancellation(client,error);} finally{client.release();}
  })
);

// COMMIT 06: Display available destinations before the customer submits a request.
// The original booking is excluded because its slot will be released upon approval.
// The decision API below still rechecks availability under a room lock.
app.get('/api/bookings/:code/reschedule-availability',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const phone = normalizeCustomerPhone(req.query.phone);
    const date = String(req.query.date || '');
    if (!isBookingCode(code) || !phone) {
      return res.status(400).json({ message: 'Mã đặt phòng hoặc số điện thoại không hợp lệ.' });
    }
    if (!isValidDate(date)) return res.status(400).json({ message: 'Ngày đề xuất không hợp lệ.' });

    const found = await pool.query(
      `SELECT id, room_id, status, payment_status, booking_date::text AS booking_date, time_slot
       FROM bookings WHERE booking_code=$1 AND customer_phone=$2`, [code, phone]);
    if (!found.rowCount) return res.status(404).json({ message: 'Không tìm thấy đơn hoặc số điện thoại không khớp.' });
    const booking = found.rows[0];
    if (!canRequestReschedule(booking.status, booking.payment_status)) {
      return res.status(409).json({ message: 'Đơn không còn đủ điều kiện đổi lịch.' });
    }
    const booked = await pool.query(
      `SELECT time_slot FROM bookings WHERE room_id=$1 AND booking_date=$2 AND id<>$3
       AND status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
       AND (status <> 'PENDING_PAYMENT' OR hold_expires_at > NOW())`,
      [booking.room_id, date, booking.id]);
    const unavailable = unavailableRescheduleSlots(TIME_SLOTS, booked.rows.map(row => row.time_slot), date);
    // Moving to exactly the same date/time is not a valid reschedule request.
    if (date === booking.booking_date && !unavailable.includes(booking.time_slot)) unavailable.push(booking.time_slot);
    res.json({ date, timeSlots: TIME_SLOTS, unavailable });
  })
);

// COMMIT 03: Customer submits a request for approval; this endpoint NEVER changes the booked slot.
app.post('/api/bookings/:code/reschedule-requests',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!isBookingCode(code)) return res.status(400).json({ message: 'Mã đặt phòng không hợp lệ.' });
    const validationError = validateRescheduleInput(req.body, TIME_SLOTS);
    if (validationError) return res.status(400).json({ message: validationError });

    const phone = normalizeCustomerPhone(req.body.customerPhone);
    const { newDate, newTimeSlot } = req.body;
    const reason = req.body.reason.trim();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(`
        SELECT b.id, b.room_id, b.booking_date::text AS booking_date, b.time_slot,
               b.status, b.payment_status
        FROM bookings b
        WHERE b.booking_code = $1 AND b.customer_phone = $2
        FOR UPDATE OF b`, [code, phone]);
      if (!found.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Không tìm thấy đơn hoặc số điện thoại không khớp.' });
      }
      const booking = found.rows[0];
      if (!canRequestReschedule(booking.status, booking.payment_status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Chỉ đơn đã thanh toán và đang được xác nhận mới có thể yêu cầu đổi lịch.' });
      }
      if (booking.booking_date === newDate && booking.time_slot === newTimeSlot) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Khung giờ mới phải khác lịch hiện tại.' });
      }
      if (!isBookableAt(newDate, newTimeSlot)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Khung giờ mới không còn đủ thời gian đặt trước.' });
      }
      const cancellationPending = await client.query(`SELECT id FROM booking_cancellation_requests WHERE booking_id=$1 AND status='PENDING'`, [booking.id]);
      if (cancellationPending.rowCount) {
        await client.query('ROLLBACK'); return res.status(409).json({message:'Đơn đang chờ duyệt hủy; không thể đổi lịch.'});
      }
      const pending = await client.query(`SELECT id FROM booking_reschedule_requests
        WHERE booking_id=$1 AND status='PENDING' LIMIT 1`, [booking.id]);
      if (pending.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Đơn đã có yêu cầu đổi lịch đang chờ xét duyệt.' });
      }
      // Pre-check for an occupied destination. The eventual approval MUST recheck under room lock.
      const occupied = await client.query(`SELECT id FROM bookings
        WHERE room_id=$1 AND booking_date=$2 AND id<>$3
          AND ABS((split_part(time_slot, ':', 1)::int*60 + split_part(time_slot, ':', 2)::int) - $4) < $5
          AND status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN')
          AND (status <> 'PENDING_PAYMENT' OR hold_expires_at>NOW()) LIMIT 1`,
      [booking.room_id, newDate, booking.id, minuteOf(newTimeSlot), SESSION_MINUTES]);
      if (occupied.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Phòng không còn trống vào khung giờ đề xuất. Vui lòng chọn giờ khác.' });
      }
      const created = await client.query(`INSERT INTO booking_reschedule_requests
        (booking_id, requested_by, old_booking_date, old_time_slot, new_booking_date, new_time_slot, reason)
        VALUES ($1, 'CUSTOMER', $2, $3, $4, $5, $6)
        RETURNING id, status, new_booking_date::text AS new_booking_date, new_time_slot, created_at`,
      [booking.id, booking.booking_date, booking.time_slot, newDate, newTimeSlot, reason]);
      await writeAudit(client, null, 'CUSTOMER_REQUEST_RESCHEDULE', 'BOOKING', booking.id,
        { requestId: created.rows[0].id, newDate, newTimeSlot });
      await client.query('COMMIT');
      return res.status(201).json({
        message: 'Đã gửi yêu cầu đổi lịch, đang chờ nhân viên hoặc chủ quán xét duyệt. Lịch hiện tại chưa thay đổi.',
        request: created.rows[0],
      });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return res.status(409).json({ message: 'Đơn đã có yêu cầu đổi lịch đang chờ xét duyệt.' });
      throw error;
    } finally { client.release(); }
  })
);

// COMMIT 04: Customer can view the real approval result; never reveal other customers' requests.
app.get('/api/bookings/:code/reschedule-requests',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const phone = normalizeCustomerPhone(req.query.phone);
    if (!isBookingCode(code) || !phone) return res.status(400).json({ message: 'Vui lòng nhập mã đặt phòng và số điện thoại hợp lệ.' });
    const result = await pool.query(`SELECT r.id,r.status,r.old_booking_date::text AS old_booking_date,
      r.old_time_slot,r.new_booking_date::text AS new_booking_date,r.new_time_slot,
      r.reason,r.decision_reason,r.created_at,r.reviewed_at
      FROM booking_reschedule_requests r JOIN bookings b ON b.id=r.booking_id
      WHERE b.booking_code=$1 AND b.customer_phone=$2 ORDER BY r.created_at DESC LIMIT 20`, [code, phone]);
    // Do not confirm whether a guessed booking code exists.
    const matching = await pool.query('SELECT 1 FROM bookings WHERE booking_code=$1 AND customer_phone=$2', [code, phone]);
    if (!matching.rowCount) return res.status(404).json({ message: 'Không tìm thấy đơn hoặc số điện thoại không khớp.' });
    res.json({ requests: result.rows });
  })
);

// Only employees review rescheduling; owners monitor decisions through the audit log.
app.get('/api/management/reschedule-requests', requireAuth, requireRole('EMPLOYEE'),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || 'PENDING').toUpperCase();
    if (!['PENDING','APPROVED','REJECTED','CANCELLED','ALL'].includes(status)) return res.status(400).json({ message: 'Bộ lọc trạng thái không hợp lệ.' });
    const result = await pool.query(`SELECT r.id,r.booking_id,r.old_booking_date::text AS old_booking_date,
      r.old_time_slot,r.new_booking_date::text AS new_booking_date,r.new_time_slot,r.reason,r.status,
      r.decision_reason,r.created_at,r.reviewed_at,b.booking_code,b.customer_name,b.customer_phone,
      room.name AS room_name,u.full_name AS reviewer_name
      FROM booking_reschedule_requests r
      JOIN bookings b ON b.id=r.booking_id JOIN rooms room ON room.id=b.room_id
      LEFT JOIN users u ON u.id=r.reviewed_by
      WHERE ($1='ALL' OR r.status=$1) ORDER BY r.created_at DESC LIMIT 100`, [status]);
    res.json({ requests: result.rows });
  })
);

app.patch('/api/management/reschedule-requests/:id/decision',
  requireAuth, requireRole('EMPLOYEE'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Mã yêu cầu đổi lịch không hợp lệ.' });
    const validationError = validateRescheduleDecision(req.body);
    if (validationError) return res.status(400).json({ message: validationError });
    const decision = req.body.decision;
    const reason = String(req.body.decisionReason || '').trim();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Revalidate account state; a revoked user cannot approve with an old JWT.
      const actor = await client.query('SELECT id,role,active FROM users WHERE id=$1', [req.user.id]);
      if (!actor.rowCount || !actor.rows[0].active || actor.rows[0].role !== 'EMPLOYEE') {
        await client.query('ROLLBACK'); return res.status(403).json({ message: 'Tài khoản không được phép xét duyệt yêu cầu.' });
      }
      // Booking creation locks the room first: preserve that order to avoid deadlocks.
      const peek = await client.query(`SELECT b.room_id FROM booking_reschedule_requests r
        JOIN bookings b ON b.id=r.booking_id WHERE r.id=$1`, [id]);
      if (!peek.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy yêu cầu đổi lịch.' }); }
      await client.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [peek.rows[0].room_id]);
      const found = await client.query(`SELECT r.id,r.booking_id,r.status AS request_status,r.old_booking_date::text AS old_booking_date,
        r.old_time_slot,r.new_booking_date::text AS new_booking_date,r.new_time_slot,
        b.booking_code,b.booking_date::text AS booking_date,b.time_slot,b.room_id,b.status AS booking_status,
        b.payment_status,b.customer_email
        FROM booking_reschedule_requests r JOIN bookings b ON b.id=r.booking_id
        WHERE r.id=$1 FOR UPDATE OF r,b`, [id]);
      if (!found.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy yêu cầu đổi lịch.' }); }
      const r = found.rows[0];
      if (r.request_status !== 'PENDING') {
        await client.query('ROLLBACK'); return res.status(409).json({ message: 'Yêu cầu này đã được xử lý trước đó.' });
      }
      if (!canRequestReschedule(r.booking_status,r.payment_status) ||
          r.booking_date !== r.old_booking_date || r.time_slot !== r.old_time_slot) {
        await client.query('ROLLBACK'); return res.status(409).json({ message: 'Lịch đặt phòng đã thay đổi hoặc không còn đủ điều kiện để xét duyệt.' });
      }
      if (decision === 'APPROVE') {
        const cancelledRequest = await client.query(`SELECT 1 FROM booking_cancellation_requests WHERE booking_id=$1 AND status='PENDING'`,[r.booking_id]);
        if (cancelledRequest.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({message:'Đơn đang chờ xử lý hủy; không thể duyệt đổi lịch.'}); }
        if (!canApproveReschedule(r.new_booking_date,r.new_time_slot,TIME_SLOTS)) {
          await client.query('ROLLBACK'); return res.status(409).json({ message: 'Khung giờ đề xuất đã quá gần hoặc không còn hợp lệ. Vui lòng từ chối để khách chọn giờ khác.' });
        }
            const occupied = await client.query(`SELECT id FROM bookings
          WHERE room_id=$1 AND booking_date=$2 AND id<>$3
            AND ABS((split_part(time_slot, ':', 1)::int*60 + split_part(time_slot, ':', 2)::int) - $4) < $5
            AND status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN')
            AND (status <> 'PENDING_PAYMENT' OR hold_expires_at>NOW()) LIMIT 1`,
          [r.room_id,r.new_booking_date,r.booking_id,minuteOf(r.new_time_slot),SESSION_MINUTES]);
        if (occupied.rowCount) {
          await client.query('ROLLBACK'); return res.status(409).json({ message: 'Khung giờ mới vừa có khách đặt. Không thể phê duyệt, vui lòng đề xuất giờ khác hoặc từ chối yêu cầu.' });
        }
        await client.query(`UPDATE bookings SET booking_date=$1,time_slot=$2,updated_at=NOW()
          WHERE id=$3`,[r.new_booking_date,r.new_time_slot,r.booking_id]);
        await scheduleBookingEmails(client,r.booking_id);
        // A booking change invalidates an unsent old reminder. Reset it to the new time.
        await client.query(`UPDATE email_notifications SET
            due_at=GREATEST(NOW(),(($1::date+$2::time) AT TIME ZONE 'Asia/Ho_Chi_Minh')-INTERVAL '1 hour'),
            status='PENDING',attempts=0,claimed_at=NULL,sent_at=NULL,provider_message_id=NULL,error_message=NULL
          WHERE booking_id=$3 AND kind='REMINDER' AND status IN ('PENDING','FAILED','SKIPPED','SUBMITTED')`,
          [r.new_booking_date,r.new_time_slot,r.booking_id]);
        await client.query(`UPDATE sms_reminders SET
          due_at=GREATEST(NOW(),(($1::date+$2::time) AT TIME ZONE 'Asia/Ho_Chi_Minh')-INTERVAL '1 hour'),
          status='PENDING',attempts=0,claimed_at=NULL,sent_at=NULL,provider_message_id=NULL,error_message=NULL
          WHERE booking_id=$3 AND status IN ('PENDING','FAILED','SKIPPED','SUBMITTED')`,
          [r.new_booking_date,r.new_time_slot,r.booking_id]);
      }
      const state = decision==='APPROVE'?'APPROVED':'REJECTED';
      await client.query(`UPDATE booking_reschedule_requests
        SET status=$1,reviewed_by=$2,reviewed_at=NOW(),decision_reason=$3 WHERE id=$4`,
        [state,req.user.id,reason||null,id]);
      // Persistent outbox; if EMAIL_PROVIDER is disabled, customer can still look up the decision.
      if (r.customer_email) {
        await client.query(`INSERT INTO reschedule_decision_notifications(request_id,recipient_email)
          VALUES ($1,$2) ON CONFLICT (request_id) DO NOTHING`,[id,r.customer_email]);
      }
      await writeAudit(client,req.user.id,decision==='APPROVE'?'APPROVE_RESCHEDULE':'REJECT_RESCHEDULE',
        'RESCHEDULE_REQUEST',id,{ bookingCode:r.booking_code, oldDate:r.old_booking_date,oldTimeSlot:r.old_time_slot,
          newDate:r.new_booking_date,newTimeSlot:r.new_time_slot, decisionReason:reason });
      await client.query('COMMIT');
      return res.json({ id, status:state, bookingCode:r.booking_code,
        message:decision==='APPROVE'
          ?'Đã duyệt yêu cầu đổi lịch. Đã cập nhật lịch chụp và tạo thông báo kết quả cho khách.'
          :'Đã từ chối yêu cầu đổi lịch. Lịch cũ được giữ nguyên và đã tạo thông báo kết quả cho khách.',
        notification:'Thông báo trong hệ thống đã có; email chỉ được gửi khi cấu hình nhà cung cấp.' });
    } catch(error) {
      await client.query('ROLLBACK'); throw error;
    } finally { client.release(); }
  })
);

// Read-only status. Never trust a browser redirect as proof of payment.
app.get('/api/payments/bookings/:code', asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!isBookingCode(code)) return res.status(400).json({ message: 'Mã đơn không hợp lệ.' });
  await expireOverdueHolds(pool,{limit:1,bookingCode:code});
  const result = await pool.query(`SELECT b.booking_code,b.amount_vnd,b.status,b.payment_status,b.hold_expires_at,
    b.booking_date::text AS booking_date,b.time_slot,r.name AS room_name,
    p.qr_code,p.checkout_url FROM bookings b JOIN rooms r ON r.id=b.room_id LEFT JOIN payos_payment_requests p ON p.booking_id=b.id
    WHERE b.booking_code=$1`, [code]);
  if (!result.rowCount) return res.status(404).json({ message: 'Không tìm thấy đơn.' });
  const b = result.rows[0];
  res.json({ mode: PAYMENT_MODE, bookingCode:b.booking_code, amountVnd:b.amount_vnd,
    status:b.status, paymentStatus:b.payment_status, holdExpiresAt:b.hold_expires_at,
    bookingDate:b.booking_date, timeSlot:b.time_slot, roomName:b.room_name, emailNotificationsEnabled:emailServiceEnabled(),
    qrContent:b.status==='PENDING_PAYMENT' ? (PAYOS_ENABLED ? (b.qr_code || '') : `HIBI-DEMO-ONLY|${b.booking_code}|${b.amount_vnd}`) : '',
    checkoutUrl: b.status==='PENDING_PAYMENT' && PAYOS_ENABLED ? b.checkout_url : null,
    note: PAYOS_ENABLED ? 'Chỉ khi payOS xác nhận giao dịch hợp lệ, đơn mới được xác nhận.' : 'QR mô phỏng – không thể chuyển khoản.' });
}));

// Create a payOS payment request once per booking; orderCode is unique and numeric.
app.post('/api/payments/bookings/:code/create', rateLimit({windowMs:15*60*1000,limit:15}), asyncHandler(async (req,res) => {
  if (!payos) return res.status(503).json({message:'Chưa cấu hình payOS trên Backend.'});
  const code=String(req.params.code||'').trim().toUpperCase();
  if (!isBookingCode(code)) return res.status(400).json({message:'Mã đơn không hợp lệ.'});
  const client=await pool.connect();
  let b, orderCode;
  try {
    await client.query('BEGIN');
    const r=await client.query(`SELECT id,booking_code,amount_vnd,status,hold_expires_at
      FROM bookings WHERE booking_code=$1 FOR UPDATE`,[code]);
    if (!r.rowCount) {await client.query('ROLLBACK');return res.status(404).json({message:'Không tìm thấy đơn.'});}
    b=r.rows[0];
    if (b.status!=='PENDING_PAYMENT' || new Date(b.hold_expires_at)<=new Date()) {
      await client.query('ROLLBACK');return res.status(409).json({message:'Đơn không còn chờ thanh toán hoặc đã hết hạn.'});
    }
    const existing=await client.query('SELECT * FROM payos_payment_requests WHERE booking_id=$1',[b.id]);
    if (existing.rowCount) {
      orderCode = Number(existing.rows[0].order_code);
      await client.query('COMMIT');
      const x = existing.rows[0];
      if (x.qr_code || x.checkout_url) {
        return res.json({qrContent:x.qr_code||'',checkoutUrl:x.checkout_url||'',orderCode});
      }
      // An earlier payOS create may have failed after the DB reserved this code.
      // The resolver will verify on payOS before safely reusing the SAME code.
    } else {
      const created = await client.query(`INSERT INTO payos_payment_requests(booking_id)
        VALUES($1) RETURNING order_code`,[b.id]);
      orderCode = Number(created.rows[0].order_code);
      await client.query('COMMIT');
    }
  } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
  try {
    const link = await recoverOrCreatePayosLink(payos, {
      orderCode, amount:Number(b.amount_vnd), holdExpiresAt:b.hold_expires_at,
      returnUrl:`${PUBLIC_BASE_URL}/dat-lich`,cancelUrl:`${PUBLIC_BASE_URL}/dat-lich`,
    });
    // Never persist a payable link if the hold has expired while payOS was responding.
    const updated = await pool.query(`UPDATE payos_payment_requests AS p
      SET qr_code=$3,checkout_url=$4,updated_at=NOW()
      WHERE p.booking_id=$1 AND p.order_code=$2 AND EXISTS (
        SELECT 1 FROM bookings b WHERE b.id=p.booking_id
          AND b.status='PENDING_PAYMENT' AND b.payment_status='PENDING'
          AND b.hold_expires_at > clock_timestamp()
      )`, [b.id,orderCode,link.qrContent,link.checkoutUrl]);
    if (!updated.rowCount) return res.status(409).json({message:'Đã hết thời gian giữ chỗ hoặc đơn không còn chờ thanh toán.'});
    return res.json(link);
  } catch(err) {
    if (err instanceof PayosLinkError) {
      const status = ['EXPIRED','NOT_PENDING','ORDER_MISMATCH','AMOUNT_MISMATCH','CURRENCY_MISMATCH'].includes(err.code) ? 409 : 503;
      return res.status(status).json({message:err.message});
    }
    console.error('payOS link recovery failed:',err?.message);
    return res.status(502).json({message:'Chưa thể kết nối payOS. Vui lòng thử lại sau.'});
  }
}));

// Reconcile a pending payment directly with payOS. Useful on localhost where payOS cannot reach the webhook.
// A paid redirect alone is NEVER treated as proof of payment.
app.post('/api/payments/bookings/:code/reconcile', rateLimit({windowMs:60*1000,limit:8}), asyncHandler(async (req,res) => {
  if(!payos) return res.status(503).json({message:'payOS chưa được cấu hình.'});
  const code=String(req.params.code||'').trim().toUpperCase();
  if(!isBookingCode(code)) return res.status(400).json({message:'Mã đơn không hợp lệ.'});
  const match=await pool.query(`SELECT p.order_code,b.id,b.status,b.payment_status,b.amount_vnd,b.hold_expires_at
    FROM payos_payment_requests p JOIN bookings b ON b.id=p.booking_id WHERE b.booking_code=$1`,[code]);
  if(!match.rowCount) return res.status(404).json({message:'Không tìm thấy yêu cầu thanh toán payOS.'});
  const orderCode=Number(match.rows[0].order_code);
  let remote;
  try {remote=await payos.paymentRequests.get(orderCode);}
  catch(err) {console.error('payOS reconciliation failed:',err.message);return res.status(502).json({message:'Chưa kiểm tra được trạng thái payOS; hệ thống sẽ thử lại.'});}
  if(remote?.status!=='PAID') return res.json({confirmed:false,paymentStatus:match.rows[0].payment_status});
  if (Number(remote.orderCode)!==orderCode) {
    console.warn('Mã đơn payOS không trùng mã đã tra cứu.');
    return res.status(409).json({confirmed:false,message:'payOS trả về mã giao dịch không khớp; cần kiểm tra thủ công.'});
  }
  // Remote status and data come directly from payOS, not from browser input.
  // Keep the reference stable so repeated reconcile calls are idempotent.
  const transactionRef = `RECONCILE-${orderCode}`;
  const result = await syncVerifiedPayosPayment(pool, {
    orderCode: Number(remote.orderCode), amount: Number(remote.amount),
    reference: transactionRef, source: 'RECONCILE', currency: remote.currency || 'VND',
  });
  if (result.outcome==='UNKNOWN_ORDER') return res.status(404).json({message:'Mã thanh toán không tồn tại.'});
  if (result.outcome==='AMOUNT_MISMATCH') return res.status(409).json({confirmed:false,reviewRequired:true,message:'Số tiền không khớp; chủ quán cần đối soát.'});
  if (result.outcome==='ALREADY_PAID_CLOSED') return res.json({confirmed:false,paymentStatus:'PAID',bookingClosed:true});
  if (result.outcome==='REVIEW_REQUIRED' || result.outcome==='ALREADY_PROCESSED')
    return res.json({confirmed:false,reviewRequired:true,paymentStatus:result.paymentStatus||'PENDING'});
  if (result.outcome==='CONFIRMED' || result.outcome==='ALREADY_CONFIRMED')
    return res.json({confirmed:true,paymentStatus:'PAID'});
  return res.status(422).json({confirmed:false,message:'Dữ liệu xác minh thanh toán không hợp lệ.'});
}));

// Chỉ thử trên máy: mô phỏng server nhận callback thành công sau khi đã đối chiếu.
// Khi kết nối payOS, XÓA route này và thay bằng Webhook có verify signature.
app.post('/api/demo/bookings/:code/pay', rateLimit({ windowMs: 60*1000, limit: 15 }), asyncHandler(async (req, res) => {
  if (PAYOS_ENABLED || !DEMO_PAYMENT_ENABLED || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
    return res.status(403).json({ message: 'Chỉ cho phép mô phỏng thanh toán khi chạy local.' });
  }
  const code = String(req.params.code || '').trim().toUpperCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(`SELECT id, booking_code, amount_vnd, status, payment_status, hold_expires_at
      FROM bookings WHERE booking_code=$1 FOR UPDATE`, [code]);
    if (!r.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy đơn.' }); }
    const b=r.rows[0];
    if (b.status!=='PENDING_PAYMENT' || new Date(b.hold_expires_at) <= new Date()) {
      await client.query('ROLLBACK'); return res.status(409).json({ message: 'Đơn đã hết hạn hoặc không ở trạng thái chờ thanh toán.' });
    }
    // Giao dịch giả lập, duy nhất một lần/đơn; không có giao dịch ngân hàng.
    await client.query(`INSERT INTO payment_events (booking_id, provider, provider_event_id, amount_vnd, result)
      VALUES ($1,'MOCK',$2,$3,'VERIFIED_DEMO')`, [b.id, `DEMO-${b.id}`, b.amount_vnd]);
    const updated = await client.query(`UPDATE bookings SET status='CONFIRMED', payment_status='PAID', hold_expires_at=NULL,updated_at=NOW()
      WHERE id=$1 RETURNING booking_code,status,payment_status`,[b.id]);
    await scheduleBookingEmails(client, b.id);
    await writeAudit(client, null, 'MOCK_PAYMENT_CONFIRMATION', 'BOOKING', b.id, { bookingCode: code, provider: 'MOCK', realMoney: false });
    await client.query('COMMIT');
    return res.json({ ...updated.rows[0], message: 'Mô phỏng Webhook thành công. KHÔNG có tiền thật được chuyển.' });
  } catch (error) { await client.query('ROLLBACK'); if (error.code==='23505') return res.status(409).json({ message:'Sự kiện thanh toán mô phỏng đã được xử lý.' }); throw error; }
  finally { client.release(); }
}));

// Signed payOS webhook: verify before using any data. Reconcile and webhook share
// the same database transition to prevent duplicate notifications/status races.
app.post('/api/payos/webhook', asyncHandler(async (req,res) => {
  if(!payos) return res.status(503).json({message:'payOS chưa được cấu hình.'});
  let event;
  try { event = await payos.webhooks.verify(req.body); }
  catch { return res.status(400).json({message:'Chữ ký payOS không hợp lệ.'}); }
  // Non-success callbacks are acknowledged, but never mark a booking paid.
  if (req.body?.success!==true || req.body?.code!=='00' || event?.code!=='00') return res.json({success:true});
  const result = await syncVerifiedPayosPayment(pool, {
    orderCode:Number(event.orderCode), amount:Number(event.amount),
    reference:String(event.reference||''), source:'WEBHOOK', currency:event.currency || 'VND',
  });
  if (result.outcome==='UNKNOWN_ORDER') {
    // payOS may send a signed sample while registering the webhook.
    console.warn('Webhook có chữ ký hợp lệ nhưng không có orderCode tương ứng:',event.orderCode);
    return res.json({success:true,matched:false});
  }
  if (result.outcome.startsWith('INVALID_')) return res.status(400).json({message:'Dữ liệu webhook không hợp lệ.'});
  // Mismatch/late payment is safely recorded for owner review; acknowledge to
  // avoid provider retry storms (do NOT mark payment as successful).
  res.json({success:true,confirmed:['CONFIRMED','ALREADY_CONFIRMED'].includes(result.outcome),reviewRequired:['REVIEW_REQUIRED','AMOUNT_MISMATCH'].includes(result.outcome)});
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!isText(email, 190) || !isText(password, 200)) return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu.' });
  const result = await pool.query('SELECT id, full_name, email, password_hash, role, active FROM users WHERE LOWER(email)=LOWER($1)', [email.trim()]);
  if (!result.rowCount || !result.rows[0].active || !(await bcrypt.compare(password, result.rows[0].password_hash))) {
    return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
  }
  const user = result.rows[0];
  const token = jwt.sign({ id: user.id, email: user.email, name: user.full_name, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  await pool.query(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES ($1,'LOGIN','USER',$2,'{}'::jsonb)`, [user.id, String(user.id)]);
  res.json({ token, user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role } });
}));

app.get('/api/auth/me', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT id, full_name, email, role, active FROM users WHERE id=$1', [req.user.id]);
  if (!result.rowCount || !result.rows[0].active) return res.status(401).json({ message: 'Tài khoản không còn hoạt động.' });
  const u = result.rows[0];
  res.json({ id: u.id, fullName: u.full_name, email: u.email, role: u.role });
}));

app.get('/api/staff/summary', requireAuth, requireRole('EMPLOYEE'), asyncHandler(async (_req, res) => {
  const result = await pool.query(`SELECT
    COUNT(*) FILTER (WHERE booking_date=CURRENT_DATE AND status IN ('CONFIRMED','CHECKED_IN'))::int AS today_total,
    COUNT(*) FILTER (WHERE status='CONFIRMED')::int AS awaiting_checkin,
    COUNT(*) FILTER (WHERE status='PENDING_PAYMENT')::int AS pending_payment,
    COUNT(*) FILTER (WHERE status='CHECKED_IN')::int AS checked_in
    FROM bookings`);
  res.json(result.rows[0]);
}));

app.get('/api/staff/bookings', requireAuth, requireRole('EMPLOYEE'), asyncHandler(async (req, res) => {
  const { status, date, q } = req.query;
  const values = [];
  const where = [];
  if (status && status !== 'ALL') { values.push(status); where.push(`b.status=$${values.length}`); }
  if (date) { values.push(date); where.push(`b.booking_date=$${values.length}`); }
  if (q) { values.push(`%${String(q).slice(0,80)}%`); where.push(`(b.booking_code ILIKE $${values.length} OR b.customer_name ILIKE $${values.length} OR b.customer_phone ILIKE $${values.length})`); }
  const result = await pool.query(
    `SELECT b.id, b.booking_code, b.customer_name, b.customer_phone, b.booking_date, b.time_slot,
       b.amount_vnd, b.status, b.payment_status, r.name AS room_name, p.name AS package_name
     FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN packages p ON p.id=b.package_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY b.booking_date DESC, b.time_slot DESC LIMIT 300`, values,
  );
  res.json(result.rows);
}));

app.post('/api/staff/check-in/:code', requireAuth, requireRole('EMPLOYEE'), asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!isBookingCode(code)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Mã đặt phòng không hợp lệ.' });
    }
    const result = await client.query(`SELECT id,status,payment_status,booking_date::text AS booking_date,time_slot
      FROM bookings WHERE booking_code=$1 FOR UPDATE`, [code]);
    if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy mã đặt phòng.' }); }
    const booking = result.rows[0];
    if (booking.status === 'CHECKED_IN') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Đơn đã được check-in. Không thể quét hoặc nhập lại mã này.' });
    }
    if (booking.payment_status !== 'PAID' || booking.status !== 'CONFIRMED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Đơn chưa thanh toán hoặc không ở trạng thái đủ điều kiện check-in.' });
    }
    const check = checkinWindow(booking.booking_date, booking.time_slot);
    if (check === 'EARLY') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Chưa đến giờ nhận phòng. Có thể check-in sớm tối đa 30 phút.' });
    }
    if (check === 'LATE') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Đã quá 20 phút sau giờ đặt. Không thể check-in; vui lòng liên hệ nhân viên để xử lý.' });
    }
    if (check !== 'OK') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Thời gian đặt phòng không hợp lệ.' });
    }
    await client.query(`UPDATE bookings SET status='CHECKED_IN', checked_in_at=NOW(), updated_at=NOW() WHERE id=$1`, [booking.id]);
    await writeAudit(client, req.user.id, 'CHECK_IN', 'BOOKING', booking.id, { bookingCode: code });
    await client.query('COMMIT');
    res.json({ message: 'Check-in thành công.', bookingCode: code });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));

app.post('/api/staff/bookings/:id/cancel', requireAuth, requireRole('EMPLOYEE'), asyncHandler(async (req, res) => {
  const result = await pool.query(`UPDATE bookings SET status='CANCELLED', updated_at=NOW()
    WHERE id=$1 AND status='PENDING_PAYMENT' RETURNING id,booking_code,payment_status`, [req.params.id]);
  if (!result.rowCount) return res.status(409).json({ message: 'Không thể hủy đơn này ở trạng thái hiện tại.' });
  await pool.query(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details) VALUES ($1,'CANCEL_BOOKING','BOOKING',$2,$3::jsonb)`, [req.user.id, result.rows[0].id, JSON.stringify({ bookingCode: result.rows[0].booking_code })]);
  res.json({ message: 'Đã hủy đơn chưa thanh toán. Đơn đã thanh toán cần yêu cầu hoàn tiền và chủ quán phê duyệt.' });
}));

app.get('/api/staff/refunds', requireAuth, requireRole('EMPLOYEE'), asyncHandler(async (_req, res) => {
  const result = await pool.query(`SELECT rf.id, rf.reason, rf.amount_vnd, rf.status, rf.created_at,
    b.booking_code, b.customer_name, u.full_name AS requested_by_name
    FROM refunds rf JOIN bookings b ON b.id=rf.booking_id JOIN users u ON u.id=rf.requested_by
    ORDER BY rf.created_at DESC LIMIT 200`);
  res.json(result.rows);
}));

app.post('/api/staff/bookings/:id/refunds', requireAuth, requireRole('EMPLOYEE'), asyncHandler(async (req, res) => {
  const { reason, amountVnd } = req.body || {};
  if (!isText(reason, 500)) return res.status(400).json({ message: 'Vui lòng nhập lý do hoàn tiền.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bookingResult = await client.query('SELECT id,booking_code,amount_vnd,payment_status FROM bookings WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!bookingResult.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy đơn.' }); }
    const booking = bookingResult.rows[0];
    if (booking.payment_status !== 'PAID') { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Chỉ tạo yêu cầu hoàn tiền cho đơn đã thanh toán.' }); }
    const amount = Number(amountVnd ?? booking.amount_vnd);
    if (!Number.isInteger(amount) || amount <= 0 || amount > booking.amount_vnd) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Số tiền hoàn không hợp lệ.' }); }
    const pending = await client.query("SELECT id FROM refunds WHERE booking_id=$1 AND status='PENDING_APPROVAL'", [booking.id]);
    if (pending.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Đơn đã có yêu cầu hoàn tiền đang chờ duyệt.' }); }
    const refund = await client.query(`INSERT INTO refunds (booking_id,requested_by,reason,amount_vnd)
      VALUES ($1,$2,$3,$4) RETURNING id,status,amount_vnd`, [booking.id, req.user.id, reason.trim(), amount]);
    await writeAudit(client, req.user.id, 'REQUEST_REFUND', 'REFUND', refund.rows[0].id, { bookingCode: booking.booking_code, amountVnd: amount });
    await client.query('COMMIT');
    res.status(201).json({ ...refund.rows[0], message: 'Đã gửi yêu cầu hoàn tiền đến chủ quán phê duyệt. Chưa có tiền được chuyển.' });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));


// Không có endpoint hoàn tiền hoàn tất cho nhân viên. Chủ quán chỉ phê duyệt; payout cần tích hợp riêng.


app.get(
  '/api/owner/bookings',
  requireAuth,
  requireRole('OWNER'),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(`
      SELECT
        b.id,
        b.booking_code,
        b.customer_name,
        b.customer_phone,
        b.booking_date,
        b.time_slot,
        b.amount_vnd,
        b.status,
        b.payment_status,
        r.name AS room_name,
        p.name AS package_name
      FROM bookings b
      JOIN rooms r ON r.id = b.room_id
      JOIN packages p ON p.id = b.package_id
      ORDER BY b.booking_date DESC, b.time_slot DESC
      LIMIT 300
    `);

    res.json(result.rows);
  })
);


// Dashboard summary: the frontend previously called this missing endpoint (404).
app.get('/api/owner/summary', requireAuth, requireRole('OWNER'), asyncHandler(async (_req, res) => {
  const [bookings, staff, refunds] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='CONFIRMED')::int AS confirmed,
      COUNT(*) FILTER (WHERE status='CHECKED_IN')::int AS checked_in,
      COALESCE(SUM(amount_vnd) FILTER (WHERE payment_status IN ('PAID','REFUND_PENDING')),0)::bigint AS paid_revenue
      FROM bookings`),
    pool.query(`SELECT COUNT(*)::int AS total_staff FROM users WHERE role='EMPLOYEE' AND active=true`),
    pool.query(`SELECT COUNT(*)::int AS pending_refunds FROM refunds WHERE status='PENDING_APPROVAL'`),
  ]);
  res.json({...bookings.rows[0],...staff.rows[0],...refunds.rows[0]});
}));

app.get('/api/owner/staff', requireAuth, requireRole('OWNER'), asyncHandler(async (_req, res) => {
  const result = await pool.query(`SELECT id,full_name,email,role,active,created_at FROM users ORDER BY role,full_name`);
  res.json(result.rows);
}));

app.post('/api/owner/staff', requireAuth, requireRole('OWNER'), asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body || {};
  if (!isText(fullName,120) || !isText(email,190) || !isText(password,200) || password.length < 10) {
    return res.status(400).json({ message: 'Nhập họ tên, email và mật khẩu tối thiểu 10 ký tự.' });
  }
  const hash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(`INSERT INTO users (full_name,email,password_hash,role)
      VALUES ($1,LOWER($2),$3,'EMPLOYEE') RETURNING id,full_name,email,role,active`, [fullName.trim(), email.trim(), hash]);
    await pool.query(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details) VALUES ($1,'CREATE_STAFF','USER',$2,'{}'::jsonb)`, [req.user.id, result.rows[0].id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'Email đã tồn tại.' });
    throw error;
  }
}));

app.patch('/api/owner/staff/:id/active', requireAuth, requireRole('OWNER'), asyncHandler(async (req, res) => {
  const { active } = req.body || {};
  if (typeof active !== 'boolean') return res.status(400).json({ message: 'Trạng thái active không hợp lệ.' });
  const result = await pool.query(`UPDATE users SET active=$1 WHERE id=$2 AND role='EMPLOYEE'
    RETURNING id,full_name,email,role,active`, [active, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ message: 'Không tìm thấy nhân viên.' });
  await pool.query(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details) VALUES ($1,'UPDATE_STAFF_STATUS','USER',$2,$3::jsonb)`, [req.user.id, result.rows[0].id, JSON.stringify({ active })]);
  res.json(result.rows[0]);
}));

// Manual review only: no automatic refund or room re-allocation.
app.get('/api/owner/payment-reviews', requireAuth, requireRole('OWNER'), asyncHandler(async (_req,res) => {
  const result=await pool.query(`SELECT c.id,c.issue_type,c.status,c.observed_amount_vnd,
    c.transaction_ref,c.source,c.created_at,b.booking_code,b.amount_vnd AS expected_amount_vnd
    FROM payment_reconciliation_cases c JOIN bookings b ON b.id=c.booking_id
    WHERE c.status='OPEN' ORDER BY c.created_at DESC LIMIT 100`);
  res.json(result.rows);
}));

app.get('/api/owner/refunds', requireAuth, requireRole('OWNER'), asyncHandler(async (_req, res) => {
  const result = await pool.query(`SELECT rf.id,rf.reason,rf.amount_vnd,rf.status,rf.created_at,
    b.booking_code,b.customer_name,u.full_name AS requested_by_name
    FROM refunds rf JOIN bookings b ON b.id=rf.booking_id JOIN users u ON u.id=rf.requested_by
    ORDER BY rf.created_at DESC LIMIT 200`);
  res.json(result.rows);
}));

app.patch('/api/owner/refunds/:id/decision', requireAuth, requireRole('OWNER'), asyncHandler(async (req, res) => {
  const { decision } = req.body || {};
  if (!['APPROVE','REJECT'].includes(decision)) return res.status(400).json({ message: 'Quyết định không hợp lệ.' });
  const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const result = await pool.query(`UPDATE refunds SET status=$1,approved_by=$2,decided_at=NOW()
    WHERE id=$3 AND status='PENDING_APPROVAL' RETURNING id,booking_id,amount_vnd,status`, [status, req.user.id, req.params.id]);
  if (!result.rowCount) return res.status(409).json({ message: 'Yêu cầu không còn ở trạng thái chờ duyệt.' });
  if (decision === 'APPROVE') {
    await pool.query("UPDATE bookings SET payment_status='REFUND_PENDING',updated_at=NOW() WHERE id=$1", [result.rows[0].booking_id]);
  }
  await pool.query(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details)
    VALUES ($1,$2,'REFUND',$3,$4::jsonb)`, [req.user.id, decision === 'APPROVE' ? 'APPROVE_REFUND' : 'REJECT_REFUND', result.rows[0].id, JSON.stringify({ amountVnd: result.rows[0].amount_vnd })]);
  res.json({ ...result.rows[0], message: decision === 'APPROVE' ? 'Đã duyệt yêu cầu. Cần tích hợp cổng thanh toán để thực hiện chuyển tiền thật.' : 'Đã từ chối yêu cầu hoàn tiền.' });
}));

app.get('/api/owner/sms-reminders', requireAuth, requireRole('OWNER'), asyncHandler(async (_req, res) => {
  const result = await pool.query(`SELECT r.id, b.booking_code, r.due_at, r.status, r.attempts,
    r.sent_at, r.error_message FROM sms_reminders r JOIN bookings b ON b.id=r.booking_id
    ORDER BY r.due_at DESC LIMIT 100`);
  res.json(result.rows);
}));

app.get('/api/owner/email-notifications', requireAuth, requireRole('OWNER'), asyncHandler(async (_req, res) => {
  const result = await pool.query(`SELECT n.id,b.booking_code,n.kind,n.due_at,n.status,n.attempts,n.sent_at,n.error_message
    FROM email_notifications n JOIN bookings b ON b.id=n.booking_id
    ORDER BY n.created_at DESC LIMIT 100`);
  res.json({enabled:emailServiceEnabled(),notifications:result.rows});
}));

app.get('/api/owner/audit', requireAuth, requireRole('OWNER'), asyncHandler(async (_req, res) => {
  const result = await pool.query(`SELECT a.id,a.user_id,a.action,a.entity_type,a.entity_id,a.details,a.created_at,
    u.full_name,u.email AS actor_email,u.role AS actor_role
    FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 250`);
  res.json(result.rows);
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Có lỗi máy chủ. Vui lòng thử lại hoặc liên hệ quản trị viên.' });
});

app.listen(PORT, () => console.log(`Hibi Booth API đang chạy tại http://localhost:${PORT}`));
startEmailNotificationWorker(pool);
createHoldExpirationWorker(pool).start();

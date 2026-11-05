// COMMIT 13: Staff records late arrivals or no-shows explicitly after the
// check-in grace period. This does not initiate refunds or payment transfers.
import { bookingStartMs, CHECKIN_LATE_MINUTES } from './business-rules.js';

export class AttendanceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AttendanceError';
    this.status = status;
  }
}

export const ATTENDANCE_OUTCOMES = Object.freeze(['LATE_ARRIVAL', 'NO_SHOW']);

export function attendanceEligibility(booking, nowMs = Date.now()) {
  if (!booking) return { allowed: false, reason: 'NOT_FOUND', message: 'Không tìm thấy đơn đặt phòng.' };
  if (booking.status === 'NO_SHOW') return { allowed: false, reason: 'ALREADY_NO_SHOW', message: 'Đơn đã được ghi nhận không đến.' };
  if (booking.status === 'CHECKED_IN') return { allowed: false, reason: 'ALREADY_CHECKED_IN', message: 'Khách đã check-in, không thể ghi nhận đến trễ hoặc vắng.' };
  if (booking.status !== 'CONFIRMED' || booking.payment_status !== 'PAID') {
    return { allowed: false, reason: 'INACTIVE', message: 'Chỉ xử lý đơn đã xác nhận và thanh toán, chưa check-in.' };
  }
  const start = bookingStartMs(booking.booking_date, booking.time_slot);
  if (!Number.isFinite(start) || !Number.isFinite(nowMs)) {
    return { allowed: false, reason: 'INVALID_DATE', message: 'Thời gian đặt phòng không hợp lệ.' };
  }
  // The normal check-in window INCLUDES exactly +20 minutes.
  if (nowMs <= start + CHECKIN_LATE_MINUTES * 60_000) {
    return { allowed: false, reason: 'NOT_LATE', message: 'Chưa quá 20 phút sau giờ hẹn. Vẫn có thể check-in theo quy định.' };
  }
  return { allowed: true, reason: 'LATE', message: 'Đã quá thời gian check-in. Nhân viên cần ghi nhận trường hợp thực tế.' };
}

export function validAttendanceNote(note) {
  return typeof note === 'string' && note.trim().length >= 5 && note.trim().length <= 500;
}

// Caller owns BEGIN/COMMIT/ROLLBACK. The row lock serializes attendance
// actions with check-in and other booking-status transitions.
export async function recordAttendance({ client, bookingId, staffId, outcome, note, audit }) {
  if (!Number.isSafeInteger(Number(bookingId)) || Number(bookingId) < 1 ||
      !Number.isSafeInteger(Number(staffId)) || Number(staffId) < 1) {
    throw new AttendanceError(400, 'Mã đơn hoặc nhân viên không hợp lệ.');
  }
  if (!ATTENDANCE_OUTCOMES.includes(outcome)) throw new AttendanceError(400, 'Loại xử lý không hợp lệ.');
  if (!validAttendanceNote(note)) throw new AttendanceError(400, 'Vui lòng nhập ghi chú từ 5 đến 500 ký tự.');

  const locked = await client.query(
    `SELECT id, booking_code, booking_date::text AS booking_date, time_slot,
            status, payment_status FROM bookings WHERE id=$1 FOR UPDATE`, [Number(bookingId)]
  );
  if (!locked.rowCount) throw new AttendanceError(404, 'Không tìm thấy đơn đặt phòng.');
  const booking = locked.rows[0];
  // Database time is read AFTER acquiring the lock, not from the staff browser.
  const now = await client.query('SELECT clock_timestamp() AS db_now');
  const nowMs = new Date(now.rows[0]?.db_now).getTime();
  const eligibility = attendanceEligibility(booking, nowMs);
  if (!eligibility.allowed) throw new AttendanceError(409, eligibility.message);

  const existing = await client.query(
    `SELECT kind FROM booking_attendance_incidents WHERE booking_id=$1 FOR UPDATE`, [booking.id]
  );
  if (existing.rowCount) {
    throw new AttendanceError(409, 'Đơn đã được ghi nhận đến trễ hoặc không đến. Vui lòng tải lại danh sách.');
  }

  // NO_SHOW removes the booking from occupied slots but does NOT change PAID,
  // create a refund, or mark the payment as refunded.
  if (outcome === 'NO_SHOW') {
    const updated = await client.query(
      `UPDATE bookings SET status='NO_SHOW', updated_at=clock_timestamp()
       WHERE id=$1 AND status='CONFIRMED' AND payment_status='PAID'
       RETURNING id`, [booking.id]
    );
    if (updated.rowCount !== 1) throw new AttendanceError(409, 'Trạng thái đơn vừa thay đổi. Vui lòng tra cứu lại.');
  }

  await client.query(
    `INSERT INTO booking_attendance_incidents (booking_id,kind,note,recorded_by)
     VALUES ($1,$2,$3,$4)`, [booking.id, outcome, note.trim(), Number(staffId)]
  );
  await audit(client, Number(staffId), outcome === 'NO_SHOW' ? 'MARK_NO_SHOW' : 'RECORD_LATE_ARRIVAL',
    'BOOKING', booking.id, { bookingCode: booking.booking_code, note: note.trim() });
  return {
    bookingCode: booking.booking_code,
    outcome,
    message: outcome === 'NO_SHOW'
      ? 'Đã ghi nhận khách không đến và giải phóng suất đặt. Không tự hoàn tiền.'
      : 'Đã ghi nhận khách đến trễ. Chưa check-in, chưa đổi lịch hoặc hoàn tiền.',
  };
}

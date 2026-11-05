// COMMIT 12: one source of truth for verifying a check-in before the final write.
import { isBookingCode, checkinWindow } from './business-rules.js';

export class CheckinError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'CheckinError';
    this.status = status;
  }
}

// Customer QR payload: HIBI|HB-... ; manual entry: HB-...
// Never accept the payment QR, arbitrary URLs, or a QR with extra fields.
export function parseCheckinCode(value) {
  if (typeof value !== 'string' || value.length > 100) return null;
  let normalized = value.trim().toUpperCase();
  if (normalized.startsWith('HIBI|')) normalized = normalized.slice(5);
  return isBookingCode(normalized) ? normalized : null;
}

export function checkinEligibility(booking, nowMs = Date.now()) {
  if (!booking) return { allowed: false, reason: 'NOT_FOUND', message: 'Không tìm thấy mã đặt phòng.' };
  if (booking.status === 'CHECKED_IN') {
    return { allowed: false, reason: 'ALREADY_CHECKED_IN', message: 'Đơn đã check-in. Không thể sử dụng mã lần thứ hai.' };
  }
  if (booking.status === 'CANCELLED' || booking.status === 'EXPIRED' || booking.status === 'NO_SHOW') {
    return { allowed: false, reason: 'BOOKING_INACTIVE', message: 'Đơn đã hủy hoặc hết hạn, không thể check-in.' };
  }
  if (booking.payment_status !== 'PAID' || booking.status !== 'CONFIRMED') {
    return { allowed: false, reason: 'NOT_CONFIRMED', message: 'Đơn chưa được xác nhận thanh toán hoặc chưa đủ điều kiện check-in.' };
  }
  const window = checkinWindow(booking.booking_date, booking.time_slot, nowMs);
  if (window === 'EARLY') return { allowed: false, reason: 'TOO_EARLY', message: 'Chưa đến giờ nhận phòng (chỉ được sớm tối đa 30 phút).' };
  if (window === 'LATE') return { allowed: false, reason: 'TOO_LATE', message: 'Đã quá 20 phút sau giờ hẹn; chuyển nhân viên xử lý theo quy trình khách đến trễ.' };
  if (window !== 'OK') return { allowed: false, reason: 'INVALID_TIME', message: 'Ngày hoặc giờ đặt phòng không hợp lệ.' };
  return { allowed: true, reason: 'OK', message: 'Đơn đủ điều kiện check-in. Vui lòng đối chiếu thông tin khách trước khi xác nhận.' };
}

// Must be called within a transaction; caller owns BEGIN/COMMIT/ROLLBACK.
// FOR UPDATE serializes two employees attempting to check in the same booking.
export async function applyCheckin({ client, rawCode, staffId, audit, nowMs }) {
  const code = parseCheckinCode(rawCode);
  if (!code) throw new CheckinError(400, 'Mã QR hoặc mã đặt phòng không hợp lệ.');
  const result = await client.query(
    `SELECT id,status,payment_status,booking_date::text AS booking_date,time_slot
       FROM bookings WHERE booking_code=$1 FOR UPDATE`, [code]
  );
  if (!result.rowCount) throw new CheckinError(404, 'Không tìm thấy mã đặt phòng.');
  const booking = result.rows[0];
  const eligibility = checkinEligibility(booking, nowMs ?? Date.now());
  if (!eligibility.allowed) throw new CheckinError(eligibility.reason === 'INVALID_TIME' ? 400 : 409, eligibility.message);

  // A final conditional UPDATE protects against a stale or inconsistent record.
  const updated = await client.query(
    `UPDATE bookings SET status='CHECKED_IN',checked_in_at=NOW(),updated_at=NOW()
       WHERE id=$1 AND status='CONFIRMED' AND payment_status='PAID' RETURNING id`, [booking.id]
  );
  if (updated.rowCount !== 1) throw new CheckinError(409, 'Đơn vừa thay đổi trạng thái. Vui lòng tra cứu lại.');
  await audit(client, staffId, 'CHECK_IN', 'BOOKING', booking.id, { bookingCode: code });
  return { bookingCode: code, message: 'Check-in thành công.' };
}

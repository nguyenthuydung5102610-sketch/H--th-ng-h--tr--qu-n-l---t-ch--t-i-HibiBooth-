// Customer requests an assessment, not a payout. Staff and owner retain approval rights.
import { bookingStartMs, CHECKIN_LATE_MINUTES } from './business-rules.js';

export function canRequestRefundAssistance(booking, nowMs = Date.now()) {
  if (!booking || booking.payment_status !== 'PAID') return false;
  if (['NO_SHOW', 'CANCELLED', 'EXPIRED'].includes(booking.status)) return true;
  if (booking.status !== 'CONFIRMED') return false;
  const start = bookingStartMs(booking.booking_date, booking.time_slot);
  return Number.isFinite(start) && Number.isFinite(nowMs) && nowMs > start + CHECKIN_LATE_MINUTES * 60000;
}

export function validRefundAssistanceReason(reason) {
  return typeof reason === 'string' && reason.trim().length >= 5 && reason.trim().length <= 500;
}

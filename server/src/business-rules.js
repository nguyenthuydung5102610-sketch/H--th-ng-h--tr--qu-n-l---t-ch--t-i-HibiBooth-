// Business rules used in both Express and automated tests.
export const BOOKING_ADVANCE_MINUTES = 30;
export const SESSION_MINUTES = 30;
export const CHECKIN_LATE_MINUTES = 20;
export const CHECKIN_EARLY_MINUTES = 30;
const VIETNAM_TZ = '+07:00';

export function validCustomerName(input) {
  if (typeof input !== 'string') return false;
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) return false;
  if ([...name].filter(c => /\p{L}/u.test(c)).length < 2) return false;
  return /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u.test(name);
}

export function isValidDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function bookingStartMs(date, slot) {
  if (!isValidDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(slot))) return NaN;
  return Date.parse(`${date}T${slot}:00${VIETNAM_TZ}`);
}

export function isBookableAt(date, slot, nowMs = Date.now()) {
  return Number.isFinite(bookingStartMs(date, slot)) && bookingStartMs(date, slot) - nowMs >= BOOKING_ADVANCE_MINUTES * 60_000;
}

export function checkinWindow(date, slot, nowMs = Date.now()) {
  const start = bookingStartMs(date, slot);
  if (!Number.isFinite(start)) return 'INVALID';
  if (nowMs < start - CHECKIN_EARLY_MINUTES * 60_000) return 'EARLY';
  if (nowMs > start + CHECKIN_LATE_MINUTES * 60_000) return 'LATE';
  return 'OK';
}

// Counter is per issuance date in Viet Nam, so the last 8 digits always DDMMYYYY.
// Example: booking number 10 issued on 04/11/2006 => HB-1004112006.
export function formatBookingCode(n, issueDate) {
  if (!Number.isSafeInteger(n) || n < 1 || !isValidDate(issueDate)) throw new Error('Invalid booking code inputs');
  const [yyyy,mm,dd] = issueDate.split('-');
  return `HB-${n}${dd}${mm}${yyyy}`;
}

export function isBookingCode(code) {
  return typeof code === 'string' && /^HB-(?:[A-F0-9]{24}|[1-9]\d{8,19})$/.test(code);
}

// Booking intervals are half-open: [start, end). Existing bookings may still
// occupy 60 minutes; new ones occupy 30 minutes. Adjacent sessions don't overlap.
export function slotsOverlap(a, b, durationMinutes = SESSION_MINUTES, existingDurationMinutes = durationMinutes) {
  const toMinute = value => {
    if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  };
  const aMin = toMinute(a);
  const bMin = toMinute(b);
  return Number.isFinite(aMin) && Number.isFinite(bMin)
    && Number.isInteger(durationMinutes) && durationMinutes > 0
    && Number.isInteger(existingDurationMinutes) && existingDurationMinutes > 0
    && aMin < bMin + existingDurationMinutes && bMin < aMin + durationMinutes;
}

export function isSessionWithinOpeningHours(slot, durationMinutes = SESSION_MINUTES) {
  if (typeof slot !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot)) return false;
  const [hours, minutes] = slot.split(':').map(Number);
  const start = hours * 60 + minutes;
  return Number.isInteger(durationMinutes) && durationMinutes > 0
    && start >= 9 * 60 && start + durationMinutes <= 23 * 60;
}

// A check-in QR is useful only for an actually paid, active booking.
export function canIssueCheckinQr(status, paymentStatus) {
  return paymentStatus === 'PAID' && (status === 'CONFIRMED' || status === 'CHECKED_IN');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomerPhone, validateRescheduleInput, canRequestReschedule } from '../src/reschedule-rules.js';
import { bookingStartMs } from '../src/business-rules.js';
const slots = ['09:00','09:30','10:00','22:00'];
const now = bookingStartMs('2026-11-08','09:00') - 40 * 60_000;
const valid = { customerPhone:'0901234567', newDate:'2026-11-08', newTimeSlot:'09:00', reason:'Đổi lịch do có việc đột xuất' };
test('normalizes a Vietnamese customer phone', () => {
  assert.equal(normalizeCustomerPhone('090 123 4567'), '0901234567');
  assert.equal(normalizeCustomerPhone('090-123-4567'), '0901234567');
  assert.equal(normalizeCustomerPhone('0000000000'), null);
});
test('accepts a valid reschedule request', () => assert.equal(validateRescheduleInput(valid, slots, now), null));
test('rejects invalid date, closed slot, and requests within 30 minutes', () => {
  assert.match(validateRescheduleInput({...valid,newDate:'2026-02-30'},slots,now), /Ngày/);
  assert.match(validateRescheduleInput({...valid,newTimeSlot:'23:30'},slots,now), /Khung giờ/);
  assert.match(validateRescheduleInput(valid,slots,bookingStartMs(valid.newDate,valid.newTimeSlot)-29*60_000), /30 phút/);
});
test('rejects malformed identity and reasons', () => {
  assert.match(validateRescheduleInput({...valid,customerPhone:'0123'},slots,now), /số điện thoại/);
  assert.match(validateRescheduleInput({...valid,reason:'x'},slots,now), /lý do/);
  assert.match(validateRescheduleInput({...valid,reason:'x'.repeat(501)},slots,now), /lý do/);
});
test('only paid confirmed bookings may request rescheduling', () => {
  assert.equal(canRequestReschedule('CONFIRMED','PAID'),true);
  assert.equal(canRequestReschedule('PENDING_PAYMENT','PENDING'),false);
  assert.equal(canRequestReschedule('CHECKED_IN','PAID'),false);
  assert.equal(canRequestReschedule('CANCELLED','PAID'),false);
});

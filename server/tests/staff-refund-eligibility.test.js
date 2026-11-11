import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { staffRefundEligibility } from '../src/staff-refund-rules.js';

const start = Date.parse('2026-11-05T15:30:00+07:00');
const base = Object.freeze({
  booking_date: '2026-11-05', time_slot: '15:30',
  payment_status: 'PAID', status: 'CONFIRMED', refund_request_exists: false,
});

test('paid confirmed, before check-in expiry: hide refund', () => {
  assert.equal(staffRefundEligibility(base, start - 1).allowed, false);
  assert.equal(staffRefundEligibility(base, start + 19 * 60_000).allowed, false);
});

test('paid confirmed, exactly at +20 min: not yet eligible', () => {
  const result = staffRefundEligibility(base, start + 20 * 60_000);
  assert.deepEqual([result.allowed,result.reason],[false,'NOT_OVERDUE']);
});

test('paid confirmed, beyond +20 min: staff may request owner review', () => {
  const result = staffRefundEligibility(base, start + 20 * 60_000 + 1);
  assert.equal(result.allowed, true);
});

test('paid NO_SHOW booking: staff may request', () => {
  assert.equal(staffRefundEligibility({...base,status:'NO_SHOW'}, start).allowed, true);
});

test('paid CANCELLED booking: existing cancellation refund path preserved', () => {
  assert.equal(staffRefundEligibility({...base,status:'CANCELLED'},start - 1000).allowed, true);
});

test('EXPIRED booking already marked PAID: staff may request review', () => {
  assert.equal(staffRefundEligibility({...base,status:'EXPIRED'},start + 900_000_000).allowed,true);
});

test('EXPIRED unpaid hold: no refund is possible, even past check-in time', () => {
  const result = staffRefundEligibility({...base,status:'EXPIRED',payment_status:'PENDING'},start+900_000_000);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'NOT_PAID');
});

test('PAID checked in booking cannot request a late arrival refund', () => {
  assert.equal(staffRefundEligibility({...base,status:'CHECKED_IN'},start + 900_000_000).allowed, false);
});

test('already pending/approved refund cannot be requested twice', () => {
  const result = staffRefundEligibility({...base,status:'NO_SHOW',refund_request_exists:true},start+900_000_000);
  assert.equal(result.allowed,false);
  assert.equal(result.reason,'ALREADY_REQUESTED');
  assert.equal(staffRefundEligibility({...base,payment_status:'REFUND_PENDING',status:'NO_SHOW'},start+900_000_000).allowed,false);
});

test('missing or malformed date: do not display refund action', () => {
  assert.equal(staffRefundEligibility(null).allowed,false);
  assert.equal(staffRefundEligibility({...base,booking_date:'invalid'},start+900_000_000).allowed,false);
});

test('staff listing returns refund eligibility, and POST checks the same rule within a transaction', () => {
  const source=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const listing=source.slice(source.indexOf("app.get('/api/staff/bookings'"),source.indexOf('// Validate before check-in'));
  assert.match(listing,/refund_request_eligible: refund\.allowed/);
  assert.match(listing,/refund_request_exists/);
  const creating=source.slice(source.indexOf("app.post('/api/staff/bookings/:id/refunds'"),source.indexOf('// Không có endpoint hoàn tiền'));
  assert.match(creating,/FOR UPDATE/);
  assert.match(creating,/staffRefundEligibility\(booking/);
  assert.match(creating,/clock_timestamp\(\)/);
  assert.match(creating,/ROLLBACK/);
  assert.match(creating,/PENDING_APPROVAL/);
});

test('staff UI uses API eligibility instead of PAID-only condition', () => {
  const source=readFileSync(new URL('../../client/src/pages/StaffPages.tsx',import.meta.url),'utf8');
  assert.ok(source.includes('row.refund_request_eligible&&<button'));
  assert.ok(!source.includes("row.payment_status==='PAID'&&<button className=\"button tiny light\""));
});

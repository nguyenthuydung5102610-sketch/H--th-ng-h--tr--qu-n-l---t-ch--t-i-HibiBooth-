import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canRequestRefundAssistance, validRefundAssistanceReason } from '../src/refund-assistance.js';

const booking = { booking_date:'2026-11-05', time_slot:'15:30', status:'CONFIRMED', payment_status:'PAID' };
const start = Date.parse('2026-11-05T15:30:00+07:00');
test('at exactly +20 minutes, refund review is not unlocked',()=> {
 assert.equal(canRequestRefundAssistance(booking,start+20*60_000),false);
});
test('at +20 minutes and one millisecond, paid customer can ask for review',()=> {
 assert.equal(canRequestRefundAssistance(booking,start+20*60_000+1),true);
});
test('paid NO_SHOW can ask for refund review',()=> {
 assert.equal(canRequestRefundAssistance({...booking,status:'NO_SHOW'},start+1),true);
});
test('paid CANCELLED can ask for refund review',()=> {
 assert.equal(canRequestRefundAssistance({...booking,status:'CANCELLED'},start-30_000),true);
});
test('unpaid expired hold cannot ask for a refund',()=> {
 assert.equal(canRequestRefundAssistance({...booking,status:'EXPIRED',payment_status:'PENDING'},start+1_000_000),false);
});
test('paid check-in never becomes overdue refund request',()=> {
 assert.equal(canRequestRefundAssistance({...booking,status:'CHECKED_IN'},start+1_000_000),false);
});
test('pending owner approval cannot open a new review',()=> {
 assert.equal(canRequestRefundAssistance({...booking,status:'NO_SHOW',payment_status:'REFUND_PENDING'},start+1_000_000),false);
});
test('invalid date or invalid time does not unlock refund request',()=> {
 assert.equal(canRequestRefundAssistance({...booking,booking_date:'invalid'},start+1_000_000),false);
 assert.equal(canRequestRefundAssistance({...booking,time_slot:'55:99'},start+1_000_000),false);
 assert.equal(canRequestRefundAssistance(null),false);
});
test('reason must be actual nonempty string between 5 and 500 chars',()=> {
 for(const v of [undefined,null,3,{},'bận','  ', 'x'.repeat(501)])assert.equal(validRefundAssistanceReason(v),false);
 for(const v of ['không thể đến', ' '.repeat(4)+'lý do', 'x'.repeat(500)])assert.equal(validRefundAssistanceReason(v),true);
});
test('request API has booking and phone verification, locking, unique duplicate check, rollback and audit',()=> {
 const src=readFileSync(new URL('../src/server.js', import.meta.url),'utf8');
 const route=src.slice(src.indexOf("app.post('/api/bookings/:code/refund-assistance'"),src.indexOf('// CUSTOMER SELF-SERVICE: cancellation'));
 assert.match(route,/customer_phone=\$2 FOR UPDATE/);
 assert.match(route,/canRequestRefundAssistance\(/);
 assert.match(route,/ON CONFLICT \(booking_id\) DO NOTHING/);
 assert.match(route,/CUSTOMER_REQUEST_REFUND_REVIEW/);
 assert.match(route,/ROLLBACK/);
 assert.doesNotMatch(route,/UPDATE bookings SET payment_status/);
 assert.doesNotMatch(route,/INSERT INTO refunds/);
});
test('staff can only forward review in existing refund workflow',()=> {
 const src=readFileSync(new URL('../src/server.js', import.meta.url),'utf8');
 assert.match(src,/app\.get\('\/api\/staff\/refund-assistance',requireAuth,requireRole\('EMPLOYEE'\)/);
 assert.match(src,/UPDATE customer_refund_assistance SET status='FORWARDED'/);
});

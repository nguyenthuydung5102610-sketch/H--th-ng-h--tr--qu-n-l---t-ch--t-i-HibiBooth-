import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cancellationMode, isCancellationReasonValid } from '../src/cancellation-rules.js';
import { canRequestReschedule, validateRescheduleInput } from '../src/reschedule-rules.js';
import { bookingStartMs } from '../src/business-rules.js';
const root=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(join(root,'../src/server.js'),'utf8');
const schema=readFileSync(join(root,'../sql/schema.sql'),'utf8');
const page=readFileSync(join(root,'../../client/src/pages/PublicPages.tsx'),'utf8');
const layout=readFileSync(join(root,'../../client/src/components/Layout.tsx'),'utf8');
const app=readFileSync(join(root,'../../client/src/App.tsx'),'utf8');
const slots=['09:00','09:30','10:00','22:00'];
const now=bookingStartMs('2026-11-08','09:00') - 40*60_000;
test('paid/confirmed customer may cancel without employee approval',()=>{
 assert.equal(cancellationMode('CONFIRMED','PAID'),'IMMEDIATE');
 assert.equal(cancellationMode('PENDING_PAYMENT','PENDING'),'IMMEDIATE');
});
test('expired hold cannot be cancelled as if active',()=>{
 assert.equal(cancellationMode('PENDING_PAYMENT','PENDING',{holdExpiresAt:new Date(now),nowMs:now}),'EXPIRED');
});
test('checked-in/no-show/cancelled bookings cannot self-cancel',()=>{
 for(const s of ['CHECKED_IN','NO_SHOW','CANCELLED','EXPIRED']) assert.equal(cancellationMode(s,'PAID'),'BLOCKED');
});
test('self-cancellation reason remains validated',()=>{
 assert.ok(!isCancellationReasonValid('x'));
 assert.ok(isCancellationReasonValid('Không còn nhu cầu đến chụp'));
});
test('reschedule requires confirmed paid, valid slots and 30 minute notice',()=>{
 assert.equal(canRequestReschedule('CONFIRMED','PAID'),true);
 assert.equal(canRequestReschedule('CHECKED_IN','PAID'),false);
 const details={customerPhone:'0901234567',newDate:'2026-11-08',newTimeSlot:'09:00',reason:'Muốn đổi sang giờ còn trống'};
 assert.equal(validateRescheduleInput(details,slots,now),null);
 assert.ok(validateRescheduleInput({...details,newTimeSlot:'23:00'},slots,now));
 assert.ok(validateRescheduleInput(details,slots,bookingStartMs(details.newDate,details.newTimeSlot)-29*60_000));
});
test('cancellation update guarded by DB clock and immediately releases room',()=>{
 assert.match(source,/UPDATE bookings SET status='CANCELLED',updated_at=NOW\(\)/);
 assert.match(source,/hold_expires_at>NOW\(\)/);
 assert.match(source,/AT TIME ZONE 'Asia\/Ho_Chi_Minh'\)>NOW\(\)/);
});
test('reschedule checks room lock, competing bookings and old booking start',()=>{
 const start=source.indexOf("app.post('/api/bookings/:code/reschedule-requests'");
 const end=source.indexOf("app.get('/api/bookings/:code/reschedule-requests'",start);
 const route=source.slice(start,end);
 assert.match(route,/SELECT id FROM rooms WHERE id=\$1 FOR UPDATE/);
 assert.match(route,/\+ duration_minutes/);
 assert.match(route,/\$4::int < /);
 assert.match(route,/status='CONFIRMED' AND payment_status='PAID'/);
 assert.match(route,/ROLLBACK/);
});
test('direct reschedule archives pending legacy requests and records new approved event',()=>{
 assert.match(source,/UPDATE booking_reschedule_requests SET status='CANCELLED'/);
 assert.match(source,/VALUES\(\$1,'CUSTOMER',\$2,\$3,\$4,\$5,\$6,'APPROVED',NULL,NOW\(\)/);
 assert.match(schema,/status='APPROVED' AND reviewed_at IS NOT NULL/);
});
test('refund remains a separate action with owner approval',()=>{
 assert.match(source,/refundAutomatic:false/);
 assert.match(source,/app\.post\('\/api\/staff\/bookings\/:id\/refunds'/);
 assert.match(source,/app\.patch\('\/api\/owner\/refunds\/:id\/decision'/);
});
test('legacy reschedule/cancellation decision APIs are disabled',()=>{
 assert.match(source,/status\(410\)\.json\(\{message:'Không còn xét duyệt hủy lịch/);
 assert.match(source,/status\(410\)\.json\(\{message:'Không còn xét duyệt đổi lịch/);
});
test('UI only shows direct customer actions, not staff/owner approval pages',()=>{
 assert.ok(page.includes('Xác nhận đổi lịch ngay'));
 assert.ok(page.includes('Xác nhận hủy lịch ngay'));
 assert.ok(!layout.includes("to:'/chu-quan/doi-lich'"));
 assert.ok(!layout.includes("to:'/nhan-vien/huy-lich'"));
 assert.ok(!app.includes('RescheduleManagementPage'));
});

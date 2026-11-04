import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRescheduleDecision, canApproveReschedule } from '../src/reschedule-rules.js';
import { bookingStartMs } from '../src/business-rules.js';
import { rescheduleDecisionEmailMessage } from '../src/email-notifications.js';

const now = bookingStartMs('2026-11-20','12:00') - 40*60_000;
const slots=['09:00','12:00','12:30','22:00'];

test('XOR decision accepts only APPROVE or REJECT', () => {
  assert.equal(validateRescheduleDecision({decision:'APPROVE'}),null);
  assert.equal(validateRescheduleDecision({decision:'REJECT',decisionReason:'Không đáp ứng điều kiện'}),null);
  assert.match(validateRescheduleDecision({decision:'CANCEL'}),/APPROVE/);
});
test('rejection requires meaningful reason', () => {
  assert.match(validateRescheduleDecision({decision:'REJECT'}),/lý do/);
  assert.match(validateRescheduleDecision({decision:'REJECT',decisionReason:'a'}),/lý do/);
  assert.match(validateRescheduleDecision({decision:'APPROVE',decisionReason:'a'.repeat(501)}),/500/);
});
test('approval rechecks time and accepted slot', () => {
  assert.equal(canApproveReschedule('2026-11-20','12:00',slots,now),true);
  assert.equal(canApproveReschedule('2026-11-20','12:00',slots,bookingStartMs('2026-11-20','12:00')-29*60_000),false);
  assert.equal(canApproveReschedule('2026-11-20','23:00',slots,now),false);
});
const base={decision_status:'APPROVED',booking_code:'HB-111202026',customer_name:'An',room_name:'Phông đỏ',
  new_booking_date:'2026-11-20',new_time_slot:'12:00',old_booking_date:'2026-11-19',old_time_slot:'09:00'};
test('approval notice clearly gives new time and calendar update',()=>{
  const x=rescheduleDecisionEmailMessage(base);
  assert.match(x.subject,/Đổi lịch đã được duyệt/);
  assert.match(x.text,/12:00 ngày 20\/11\/2026/);
  assert.match(x.text,/Google Calendar/);
});
test('rejection notice preserves old time and reason',()=>{
  const x=rescheduleDecisionEmailMessage({...base,decision_status:'REJECTED',decision_reason:'Không thể điều chỉnh ca chụp'});
  assert.match(x.text,/Lịch ban đầu vẫn giữ nguyên: 09:00 ngày 19\/11\/2026/);
  assert.match(x.text,/Không thể điều chỉnh ca chụp/);
});

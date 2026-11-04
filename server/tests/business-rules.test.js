import test from 'node:test';
import assert from 'node:assert/strict';
import { validCustomerName, isValidDate, bookingStartMs, isBookableAt, checkinWindow, formatBookingCode, isBookingCode, slotsOverlap, canIssueCheckinQr } from '../src/business-rules.js';

test('validates Vietnamese customer names and rejects names containing numbers',()=>{
  for (const name of ['Nguyễn Văn A','Đặng Thị Ngọc','Trần-Anh','Lê Thị Bích']) assert.equal(validCustomerName(name),true,name);
  for (const name of ['123','Nguyen123','A1','', '  ', 'A', '@#$']) assert.equal(validCustomerName(name),false,name);
});

test('booking code example HB-1004112006 is 10th booking created 04/11/2006',()=>{
  assert.equal(formatBookingCode(10,'2006-11-04'),'HB-1004112006');
  assert.equal(formatBookingCode(1,'2026-11-04'),'HB-104112026');
  assert.equal(isBookingCode('HB-1004112006'),true);
  assert.equal(isBookingCode('HB-1A2B3C4D'),false);
  assert.equal(isBookingCode('HB-ABCDEF1234567890ABCDEF12'),true); // old format remains valid
});

test('reject impossible dates',()=>{
  assert.equal(isValidDate('2026-02-30'),false);
  assert.equal(isValidDate('2026-11-04'),true);
});

test('requires booking at least 30 minutes in advance',()=>{
  const begin=bookingStartMs('2026-11-04','11:00');
  assert.equal(isBookableAt('2026-11-04','11:00',begin-30*60000),true);
  assert.equal(isBookableAt('2026-11-04','11:00',begin-29*60000-59000),false);
  assert.equal(isBookableAt('2026-11-04','11:00',begin+1),false);
});

test('check-in: 11:04 valid, 11:20 valid, 11:20:01 late',()=>{
  const start=bookingStartMs('2026-11-04','11:00');
  assert.equal(checkinWindow('2026-11-04','11:00',start+4*60000),'OK');
  assert.equal(checkinWindow('2026-11-04','11:00',start+20*60000),'OK');
  assert.equal(checkinWindow('2026-11-04','11:00',start+20*60000+1000),'LATE');
  assert.equal(checkinWindow('2026-11-04','11:00',start-31*60000),'EARLY');
});

test('60-minute bookings block overlapping 30-minute slots but permit adjacent sessions', () => {
  assert.equal(slotsOverlap('09:00', '09:30'), true);
  assert.equal(slotsOverlap('09:00', '10:00'), false);
  assert.equal(slotsOverlap('09:30', '10:00'), true);
  assert.equal(slotsOverlap('22:00', '22:30'), true);
  assert.equal(slotsOverlap('bad', '09:00'), false);
});

test('only paid active bookings receive check-in QR', () => {
  assert.equal(canIssueCheckinQr('PENDING_PAYMENT', 'PENDING'), false);
  assert.equal(canIssueCheckinQr('EXPIRED', 'PENDING'), false);
  assert.equal(canIssueCheckinQr('CONFIRMED', 'PAID'), true);
  assert.equal(canIssueCheckinQr('CHECKED_IN', 'PAID'), true);
  assert.equal(canIssueCheckinQr('CANCELLED', 'PAID'), false);
  assert.equal(canIssueCheckinQr('CONFIRMED', 'REFUND_PENDING'), false);
});

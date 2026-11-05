import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingStartMs } from '../src/business-rules.js';
import { parseCheckinCode, checkinEligibility, applyCheckin, CheckinError } from '../src/checkin-rules.js';

const code='HB-1004112006';
const start=bookingStartMs('2026-11-05','12:00');
const valid={id:31,status:'CONFIRMED',payment_status:'PAID',booking_date:'2026-11-05',time_slot:'12:00'};
const at=no=>start+no*60_000;

for (const input of [code,`HIBI|${code}`,`hibi|${code.toLowerCase()}`,` ${code.toLowerCase()} `]) {
  test(`accepts valid manual/QR payload: ${input}`,()=>assert.equal(parseCheckinCode(input),code));
}
for (const input of ['', 'HB-1','HIBI|','HIBI|'+code+'|extra','000201010212','https://evil.example/?code='+code,'HB-001',null,123,'a'.repeat(101)]) {
  test(`rejects invalid/payment/URL payload: ${String(input).slice(0,33)}`,()=>assert.equal(parseCheckinCode(input),null));
}

test('eligibility: valid exactly 30 minutes before start',()=>assert.equal(checkinEligibility(valid,at(-30)).allowed,true));
test('eligibility: too early by 1 millisecond',()=>assert.equal(checkinEligibility(valid,at(-30)-1).reason,'TOO_EARLY'));
test('eligibility: valid exactly 20 minutes after start',()=>assert.equal(checkinEligibility(valid,at(20)).allowed,true));
test('eligibility: too late by 1 millisecond',()=>assert.equal(checkinEligibility(valid,at(20)+1).reason,'TOO_LATE'));
test('eligibility: invalid time',()=>assert.equal(checkinEligibility({...valid,time_slot:'n/a'},at(0)).reason,'INVALID_TIME'));
test('eligibility: missing booking',()=>assert.equal(checkinEligibility(null,at(0)).reason,'NOT_FOUND'));
for (const [status,payment,reason] of [
  ['CHECKED_IN','PAID','ALREADY_CHECKED_IN'],
  ['CANCELLED','PAID','BOOKING_INACTIVE'],
  ['EXPIRED','PAID','BOOKING_INACTIVE'],
  ['CONFIRMED','PENDING','NOT_CONFIRMED'],
  ['PENDING_PAYMENT','PAID','NOT_CONFIRMED'],
  ['CONFIRMED','REFUND_PENDING','NOT_CONFIRMED'],
]) {
  test(`eligibility: ${status}/${payment} -> ${reason}`,
    ()=>assert.equal(checkinEligibility({...valid,status,payment_status:payment},at(0)).reason,reason));
}

function mockDb({booking=valid,updated=1,throwOnUpdate=false}={}) {
  const calls=[];
  const client={async query(sql,args){
    calls.push({sql,args});
    if(sql.includes('FOR UPDATE')) return booking ? {rowCount:1,rows:[booking]} : {rowCount:0,rows:[]};
    if(sql.includes('UPDATE bookings')) {
      if(throwOnUpdate) throw new Error('DATABASE_DOWN');
      return {rowCount:updated,rows:updated?[{id:booking.id}]:[]};
    }
    throw new Error('Unexpected SQL statement');
  }};
  return {client,calls};
}

test('checkin: writes once under row lock and audits the acting staff',async()=>{
  const {client,calls}=mockDb();
  const auditCalls=[];
  const result=await applyCheckin({client,rawCode:`HIBI|${code}`,staffId:55,nowMs:at(0),audit:async(...args)=>auditCalls.push(args)});
  assert.equal(result.bookingCode,code);
  assert.match(calls[0].sql,/FOR UPDATE/);
  assert.match(calls[1].sql,/status='CONFIRMED' AND payment_status='PAID'/);
  assert.equal(auditCalls.length,1);
  assert.equal(auditCalls[0][1],55);
  assert.equal(auditCalls[0][2],'CHECK_IN');
});

test('checkin: bad QR never queries database',async()=>{
  const {client,calls}=mockDb();
  await assert.rejects(applyCheckin({client,rawCode:'PAYMENT|123',staffId:1,nowMs:at(0),audit:async()=>{}}),
    e=>e instanceof CheckinError && e.status===400);
  assert.equal(calls.length,0);
});

test('checkin: unknown code responds 404 and never audits',async()=>{
  const {client,calls}=mockDb({booking:null});
  let audited=false;
  await assert.rejects(applyCheckin({client,rawCode:code,staffId:1,nowMs:at(0),audit:async()=>{audited=true}}),
    e=>e instanceof CheckinError && e.status===404);
  assert.equal(audited,false);
  assert.equal(calls.length,1);
});

for (const changed of [
  {...valid,status:'CHECKED_IN'},
  {...valid,status:'CANCELLED'},
  {...valid,payment_status:'PENDING'},
]) {
  test(`checkin: refuses changed status ${changed.status}/${changed.payment_status}`,async()=>{
    const {client,calls}=mockDb({booking:changed});
    await assert.rejects(applyCheckin({client,rawCode:code,staffId:1,nowMs:at(0),audit:async()=>{throw Error('Should not audit')}}),
      e=>e instanceof CheckinError && e.status===409);
    assert.equal(calls.length,1);
  });
}

test('checkin: conditional update lost race, no audit and returns 409',async()=>{
  const {client,calls}=mockDb({updated:0});
  let audited=false;
  await assert.rejects(applyCheckin({client,rawCode:code,staffId:1,nowMs:at(0),audit:async()=>{audited=true}}),
    e=>e instanceof CheckinError && e.status===409);
  assert.equal(calls.length,2);
  assert.equal(audited,false);
});

test('checkin: database error surfaces to route for ROLLBACK',async()=>{
  const {client}=mockDb({throwOnUpdate:true});
  await assert.rejects(applyCheckin({client,rawCode:code,staffId:1,nowMs:at(0),audit:async()=>{}}),/DATABASE_DOWN/);
});

test('checkin: audit error surfaces to route for ROLLBACK',async()=>{
  const {client}=mockDb();
  await assert.rejects(applyCheckin({client,rawCode:code,staffId:1,nowMs:at(0),audit:async()=>{throw Error('AUDIT_FAILED')}}),/AUDIT_FAILED/);
});

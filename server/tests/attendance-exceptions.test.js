import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingStartMs } from '../src/business-rules.js';
import { attendanceEligibility, recordAttendance, AttendanceError, validAttendanceNote } from '../src/attendance-rules.js';

const start = bookingStartMs('2026-11-05','12:00');
const at = minutes => start + minutes*60_000;
const valid = {id:41,booking_code:'HB-1004112006',booking_date:'2026-11-05',time_slot:'12:00',status:'CONFIRMED',payment_status:'PAID'};

test('grace period at exactly +20 minutes still permits normal check-in',()=>{
  assert.equal(attendanceEligibility(valid,at(20)).reason,'NOT_LATE');
});
test('1 ms after +20 minutes allows staff attendance decision',()=>{
  assert.equal(attendanceEligibility(valid,at(20)+1).allowed,true);
});
test('does not allow recording late arrival before appointment',()=>{
  assert.equal(attendanceEligibility(valid,at(-30)).reason,'NOT_LATE');
});
for(const [status,payment] of [['PENDING_PAYMENT','PENDING'],['CONFIRMED','PENDING'],['CONFIRMED','REFUNDED'],['CHECKED_IN','PAID'],['CANCELLED','PAID'],['EXPIRED','PENDING'],['NO_SHOW','PAID']]){
  test(`attendance refuses ${status}/${payment}`,()=>assert.equal(attendanceEligibility({...valid,status,payment_status:payment},at(30)).allowed,false));
}
test('attendance refuses missing/invalid booking dates and non-finite clock',()=>{
  assert.equal(attendanceEligibility(null,at(30)).reason,'NOT_FOUND');
  assert.equal(attendanceEligibility({...valid,time_slot:'invalid'},at(30)).reason,'INVALID_DATE');
  assert.equal(attendanceEligibility(valid,NaN).reason,'INVALID_DATE');
});
test('attendance notes must be 5–500 non-space characters of string type',()=>{
  for(const note of [null,123,{},['ok note'], '', ' abc ','x'.repeat(501)])assert.equal(validAttendanceNote(note),false);
  for(const note of ['abcde',' ghi nhận khách đến trễ ', 'x'.repeat(500)])assert.equal(validAttendanceNote(note),true);
});

function fakeDb({booking=valid,previousIncident=null,updated=1,failAt=null,nowMs=at(21)}={}){
  const calls=[];
  const client={async query(sql,params=[]){
    calls.push({sql,params});
    if(failAt && sql.includes(failAt))throw new Error('DATABASE_FAILURE');
    if(sql.includes('FROM bookings WHERE id=$1 FOR UPDATE'))return booking?{rowCount:1,rows:[booking]}:{rowCount:0,rows:[]};
    if(sql.includes('clock_timestamp() AS db_now'))return {rowCount:1,rows:[{db_now:new Date(nowMs)}]};
    if(sql.includes('FROM booking_attendance_incidents'))return previousIncident?{rowCount:1,rows:[{kind:previousIncident}]}:{rowCount:0,rows:[]};
    if(sql.includes('UPDATE bookings SET status=\'NO_SHOW\''))return {rowCount:updated,rows:updated?[{id:booking.id}]:[]};
    if(sql.includes('INSERT INTO booking_attendance_incidents'))return {rowCount:1};
    throw new Error('Unexpected SQL: '+sql);
  }};
  return {client,calls};
}
const opts = (client,outcome='NO_SHOW',note='Khách không có mặt')=>({client,bookingId:41,staffId:6,outcome,note,audit:async()=>{}});

test('NO_SHOW locks booking, updates it once, records employee and audit; no automatic refund',async()=>{
  const {client,calls}=fakeDb();const audited=[];
  const result=await recordAttendance({...opts(client),audit:async(...args)=>audited.push(args)});
  assert.equal(result.outcome,'NO_SHOW');
  assert.match(calls[0].sql,/FOR UPDATE/);
  assert.equal(calls.filter(x=>x.sql.includes('UPDATE bookings')).length,1);
  assert.equal(calls.filter(x=>x.sql.includes('INSERT INTO booking_attendance_incidents')).length,1);
  const inserted=calls.find(x=>x.sql.includes('INSERT INTO booking_attendance_incidents'));
  assert.deepEqual(inserted.params,[41,'NO_SHOW','Khách không có mặt',6]);
  assert.equal(audited[0][1],6);
  assert.equal(audited[0][2],'MARK_NO_SHOW');
  assert.ok(calls.every(x=>!x.sql.includes('refunds')&&!/SET\s+payment_status\s*=/.test(x.sql)));
});
test('LATE_ARRIVAL logs outcome, does not change booking status or initiate check-in/refund',async()=>{
  const {client,calls}=fakeDb();const audited=[];
  const result=await recordAttendance({...opts(client,'LATE_ARRIVAL'),audit:async(...args)=>audited.push(args)});
  assert.equal(result.outcome,'LATE_ARRIVAL');
  assert.equal(calls.some(x=>x.sql.includes('UPDATE bookings')),false);
  assert.equal(audited[0][2],'RECORD_LATE_ARRIVAL');
});
test('uses database clock rather than client/browser clock',async()=>{
  const {client,calls}=fakeDb({nowMs:at(20)});
  await assert.rejects(recordAttendance(opts(client)),e=>e instanceof AttendanceError&&e.status===409);
  assert.equal(calls.filter(x=>x.sql.includes('INSERT INTO booking_attendance_incidents')).length,0);
});
test('double-processed attendance is rejected; no update/audit',async()=>{
  const {client,calls}=fakeDb({previousIncident:'LATE_ARRIVAL'});
  await assert.rejects(recordAttendance(opts(client)),e=>e instanceof AttendanceError&&e.status===409);
  assert.equal(calls.some(x=>x.sql.includes('UPDATE bookings')),false);
});
test('lost race during conditional no-show update returns conflict; no audit',async()=>{
  const {client,calls}=fakeDb({updated:0});
  await assert.rejects(recordAttendance(opts(client)),e=>e instanceof AttendanceError&&e.status===409);
  assert.equal(calls.some(x=>x.sql.includes('INSERT INTO booking_attendance_incidents')),false);
});
test('unknown booking is 404',async()=>{
  const {client}=fakeDb({booking:null});
  await assert.rejects(recordAttendance(opts(client)),e=>e instanceof AttendanceError&&e.status===404);
});
test('invalid outcome, IDs, or notes never query database',async()=>{
  const {client,calls}=fakeDb();
  for(const item of [{outcome:'PAID'},{bookingId:0},{staffId:-1},{staffId:1.5},{note:[]},{note:'  abc '}]){
    await assert.rejects(recordAttendance({...opts(client),...item}),e=>e instanceof AttendanceError&&e.status===400);
  }
  assert.equal(calls.length,0);
});
for(const failAt of ['UPDATE bookings','INSERT INTO booking_attendance_incidents']){
  test(`database failure in ${failAt} propagates so route rolls back`,async()=>{
    const {client}=fakeDb({failAt});
    await assert.rejects(recordAttendance(opts(client)),/DATABASE_FAILURE/);
  });
}
test('audit insert failure propagates so transaction is rolled back',async()=>{
  const {client}=fakeDb();
  await assert.rejects(recordAttendance({...opts(client),audit:async()=>{throw new Error('AUDIT_FAILURE')}}),/AUDIT_FAILURE/);
});

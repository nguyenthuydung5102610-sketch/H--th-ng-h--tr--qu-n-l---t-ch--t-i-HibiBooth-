import test from 'node:test';
import assert from 'node:assert/strict';
import {isValidCustomerEmail,googleCalendarUrl,emailMessage,scheduleBookingEmails} from '../src/email-notifications.js';

test('accepts common customer emails and rejects missing/invalid addresses', () => {
  assert.equal(isValidCustomerEmail('Mai.Nguyen+photo@example.com'), true);
  assert.equal(isValidCustomerEmail(' hello@example.vn '), true);
  for (const value of ['',null,'hello','me@','me@sample','a @example.com','a@-example.com','a@example..com']) {
    assert.equal(isValidCustomerEmail(value),false,String(value));
  }
});

test('Google Calendar event preserves Vietnam local booking time, duration and code', () => {
  const url=googleCalendarUrl({bookingDate:'2026-11-06',timeSlot:'15:30',bookingCode:'HB-111062026',roomName:'Phông đỏ'});
  const u=new URL(url);
  assert.equal(u.host,'calendar.google.com');
  assert.equal(u.searchParams.get('action'),'TEMPLATE');
  assert.equal(u.searchParams.get('dates'),'20261106T083000Z/20261106T090000Z');
  assert.equal(u.searchParams.get('stz'),'Asia/Ho_Chi_Minh');
  assert.match(u.searchParams.get('details'),/HB-111062026/);
  const oldUrl=googleCalendarUrl({bookingDate:'2026-11-06',timeSlot:'15:30',bookingCode:'HB-111062026',durationMinutes:60});
  assert.equal(new URL(oldUrl).searchParams.get('dates'),'20261106T083000Z/20261106T093000Z');
  assert.equal(googleCalendarUrl({bookingDate:'wrong',timeSlot:'15:30',bookingCode:'HB-1'}),'');
});

test('email confirmation and reminder identify booking without personal phone data', () => {
  const b={booking_code:'HB-111062026',customer_name:'Mai',booking_date:'2026-11-06',time_slot:'15:30',room_name:'Phông đỏ'};
  const confirm=emailMessage('CONFIRMATION',b);
  const reminder=emailMessage('REMINDER',b);
  assert.match(confirm.subject,/Xác nhận đặt phòng/);
  assert.match(confirm.text,/15:30 ngày 06\/11\/2026/);
  assert.match(reminder.text,/nhắc bạn có lịch chụp/);
  assert.match(confirm.text,/calendar\.google\.com/);
});

test('queues one confirmation and one hour-before reminder inside payment transaction', async () => {
  const calls=[];
  await scheduleBookingEmails({query:async (sql,args)=>{calls.push({sql,args});return {rowCount:1};}},123);
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(c=>c.args),[[123],[123]]);
  assert.match(calls[0].sql,/'CONFIRMATION'/);
  assert.match(calls[1].sql,/'REMINDER'/);
  assert.match(calls[1].sql,/INTERVAL '1 hour'/);
  assert.ok(calls.every(c=>/ON CONFLICT \(booking_id,kind\) DO NOTHING/.test(c.sql)));
});

test('Resend worker submits email with unique idempotency key and records accepted status (mocked)', async () => {
  const originalFetch=globalThis.fetch;
  const oldEnv={EMAIL_PROVIDER:process.env.EMAIL_PROVIDER,RESEND_API_KEY:process.env.RESEND_API_KEY,EMAIL_FROM:process.env.EMAIL_FROM};
  process.env.EMAIL_PROVIDER='resend';
  process.env.RESEND_API_KEY='test-do-not-use';
  process.env.EMAIL_FROM='HIBI BOOTH <bookings@example.com>';
  const requests=[],changes=[];
  let selected=false;
  globalThis.fetch=async (url,options) => {
    requests.push({url,options});
    return {ok:true,status:200,json:async()=>({id:'mock-resend-message-id'})};
  };
  try {
    const {processEmailNotifications}=await import('../src/email-notifications.js?mocked-resend-worker');
    const fakeClient={
      async query(sql,args=[]) {
        if (sql.includes('SELECT n.id')) {
          if (selected) return {rowCount:0,rows:[]};
          selected=true;
          return {rowCount:1,rows:[{id:12,booking_id:123,kind:'CONFIRMATION',recipient_email:'test@example.com',attempts:0,booking_code:'HB-111062026',customer_name:'Mai',booking_date:'2099-01-01',time_slot:'15:30',booking_status:'CONFIRMED',payment_status:'PAID',room_name:'Phông đỏ'}]};
        }
        changes.push({sql,args});return {rowCount:1};
      },
      release() {},
    };
    const pool={connect:async()=>fakeClient,query:fakeClient.query.bind(fakeClient)};
    const result=await processEmailNotifications(pool);
    assert.equal(result.processed,1);
    assert.equal(requests.length,1);
    assert.equal(requests[0].url,'https://api.resend.com/emails');
    assert.equal(requests[0].options.headers['Idempotency-Key'],'hibi-confirmation-123');
    assert.equal(JSON.parse(requests[0].options.body).to[0],'test@example.com');
    assert.ok(changes.some(c=>c.sql.includes("status='SUBMITTED'") && c.args[1]==='mock-resend-message-id'));
  } finally {
    globalThis.fetch=originalFetch;
    for(const [k,v] of Object.entries(oldEnv)) {
      if(v===undefined) delete process.env[k]; else process.env[k]=v;
    }
  }
});

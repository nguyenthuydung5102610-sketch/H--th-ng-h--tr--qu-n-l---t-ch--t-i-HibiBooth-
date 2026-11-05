import test from 'node:test';
import assert from 'node:assert/strict';
import {syncVerifiedPayosPayment, validateVerifiedPayment} from '../src/payos-sync.js';

const normal = {orderCode:1000001,amount:70000,reference:'TF123456',source:'WEBHOOK',currency:'VND'};
class FakeDb {
  constructor(overrides={}) {
    this.booking={id:7,booking_code:'HB-7000112026',status:'PENDING_PAYMENT',payment_status:'PENDING',amount_vnd:70000,hold_valid:true,...overrides};
    this.events=[];this.reviews=[];this.logs=[];this.calls=[];this.emails=[];
    this.releases=0;this.failOn=null;this.forceExpiry=false;
  }
  async connect(){
    const self=this;
    return { release:()=>{self.releases++;}, query: async (sql,params=[]) => {
      const norm=sql.trim();self.calls.push(norm);
      if(self.failOn && norm.includes(self.failOn)) throw Error('db write failed');
      if(norm==='BEGIN'){
        self.snapshot=structuredClone({booking:self.booking,events:self.events,reviews:self.reviews,logs:self.logs,emails:self.emails});return {rowCount:0,rows:[]};
      }
      if(norm==='ROLLBACK'){
        Object.assign(self,structuredClone(self.snapshot));return {rowCount:0,rows:[]};
      }
      if(norm==='COMMIT') return {rowCount:0,rows:[]};
      if(norm.includes('FROM payos_payment_requests')) {
        if(params[0]!==normal.orderCode || self.noMatch) return {rowCount:0,rows:[]};
        return {rowCount:1,rows:[structuredClone(self.booking)]};
      }
      if(norm.startsWith('INSERT INTO payment_events')) {
        if(self.events.some(e=>e.ref===params[1])) return {rowCount:0,rows:[]};
        const e={id:self.events.length+1,ref:params[1],amount:params[2],result:params[3]};self.events.push(e);
        return {rowCount:1,rows:[{id:e.id}]};
      }
      if(norm.startsWith('INSERT INTO payment_reconciliation_cases')) {
        if(!self.reviews.some(x=>x.ref===params[2]&&x.kind===params[3])) self.reviews.push({ref:params[2],kind:params[3]});
        return {rowCount:1,rows:[]};
      }
      if(norm.startsWith('UPDATE bookings')) {
        if(self.forceExpiry || self.booking.status!=='PENDING_PAYMENT' || !self.booking.hold_valid) return {rowCount:0,rows:[]};
        self.booking.status='CONFIRMED';self.booking.payment_status='PAID';return {rowCount:1,rows:[{id:self.booking.id}]};
      }
      if(norm.startsWith('UPDATE payment_events')) {
        const event=self.events.find(e=>e.id===params[0]);if(event)event.result=norm.includes("result='VERIFIED'")?'VERIFIED':'REVIEW_REQUIRED';return {rowCount:1,rows:[]};
      }
      throw Error(`Unknown query: ${norm.slice(0,90)}`);
    }};
  }
}
const deps=(db)=>({
  scheduleEmails:async(_,id)=>db.emails.push(id),
  audit:async(_,user,action,entity,id,details)=>db.logs.push({action,id,details}),
});
const sync=(db,payment=normal)=>syncVerifiedPayosPayment(db,payment,deps(db));

test('reject malformed orderCode without opening a transaction',async()=>{
  const db=new FakeDb();assert.equal((await sync(db,{...normal,orderCode:1.5})).outcome,'INVALID_ORDER');assert.equal(db.calls.length,0);
});
test('reject negative or fractional amounts without DB writes',async()=>{
  for(const amount of [-1,0,0.5,NaN,Infinity]){const db=new FakeDb();assert.equal((await sync(db,{...normal,amount})).outcome,'INVALID_AMOUNT');assert.equal(db.calls.length,0);}
});
test('reject missing, oversized, or unsafe references',()=>{
  assert.equal(validateVerifiedPayment({...normal,reference:''}),'INVALID_REFERENCE');
  assert.equal(validateVerifiedPayment({...normal,reference:'x'.repeat(101)}),'INVALID_REFERENCE');
  assert.equal(validateVerifiedPayment({...normal,reference:'abc\nspoof'}),'INVALID_REFERENCE');
});
test('reject unsigned-source or invalid currency data',()=>{
  assert.equal(validateVerifiedPayment({...normal,source:'CLIENT'}),'INVALID_SOURCE');
  assert.equal(validateVerifiedPayment({...normal,currency:'USD'}),'INVALID_CURRENCY');
});
test('valid verified payment atomically confirms booking, marks event verified, queues emails',async()=>{
  const db=new FakeDb();const r=await sync(db);
  assert.equal(r.outcome,'CONFIRMED');assert.equal(db.booking.status,'CONFIRMED');assert.equal(db.booking.payment_status,'PAID');
  assert.equal(db.events[0].result,'VERIFIED');assert.equal(db.emails.length,1);assert.equal(db.logs.length,1);
  assert.ok(db.calls.some(q=>q.includes('FOR UPDATE OF b')));assert.ok(db.calls.some(q=>q.includes('clock_timestamp()')));
  assert.equal(db.releases,1);
});
test('repeated signed webhook does not queue email or status twice',async()=>{
  const db=new FakeDb();await sync(db);const r=await sync(db);
  assert.equal(r.outcome,'ALREADY_CONFIRMED');assert.equal(db.events.length,1);assert.equal(db.emails.length,1);
});
test('webhook and reconcile arriving for one order are idempotent',async()=>{
  const db=new FakeDb();await sync(db);const r=await sync(db,{...normal,reference:'RECONCILE-1000001',source:'RECONCILE'});
  assert.equal(r.outcome,'ALREADY_CONFIRMED');assert.equal(db.events.length,1);assert.equal(db.logs.length,1);
});
test('wrong amount is captured in manual review, does not confirm or send email',async()=>{
  const db=new FakeDb();const r=await sync(db,{...normal,amount:69999});
  assert.equal(r.outcome,'AMOUNT_MISMATCH');assert.equal(db.booking.status,'PENDING_PAYMENT');
  assert.equal(db.events[0].result,'AMOUNT_MISMATCH');assert.equal(db.reviews[0].kind,'AMOUNT_MISMATCH');assert.equal(db.emails.length,0);
});
test('same signed wrong amount does not create a second review or audit record',async()=>{
  const db=new FakeDb();await sync(db,{...normal,amount:69999});await sync(db,{...normal,amount:69999});
  assert.equal(db.events.length,1);assert.equal(db.reviews.length,1);assert.equal(db.logs.length,1);
});
test('expired hold is NOT reallocated even after provider confirms payment',async()=>{
  const db=new FakeDb({hold_valid:false,status:'EXPIRED'});const r=await sync(db);
  assert.equal(r.outcome,'REVIEW_REQUIRED');assert.equal(db.booking.status,'EXPIRED');
  assert.equal(db.events[0].result,'REVIEW_REQUIRED');assert.equal(db.reviews[0].kind,'LATE_OR_INELIGIBLE');
  assert.equal(db.emails.length,0);
});
test('cancelled booking with paid callback goes to review instead of confirmation',async()=>{
  const db=new FakeDb({status:'CANCELLED'});const r=await sync(db);assert.equal(r.outcome,'REVIEW_REQUIRED');
  assert.equal(db.booking.status,'CANCELLED');
});
test('refund-pending booking must not be reconfirmed',async()=>{
  const db=new FakeDb({status:'CANCELLED',payment_status:'REFUND_PENDING'});
  assert.equal((await sync(db)).outcome,'REVIEW_REQUIRED');
});
test('hold expires between SELECT and UPDATE: live SQL clock guard rejects confirmation',async()=>{
  const db=new FakeDb();db.forceExpiry=true;const r=await sync(db);
  assert.equal(r.outcome,'REVIEW_REQUIRED');assert.equal(db.booking.status,'PENDING_PAYMENT');
  assert.equal(db.emails.length,0);
});
test('same late transfer does not create repeat review',async()=>{
  const db=new FakeDb({hold_valid:false,status:'EXPIRED'});await sync(db);await sync(db);
  assert.equal(db.events.length,1);assert.equal(db.reviews.length,1);
});
test('orphan orderCode rolls back without records',async()=>{
  const db=new FakeDb();db.noMatch=true;
  assert.equal((await sync(db)).outcome,'UNKNOWN_ORDER');assert.ok(db.calls.includes('ROLLBACK'));assert.equal(db.releases,1);
});
test('email queue failure rolls back booking and event',async()=>{
  const db=new FakeDb();const broken={...deps(db),scheduleEmails:async()=>{throw Error('mail DB failed');}};
  await assert.rejects(()=>syncVerifiedPayosPayment(db,normal,broken),/mail DB failed/);
  assert.equal(db.booking.status,'PENDING_PAYMENT');assert.equal(db.events.length,0);assert.ok(db.calls.includes('ROLLBACK'));assert.equal(db.releases,1);
});
test('audit failure rolls back ALL payment state changes',async()=>{
  const db=new FakeDb();const broken={...deps(db),audit:async()=>{throw Error('audit fail');}};
  await assert.rejects(()=>syncVerifiedPayosPayment(db,normal,broken),/audit fail/);
  assert.equal(db.booking.payment_status,'PENDING');assert.equal(db.events.length,0);assert.equal(db.emails.length,0);
});
test('payment insert DB error rolls back and releases connection',async()=>{
  const db=new FakeDb();db.failOn='INSERT INTO payment_events';await assert.rejects(()=>sync(db),/db write failed/);
  assert.equal(db.booking.status,'PENDING_PAYMENT');assert.equal(db.events.length,0);assert.equal(db.releases,1);
});

test('paid booking later cancelled does not get falsely re-confirmed',async()=>{
  const db=new FakeDb({status:'CANCELLED',payment_status:'PAID'});
  const r=await sync(db);assert.equal(r.outcome,'ALREADY_PAID_CLOSED');
  assert.equal(db.booking.status,'CANCELLED');assert.equal(db.emails.length,0);
});

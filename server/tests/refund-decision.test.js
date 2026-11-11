import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideRefundTransaction, RefundDecisionError } from '../src/refund-decision.js';

class FakeRefundDb {
  constructor({ paymentStatus='PAID', refundStatus='PENDING_APPROVAL', otherApproved=false, failOn=null, failRollback=false }={}) {
    this.booking={id:5,booking_code:'HB-15062026',payment_status:paymentStatus};
    this.refunds=[{id:20,booking_id:5,amount_vnd:70000,status:refundStatus}];
    if (otherApproved) this.refunds.push({id:18,booking_id:5,amount_vnd:70000,status:'APPROVED'});
    this.audit=[];
    this.calls=[];
    this.releaseCount=0;
    this.failOn=failOn;
    this.failRollback=failRollback;
  }
  async connect() {
    const db=this;let snapshot;
    return {
      async query(sql,params=[]) {
        sql=sql.trim();db.calls.push(sql);
        if(sql==='BEGIN') {snapshot=structuredClone({booking:db.booking,refunds:db.refunds,audit:db.audit});return {};}
        if(sql==='ROLLBACK') {if(db.failRollback)throw new Error('rollback failed');Object.assign(db,snapshot);return {};}
        if(db.failOn&&sql.includes(db.failOn)) throw new Error('simulated db failure');
        if(sql==='COMMIT') {snapshot=null;return {};}
        if(sql.startsWith('SELECT booking_id FROM refunds')) {
          const r=db.refunds.find(r=>r.id===Number(params[0]));return {rowCount:r?1:0,rows:r?[{booking_id:r.booking_id}]:[]};
        }
        if(sql.startsWith('SELECT id,booking_code,payment_status FROM bookings')) {
          const match=db.booking&&db.booking.id===Number(params[0]);return {rowCount:match?1:0,rows:match?[structuredClone(db.booking)]:[]};
        }
        if(sql.startsWith('SELECT id,booking_id,amount_vnd,status FROM refunds')) {
          const r=db.refunds.find(r=>r.id===Number(params[0]));return {rowCount:r?1:0,rows:r?[structuredClone(r)]:[]};
        }
        if(sql.startsWith('SELECT id FROM refunds WHERE booking_id')) {
          const r=db.refunds.find(r=>r.booking_id===Number(params[0])&&r.id!==Number(params[1])&&['APPROVED','COMPLETED'].includes(r.status));
          return {rowCount:r?1:0,rows:r?[{id:r.id}]:[]};
        }
        if(sql.startsWith('UPDATE refunds SET')) {
          const r=db.refunds.find(r=>r.id===Number(params[2])&&r.status==='PENDING_APPROVAL');
          if(!r)return {rowCount:0,rows:[]};
          r.status=params[0];r.approved_by=params[1];return {rowCount:1,rows:[structuredClone(r)]};
        }
        if(sql.startsWith('UPDATE bookings SET payment_status')) {
          if(db.booking?.id!==Number(params[0])||db.booking.payment_status!=='PAID') return {rowCount:0,rows:[]};
          db.booking.payment_status='REFUND_PENDING';return {rowCount:1,rows:[{id:db.booking.id}]};
        }
        if(sql.startsWith('INSERT INTO audit_logs')) {
          db.audit.push({params});return {rowCount:1};
        }
        throw new Error(`Fake DB: unsupported SQL ${sql.slice(0,100)}`);
      },
      release(){db.releaseCount++;},
    };
  }
}

const fakeAudit=async(client,uid,action,entity,id,details)=>client.query(
  `INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5::jsonb)`,
  [uid,action,entity,id,JSON.stringify(details)]);
const run=(db,decision='APPROVE',refundId=20,ownerId=2)=>decideRefundTransaction({pool:db,decision,refundId,ownerId,writeAudit:fakeAudit});

async function errorOf(promise) {try{await promise;assert.fail('expected error');}catch(e){if(e?.message==='expected error')throw e;return e;}}

test('approve changes refund + booking + audit atomically and never pays out',async()=>{
  const db=new FakeRefundDb();const result=await run(db);
  assert.equal(result.status,'APPROVED');
  assert.equal(db.booking.payment_status,'REFUND_PENDING');
  assert.equal(db.refunds[0].approved_by,2);
  assert.equal(db.audit.length,1);
  assert.match(result.message,/Chưa chuyển tiền/);
  assert.equal(db.calls.at(-1),'COMMIT');assert.equal(db.releaseCount,1);
  assert.ok(db.calls.some(x=>x.includes('FROM bookings WHERE id=$1 FOR UPDATE')));
  assert.ok(db.calls.some(x=>x.includes('FROM refunds WHERE id=$1 FOR UPDATE')));
});
test('reject changes refund and audit only; leaves booking payment unchanged',async()=>{
  const db=new FakeRefundDb();const result=await run(db,'REJECT');
  assert.equal(result.status,'REJECTED');assert.equal(db.booking.payment_status,'PAID');
  assert.equal(db.audit.length,1);assert.ok(!db.calls.some(x=>x.startsWith('UPDATE bookings')));
});
test('duplicate decision returns 409 with no extra audit',async()=>{
  const db=new FakeRefundDb();await run(db);const e=await errorOf(run(db));
  assert.equal(e.status,409);assert.equal(db.audit.length,1);assert.equal(db.refunds[0].status,'APPROVED');
});
test('missing refund returns 404 without mutations',async()=>{
  const db=new FakeRefundDb();const e=await errorOf(run(db,'APPROVE',99));
  assert.equal(e.status,404);assert.equal(db.audit.length,0);assert.equal(db.calls.at(-1),'ROLLBACK');
});
test('invalid decision or IDs reject before acquiring a DB connection',async()=>{
  const db=new FakeRefundDb();
  for(const [decision,id,owner] of [['approve',20,2],['APPROVE','abc',2],['APPROVE',0,2],['APPROVE',20,0],['APPROVE',20,'no']]) {
    const e=await errorOf(run(db,decision,id,owner));assert.equal(e.status,400);
  }
  assert.equal(db.calls.length,0);assert.equal(db.releaseCount,0);
});
test('cannot approve after booking payment state changes',async()=>{
  const db=new FakeRefundDb({paymentStatus:'REFUND_PENDING'});
  const e=await errorOf(run(db));assert.equal(e.status,409);
  assert.equal(db.refunds[0].status,'PENDING_APPROVAL');assert.equal(db.audit.length,0);
});
test('cannot approve if another refund already APPROVED or COMPLETED',async()=>{
  const db=new FakeRefundDb({otherApproved:true});const e=await errorOf(run(db));
  assert.equal(e.status,409);assert.equal(db.refunds[0].status,'PENDING_APPROVAL');
});
test('rejection does not require booking to be PAID',async()=>{
  const db=new FakeRefundDb({paymentStatus:'REFUND_PENDING'});
  assert.equal((await run(db,'REJECT')).status,'REJECTED');
  assert.equal(db.booking.payment_status,'REFUND_PENDING');
});
test('DB failure when updating booking rolls refund approval back',async()=>{
  const db=new FakeRefundDb({failOn:'UPDATE bookings SET'});
  const e=await errorOf(run(db));assert.match(e.message,/simulated/);
  assert.equal(db.booking.payment_status,'PAID');assert.equal(db.refunds[0].status,'PENDING_APPROVAL');
  assert.equal(db.audit.length,0);assert.equal(db.calls.at(-1),'ROLLBACK');assert.equal(db.releaseCount,1);
});
test('DB failure writing audit rolls BOTH refund and booking back',async()=>{
  const db=new FakeRefundDb({failOn:'INSERT INTO audit_logs'});
  await errorOf(run(db));
  assert.equal(db.booking.payment_status,'PAID');assert.equal(db.refunds[0].status,'PENDING_APPROVAL');
  assert.equal(db.audit.length,0);assert.equal(db.releaseCount,1);
});
test('DB failure on COMMIT triggers ROLLBACK',async()=>{
  const db=new FakeRefundDb({failOn:'COMMIT'});await errorOf(run(db));
  assert.equal(db.booking.payment_status,'PAID');assert.equal(db.refunds[0].status,'PENDING_APPROVAL');
  assert.equal(db.audit.length,0);
});
test('original SQL error survives failed rollback, client always released',async()=>{
  const db=new FakeRefundDb({failOn:'INSERT INTO audit_logs',failRollback:true});
  const e=await errorOf(run(db));assert.match(e.message,/simulated/);assert.equal(db.releaseCount,1);
});
test('server route uses transaction service and enforces OWNER auth',()=>{
  const source=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(source,/app\.patch\('\/api\/owner\/refunds\/:id\/decision', requireAuth, requireRole\('OWNER'\)/);
  assert.match(source,/await decideRefundTransaction\(/);
  const segment=source.slice(source.indexOf("app.patch('/api/owner/refunds/:id/decision'"), source.indexOf("app.get('/api/owner/sms-reminders'"));
  assert.ok(!segment.includes('pool.query('),'must not perform loose pool queries outside transaction');
});

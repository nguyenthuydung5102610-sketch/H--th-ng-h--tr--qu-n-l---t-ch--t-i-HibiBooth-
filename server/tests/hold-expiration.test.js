import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLD_MINUTES, HOLD_BATCH_SIZE, shouldExpireHold, expireLockedHold,
  expireOverdueHolds, createHoldExpirationWorker,
} from '../src/hold-expiration.js';

const NOW = Date.parse('2026-11-05T00:00:00.000Z');
const at = (deltaMs) => new Date(NOW + deltaMs).toISOString();
const row = (id, overrides={}) => ({id,booking_code:`HB-${id}05112026`,status:'PENDING_PAYMENT',
  payment_status:'PENDING',hold_expires_at:at(-1000), ...overrides});

// Small transactional PostgreSQL mock. It checks actual state mutations and rollback,
// not just that methods were called. Real SKIP LOCKED concurrency is DB-only and
// documented in the manual integration checklist.
class FakeDb {
  constructor(bookings, {failOn=null,failRollback=false}={}) {
    this.bookings=structuredClone(bookings);
    this.audit=[]; this.calls=[]; this.releases=0; this.failOn=failOn;
    this.failRollback=failRollback;
  }
  async connect() {
    const db=this;
    let snapshot=null;
    return {
      async query(text,params=[]) {
        const sql=text.trim(); db.calls.push(sql);
        if (sql==='BEGIN') { snapshot={bookings:structuredClone(db.bookings),audit:structuredClone(db.audit)};return {};}
        if (sql==='ROLLBACK') {
          if(db.failRollback) throw new Error('rollback unavailable');
          if(snapshot){db.bookings=snapshot.bookings;db.audit=snapshot.audit;}
          return {};
        }
        if (sql==='COMMIT') {snapshot=null;return {};}
        if (db.failOn && sql.includes(db.failOn)) throw new Error('simulated database failure');
        if (sql.startsWith('SELECT id,booking_code') && sql.includes('SKIP LOCKED')) {
          const [limit, bookingCode]=params;
          const rows=db.bookings.filter(b=>shouldExpireHold(b.status,b.payment_status,b.hold_expires_at,NOW)
            && (bookingCode==null || b.booking_code===bookingCode))
            .sort((a,b)=>a.id-b.id).slice(0,limit)
            .map(b=>({id:b.id,booking_code:b.booking_code}));
          return {rowCount:rows.length,rows};
        }
        if (sql.startsWith('UPDATE bookings') && sql.includes("status='EXPIRED'")) {
          const [id]=params;
          const b=db.bookings.find(b=>b.id===id);
          if(!b || !shouldExpireHold(b.status,b.payment_status,b.hold_expires_at,NOW))
            return {rowCount:0,rows:[]};
          b.status='EXPIRED';
          return {rowCount:1,rows:[{id:b.id,booking_code:b.booking_code}]};
        }
        if(sql.startsWith('INSERT INTO audit_logs') && sql.includes('HOLD_EXPIRED')) {
          const [id,bookingCode]=params;
          db.audit.push({id,bookingCode,action:'HOLD_EXPIRED'});
          return {rowCount:1};
        }
        throw new Error(`Unrecognised fake SQL: ${sql.slice(0,100)}`);
      },
      release() {db.releases++;},
    };
  }
}

test('hold duration is exactly 20 minutes',()=>assert.equal(HOLD_MINUTES,20));
test('expires exactly at deadline, not one millisecond before',()=>{
  assert.equal(shouldExpireHold('PENDING_PAYMENT','PENDING',at(0),NOW),true);
  assert.equal(shouldExpireHold('PENDING_PAYMENT','PENDING',at(1),NOW),false);
});
test('expired holds and malformed timestamps are not valid reservations',()=>{
  for (const value of [at(-1),null,undefined,'invalid'])
    assert.equal(shouldExpireHold('PENDING_PAYMENT','PENDING',value,NOW),true);
});
test('paid holds never expire, even if their timestamps are old',()=>{
  for (const status of ['CONFIRMED','CHECKED_IN','CANCELLED','EXPIRED','PENDING_PAYMENT'])
    assert.equal(shouldExpireHold(status,'PAID',at(-100000),NOW),false);
});
test('other payment states or booking states never auto-expire',()=>{
  for (const payment of ['FAILED','REFUND_PENDING','REFUNDED'])
    assert.equal(shouldExpireHold('PENDING_PAYMENT',payment,at(-1),NOW),false);
  for (const status of ['CONFIRMED','CHECKED_IN','CANCELLED','EXPIRED'])
    assert.equal(shouldExpireHold(status,'PENDING',at(-1),NOW),false);
});
test('one overdue hold is released and audited in a single transaction',async()=>{
  const db=new FakeDb([row(1)]);
  assert.deepEqual(await expireOverdueHolds(db),{expired:1,bookingCodes:[row(1).booking_code]});
  assert.equal(db.bookings[0].status,'EXPIRED');
  assert.equal(db.audit.length,1);
  assert.ok(db.calls.some(x=>x.includes('FOR UPDATE SKIP LOCKED')));
  assert.ok(db.calls.some(x=>x.includes("payment_status='PENDING'")));
  assert.equal(db.calls.at(-1),'COMMIT');
  assert.equal(db.releases,1);
});
test('future holds remain active; no audit events created',async()=>{
  const db=new FakeDb([row(1,{hold_expires_at:at(1000)})]);
  assert.equal((await expireOverdueHolds(db)).expired,0);
  assert.equal(db.bookings[0].status,'PENDING_PAYMENT');
  assert.equal(db.audit.length,0);
});
test('paid booking racing with sweep is protected by BOTH SELECT and UPDATE state guards',async()=>{
  const db=new FakeDb([row(1,{payment_status:'PAID'})]);
  assert.equal((await expireOverdueHolds(db)).expired,0);
  const client=await db.connect();
  assert.equal(await expireLockedHold(client,1),false);
  assert.equal(db.bookings[0].status,'PENDING_PAYMENT');
  client.release();
});
test('repeat sweep is idempotent: no duplicate expiry audit',async()=>{
  const db=new FakeDb([row(1)]);
  await expireOverdueHolds(db);
  const second=await expireOverdueHolds(db);
  assert.deepEqual(second,{expired:0,bookingCodes:[]});
  assert.equal(db.audit.length,1);
});
test('specific booking code cannot expire unrelated pending holds',async()=>{
  const db=new FakeDb([row(1),row(2)]);
  assert.equal((await expireOverdueHolds(db,{bookingCode:row(2).booking_code,limit:1})).expired,1);
  assert.equal(db.bookings.find(x=>x.id===1).status,'PENDING_PAYMENT');
  assert.equal(db.bookings.find(x=>x.id===2).status,'EXPIRED');
});
test('batch is bounded; remaining overdue holds expire in later sweep',async()=>{
  const db=new FakeDb([row(1),row(2),row(3)]);
  assert.equal((await expireOverdueHolds(db,{limit:2})).expired,2);
  assert.equal((await expireOverdueHolds(db,{limit:2})).expired,1);
  assert.equal(db.audit.length,3);
});
test('cleanup does not touch holds lacking payment verification state PENDING',async()=>{
  const db=new FakeDb([row(1,{payment_status:'FAILED'}),row(2,{status:'CANCELLED'}),row(3)]);
  assert.equal((await expireOverdueHolds(db)).expired,1);
  assert.deepEqual(db.bookings.map(x=>x.status),['PENDING_PAYMENT','CANCELLED','EXPIRED']);
});
test('database failure before audit commits nothing; rollback preserves all changes',async()=>{
  const db=new FakeDb([row(1)],{failOn:'INSERT INTO audit_logs'});
  await assert.rejects(()=>expireOverdueHolds(db),/simulated database failure/);
  assert.equal(db.bookings[0].status,'PENDING_PAYMENT');
  assert.equal(db.audit.length,0);
  assert.ok(db.calls.includes('ROLLBACK'));
  assert.equal(db.releases,1);
});
test('failed rollback preserves primary database error and releases connection',async()=>{
  const db=new FakeDb([row(1)],{failOn:'INSERT INTO audit_logs',failRollback:true});
  await assert.rejects(()=>expireOverdueHolds(db),/simulated database failure/);
  assert.equal(db.releases,1);
});
test('invalid limit and booking code cannot trigger a DB write',async()=>{
  const db=new FakeDb([row(1)]);
  for (const limit of [0,-1,2.1,201,'20'])
    await assert.rejects(()=>expireOverdueHolds(db,{limit}),RangeError);
  for (const bookingCode of [45,'',[],{}])
    await assert.rejects(()=>expireOverdueHolds(db,{bookingCode}),TypeError);
  assert.equal(db.calls.length,0);
});
test('worker prevents overlapping ticks; a second tick is skipped',async()=>{
  let resume;
  const deferred=new Promise(resolve=>{resume=resolve;});
  let calls=0;
  const worker=createHoldExpirationWorker({}, {expireFn:async()=>{calls++;await deferred;return {expired:0};}});
  const first=worker.tick();
  assert.deepEqual(await worker.tick(),{skipped:true});
  resume();await first;
  assert.equal(calls,1);
  worker.stop();
});
test('worker recovers from a temporary database failure on next tick',async()=>{
  let calls=0, errors=0;
  const worker=createHoldExpirationWorker({}, {expireFn:async()=>{
    calls++;
    if(calls===1) throw new Error('temporary failure');
    return {expired:0};
  },onError:()=>{errors++;}});
  const first=await worker.tick();
  assert.match(first.error.message,/temporary failure/);
  assert.deepEqual(await worker.tick(),{expired:0});
  assert.equal(errors,1);
  worker.stop();
});
test('worker drains at most four batches per tick',async()=>{
  let calls=0;
  const worker=createHoldExpirationWorker({}, {batchSize:2,expireFn:async()=>{calls++;return {expired:2};}});
  assert.deepEqual(await worker.tick(),{expired:8});
  assert.equal(calls,4);
  worker.stop();
});
test('worker stops cleanly and ignores subsequent ticks',async()=>{
  const worker=createHoldExpirationWorker({}, {expireFn:async()=>({expired:0})});
  worker.stop();
  assert.deepEqual(await worker.tick(),{skipped:true});
});

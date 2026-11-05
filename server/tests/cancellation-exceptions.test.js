import test from 'node:test';
import assert from 'node:assert/strict';
import { cancellationMode, isCancellationReasonValid, validateCancellationDecision,
  validateCancellationReview, rollbackCancellation } from '../src/cancellation-rules.js';

const future='2026-12-31T12:00:00.000Z';
const past='2026-01-01T00:00:00.000Z';
const now=Date.parse('2026-11-04T12:00:00.000Z');

test('hold paid=NO, unexpired: cancel immediately; no refund created by rule',()=>{
  assert.equal(cancellationMode('PENDING_PAYMENT','PENDING',{holdExpiresAt:future,nowMs:now}),'IMMEDIATE');
});
test('hold has expired exactly at deadline (boundary): reject cancellation',()=>{
  assert.equal(cancellationMode('PENDING_PAYMENT','PENDING',{holdExpiresAt:new Date(now),nowMs:now}),'EXPIRED');
});
test('old, missing or invalid expiry all block immediate cancellation',()=>{
  for(const x of [past,null,'bad-value']) assert.equal(cancellationMode('PENDING_PAYMENT','PENDING',{holdExpiresAt:x,nowMs:now}),'EXPIRED');
});
test('confirmed paid may self-cancel, but refund must remain separate',()=>{
  assert.equal(cancellationMode('CONFIRMED','PAID'),'IMMEDIATE');
});
test('wrong payment state, checked-in, cancelled, expired cannot request cancellation',()=>{
  for(const [status,payment] of [['CONFIRMED','PENDING'],['CONFIRMED','REFUNDED'],['CHECKED_IN','PAID'],['CANCELLED','PAID'],['EXPIRED','PENDING'],['PENDING_PAYMENT','PAID']])
    assert.equal(cancellationMode(status,payment),'BLOCKED');
});
test('invalid reason: empty, too short, too long, types other than string',()=>{
  for(const value of ['', '    ','abcd','x'.repeat(501), null, 12345, ['valid reason'], {reason:'valid reason'}])
    assert.equal(isCancellationReasonValid(value),false);
  assert.equal(isCancellationReasonValid('  Đổi ý muốn hủy lịch  '),true);
  assert.equal(isCancellationReasonValid('a'.repeat(500)),true);
});
test('only explicit approval/rejection accepted',()=>{
  for(const x of [undefined,null,{}, {decision:'CANCEL'}, {decision:0}, {decision:'approve'}])
    assert.match(validateCancellationDecision(x),/APPROVE|REJECT/);
  assert.equal(validateCancellationDecision({decision:'APPROVE'}),null);
});
test('reject needs meaningful explanation, accept optional explanation',()=>{
  assert.match(validateCancellationDecision({decision:'REJECT'}),/5 ký tự/);
  assert.match(validateCancellationDecision({decision:'REJECT',decisionReason:'abc'}),/5 ký tự/);
  assert.equal(validateCancellationDecision({decision:'REJECT',decisionReason:'Khách đã check-in'}),null);
  assert.equal(validateCancellationDecision({decision:'APPROVE',decisionReason:''}),null);
});
test('reject untrusted JSON reason shapes, accept max 500',()=>{
  for(const v of [{a:1},['abcde'],44,'x'.repeat(501)])
    assert.ok(validateCancellationDecision({decision:'APPROVE',decisionReason:v}));
  assert.equal(validateCancellationDecision({decision:'APPROVE',decisionReason:'x'.repeat(500)}),null);
});
test('double review: PENDING only, other requests must return conflict',()=>{
  for(const status of ['APPROVED','REJECTED','CANCELLED'])
    assert.match(validateCancellationReview(status,'CONFIRMED','PAID','APPROVE'),/đã được xử lý/);
});
test('stale booking or changed payment blocks approval',()=>{
  for(const [status,payment] of [['CHECKED_IN','PAID'],['CANCELLED','PAID'],['CONFIRMED','REFUNDED'],['EXPIRED','PENDING']])
    assert.match(validateCancellationReview('PENDING',status,payment,'APPROVE'),/thay đổi/);
});
test('rejection does not cancel or mutate the confirmed booking by rule',()=>{
  assert.equal(validateCancellationReview('PENDING','CONFIRMED','PAID','REJECT'),null);
});
test('DB failure triggers rollback and preserves the original error',async()=>{
  const calls=[]; const original=new Error('lost connection');
  const client={query:async sql=>{calls.push(sql)}};
  await assert.rejects(()=>rollbackCancellation(client,original),error=>error===original);
  assert.deepEqual(calls,['ROLLBACK']);
});
test('even if rollback itself fails, the original DB error remains visible',async()=>{
  const original=new Error('write failed');
  const client={query:async()=>{throw new Error('rollback failed')}};
  await assert.rejects(()=>rollbackCancellation(client,original),error=>error===original);
});

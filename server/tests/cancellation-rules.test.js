import test from 'node:test';
import assert from 'node:assert/strict';
import { cancellationMode, isCancellationReasonValid } from '../src/cancellation-rules.js';
test('unpaid and paid bookings can be cancelled immediately',()=>{
 assert.equal(cancellationMode('PENDING_PAYMENT','PENDING'),'IMMEDIATE');
 assert.equal(cancellationMode('CONFIRMED','PAID'),'IMMEDIATE');
});
test('cannot cancel checked-in, expired or already cancelled bookings',()=>{
 for(const status of ['CHECKED_IN','CANCELLED','EXPIRED']) assert.equal(cancellationMode(status,'PAID'),'BLOCKED');
 assert.equal(cancellationMode('CONFIRMED','REFUND_PENDING'),'BLOCKED');
});
test('cancellation reason must contain between 5 and 500 characters',()=>{
 assert.equal(isCancellationReasonValid('  '),false);
 assert.equal(isCancellationReasonValid('abcde'),true);
 assert.equal(isCancellationReasonValid('x'.repeat(501)),false);
});

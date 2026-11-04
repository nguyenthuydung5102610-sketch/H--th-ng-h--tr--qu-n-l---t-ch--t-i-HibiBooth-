import test from 'node:test';
import assert from 'node:assert/strict';
import { unavailableRescheduleSlots } from '../src/reschedule-rules.js';

test('pre-check hides overlapping destinations but preserves nonoverlapping hours', () => {
  const options = ['09:00','09:30','10:00','10:30','11:00'];
  const result = unavailableRescheduleSlots(options, ['09:00'], '2030-08-20', Date.parse('2030-08-19T07:00:00+07:00'));
  assert.deepEqual(result, ['09:00', '09:30']);
});

test('pre-check disables time slots too close to the current Vietnam time', () => {
  const result = unavailableRescheduleSlots(['09:00','09:30','10:00'], [], '2030-08-20', Date.parse('2030-08-20T09:05:00+07:00'));
  assert.deepEqual(result, ['09:00','09:30']);
});

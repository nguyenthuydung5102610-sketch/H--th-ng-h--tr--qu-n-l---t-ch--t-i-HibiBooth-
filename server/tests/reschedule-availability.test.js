import test from 'node:test';
import assert from 'node:assert/strict';
import { unavailableRescheduleSlots } from '../src/reschedule-rules.js';

test('pre-check hides overlapping destinations but preserves nonoverlapping hours', () => {
  const options = ['09:00','09:30','10:00','10:30','11:00'];
  const result = unavailableRescheduleSlots(options, ['09:00'], '2030-08-20', Date.parse('2030-08-19T07:00:00+07:00'));
  assert.deepEqual(result, ['09:00']);
});

test('pre-check disables time slots too close to the current Vietnam time', () => {
  const result = unavailableRescheduleSlots(['09:00','09:30','10:00'], [], '2030-08-20', Date.parse('2030-08-20T09:05:00+07:00'));
  assert.deepEqual(result, ['09:00','09:30']);
});

test('pre-check respects old 60-minute reservations and closing time', () => {
  const options = ['09:00','09:30','10:00','22:00','22:30'];
  const oldReservation = [{time_slot:'09:00',duration_minutes:60}];
  const now = Date.parse('2030-08-19T07:00:00+07:00');
  assert.deepEqual(unavailableRescheduleSlots(options,oldReservation,'2030-08-20',now), ['09:00','09:30']);
  assert.deepEqual(unavailableRescheduleSlots(options,[], '2030-08-20',now,60), ['22:30']);
});

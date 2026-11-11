import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SESSION_MINUTES, slotsOverlap, isSessionWithinOpeningHours } from '../src/business-rules.js';
import { unavailableRescheduleSlots } from '../src/reschedule-rules.js';

const schema = fs.readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('migration keeps pre-existing sessions at 60 minutes and defaults new sessions to 30', () => {
  assert.equal(SESSION_MINUTES, 30);
  assert.match(schema, /ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60/);
  assert.match(schema, /ALTER TABLE bookings ALTER COLUMN duration_minutes SET DEFAULT 30/);
  assert.match(server, /booking_date, time_slot, duration_minutes, amount_vnd, hold_expires_at/);
});

test('available slots cannot overlap a legacy hour-long reservation', () => {
  const options = ['09:00', '09:30', '10:00', '10:30', '22:30'];
  const now = Date.parse('2030-01-01T08:00:00+07:00');
  const reservations = [{time_slot:'09:00', duration_minutes:60}];
  assert.deepEqual(unavailableRescheduleSlots(options,reservations,'2030-01-02',now), ['09:00','09:30']);
  assert.equal(slotsOverlap('09:30','09:00',30,60),true);
  assert.equal(slotsOverlap('10:00','09:00',30,60),false);
  assert.equal(isSessionWithinOpeningHours('22:30',30),true);
  assert.equal(isSessionWithinOpeningHours('22:30',60),false);
});

test('SQL check uses both intervals instead of comparing just the starting slots', () => {
  assert.match(server, /\+ duration_minutes/);
  assert.match(server, /SELECT time_slot, duration_minutes FROM bookings/);
  assert.match(server, /\$3::int \+ \$4::int/);
  assert.match(server, /\$4::int \+ \$5::int/);
});

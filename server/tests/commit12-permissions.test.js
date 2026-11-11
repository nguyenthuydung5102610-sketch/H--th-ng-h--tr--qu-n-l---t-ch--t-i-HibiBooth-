/**
 * Legacy Commit 12 permission regression tests, updated for the actual workflow:
 * customers reschedule/cancel directly; staff handles check-in/refund requests;
 * only owners approve refunds. The old approval APIs must be disabled (HTTP 410).
 *
 * These source-level guards do not replace HTTP integration tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { requireAuth, requireRole } from '../src/auth.js';
import { writeAudit } from '../src/db.js';

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(resolve(here, '../src/server.js'), 'utf8');
const layout = readFileSync(resolve(here, '../../client/src/components/Layout.tsx'), 'utf8');
const app = readFileSync(resolve(here, '../../client/src/App.tsx'), 'utf8');
const owner = readFileSync(resolve(here, '../../client/src/pages/OwnerPages.tsx'), 'utf8');

function callRole(user, allowed) {
  const result = { next: false, status: null };
  const res = {
    status(code) { result.status = code; return this; },
    json() { return this; },
  };
  requireRole(...allowed)({ user }, res, () => { result.next = true; });
  return result;
}

function routeSnippet(method, path, maxLength = 360) {
  const marker = `app.${method}('${path}'`;
  const start = server.indexOf(marker);
  assert.ok(start >= 0, `Expected ${method.toUpperCase()} ${path} to exist`);
  return server.slice(start, start + maxLength);
}

test('OWNER cannot access employee-only actions; EMPLOYEE can', () => {
  assert.deepEqual(callRole({ role: 'OWNER' }, ['EMPLOYEE']), { next: false, status: 403 });
  assert.deepEqual(callRole({ role: 'EMPLOYEE' }, ['EMPLOYEE']), { next: true, status: null });
});

test('Unauthenticated user is denied an employee-only action (403)', () => {
  assert.equal(callRole(undefined, ['EMPLOYEE']).status, 403);
});

test('Missing JWT is rejected by requireAuth (401)', () => {
  let status = null;
  requireAuth(
    { headers: {} },
    { status(code) { status = code; return this; }, json() { return this; } },
    () => assert.fail('Authentication must not pass without a token')
  );
  assert.equal(status, 401);
});

test('Deprecated change/cancellation approval APIs require login and respond 410', () => {
  for (const path of [
    '/api/management/cancellation-requests/:id/decision',
    '/api/management/reschedule-requests/:id/decision',
  ]) {
    const snippet = routeSnippet('patch', path);
    assert.match(snippet, /requireAuth\s*,\s*requireRole\('EMPLOYEE','OWNER'\)/);
    assert.match(snippet, /status\(410\)/);
    assert.doesNotMatch(snippet, /UPDATE\s+bookings\s+SET/i);
  }
});

test('Historical change-request listing APIs are authenticated, not public approval endpoints', () => {
  for (const path of ['/api/management/cancellation-requests', '/api/management/reschedule-requests']) {
    const snippet = routeSnippet('get', path);
    assert.match(snippet, /requireAuth\s*,\s*requireRole\('EMPLOYEE','OWNER'\)/);
  }
});

test('Customer self-service change/cancellation is separate from staff/owner approval', () => {
  const cancel = routeSnippet('post', '/api/bookings/:code/cancellation', 520);
  const reschedule = routeSnippet('post', '/api/bookings/:code/reschedule-requests', 510);
  assert.match(cancel, /normalizeCustomerPhone\(req\.body\?\.customerPhone\)/);
  assert.match(reschedule, /validateRescheduleInput/);
  assert.match(server, /CUSTOMER_CANCEL_BOOKING/);
  assert.match(server, /CUSTOMER_RESCHEDULE_BOOKING/);
});

test('Refund approval is OWNER-only and staff refund requests are EMPLOYEE-only', () => {
  assert.match(routeSnippet('patch', '/api/owner/refunds/:id/decision'), /requireAuth\s*,\s*requireRole\('OWNER'\)/);
  assert.match(routeSnippet('post', '/api/staff/bookings/:id/refunds'), /requireAuth\s*,\s*requireRole\('EMPLOYEE'\)/);
});

test('Owner navigation contains refund approval and audit, not change/cancellation approval', () => {
  const section = layout.slice(layout.indexOf('const OWNER_GROUPS'), layout.indexOf('export function AdminLayout'));
  assert.match(section, /chu-quan\/hoan-tien/);
  assert.match(section, /chu-quan\/nhat-ky/);
  assert.doesNotMatch(section, /chu-quan\/(doi-lich|huy-lich)/);
});

test('Staff and owner routes contain no obsolete approval screens', () => {
  assert.match(app, /StaffCheckinPage/);
  assert.match(app, /StaffRefundsPage/);
  assert.match(app, /OwnerRefundsPage/);
  assert.match(app, /OwnerAuditPage/);
  assert.doesNotMatch(app, /RescheduleManagementPage|CancellationManagementPage/);
});

test('Owner audit API exposes recorded actions and the name of the actor', () => {
  const start = server.indexOf("app.get('/api/owner/audit'");
  assert.ok(start >= 0);
  const endpoint = server.slice(start, start + 440);
  assert.match(endpoint, /requireAuth\s*,\s*requireRole\('OWNER'\)/);
  assert.match(endpoint, /LEFT JOIN users u ON u\.id=a\.user_id/);
  assert.match(endpoint, /u\.full_name/);
  assert.match(owner, /row\.full_name/);
});

test('writeAudit persists actor ID, action, entity and JSON details', async () => {
  const calls = [];
  const client = { query: async (sql, params) => { calls.push({ sql, params }); } };
  await writeAudit(client, 19, 'CUSTOMER_SERVICE_ACTION', 'BOOKING', 12, { bookingCode: 'HB-1234' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO audit_logs/);
  assert.deepEqual(calls[0].params.slice(0, 4), [19, 'CUSTOMER_SERVICE_ACTION', 'BOOKING', '12']);
  assert.deepEqual(JSON.parse(calls[0].params[4]), { bookingCode: 'HB-1234' });
});

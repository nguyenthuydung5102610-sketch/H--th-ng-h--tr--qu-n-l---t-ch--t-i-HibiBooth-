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
  let result = { next: false, status: null, message: null };
  const req = { user };
  const res = {
    status(code) { result.status = code; return this; },
    json(value) { result.message = value?.message; return this; }
  };
  requireRole(...allowed)(req, res, () => { result.next = true; });
  return result;
}

test('OWNER bị từ chối quyền xét duyệt đổi lịch và hủy đơn (403)', () => {
  const result = callRole({ id: 1, role: 'OWNER' }, ['EMPLOYEE']);
  assert.equal(result.status, 403);
  assert.equal(result.next, false);
});
test('EMPLOYEE được quyền xét duyệt đổi lịch và hủy đơn', () => {
  assert.deepEqual(callRole({ id: 2, role: 'EMPLOYEE' }, ['EMPLOYEE']).next, true);
});
test('Người chưa đăng nhập bị chặn ở tầng phân quyền', () => {
  const result = callRole(undefined, ['EMPLOYEE']);
  assert.equal(result.status, 403);
});
test('requireAuth trả 401 nếu thiếu token', () => {
  let status = null;
  requireAuth({ headers: {} }, {status(code) {status = code; return this;}, json() {}}, () => assert.fail('must not call next'));
  assert.equal(status, 401);
});

test('4 API xem/duyệt đổi lịch và hủy đơn yêu cầu quyền EMPLOYEE', () => {
  const endpoints = [
    ['get', '/api/management/cancellation-requests'],
    ['patch', '/api/management/cancellation-requests/:id/decision'],
    ['get', '/api/management/reschedule-requests'],
    ['patch', '/api/management/reschedule-requests/:id/decision']
  ];
  for (const [method, path] of endpoints) {
    const start = server.indexOf(`app.${method}('${path}'`);
    assert.notEqual(start, -1, `${method.toUpperCase()} ${path} is missing`);
    const header = server.slice(start, start + 230);
    assert.match(header, /requireAuth\s*,\s*requireRole\('EMPLOYEE'\)/,
      `${method.toUpperCase()} ${path} must be employee-only`);
  }
});
test('Cả hai API quyết định kiểm tra vai trò và trạng thái tài khoản thực trong database', () => {
  const actorGuard = "actor.rows[0].role !== 'EMPLOYEE'";
  assert.equal(server.split(actorGuard).length - 1, 2);
});
test('API hoàn tiền vẫn dành riêng cho OWNER', () => {
  const start = server.indexOf("app.patch('/api/owner/refunds/:id/decision'");
  assert.ok(start >= 0);
  assert.match(server.slice(start, start+150), /requireRole\('OWNER'\)/);
});
test('Menu chủ quán chỉ có phê duyệt hoàn tiền trong nhóm phê duyệt', () => {
  const section = layout.slice(layout.indexOf('const OWNER_GROUPS'), layout.indexOf('export function AdminLayout'));
  const approval = section.slice(section.indexOf("title: 'PHÊ DUYỆT'"), section.indexOf("title: 'QUẢN TRỊ'"));
  assert.match(approval, /chu-quan\/hoan-tien/);
  assert.doesNotMatch(approval, /chu-quan\/(doi-lich|huy-lich)/);
  assert.match(section, /chu-quan\/nhat-ky/);
});
test('Không còn route đổi/hủy của chủ quán; nhân viên vẫn có đủ hai màn hình', () => {
  const staffSection = app.slice(app.indexOf('path="/nhan-vien"'), app.indexOf('path="/chu-quan"'));
  const ownerSection = app.slice(app.indexOf('path="/chu-quan"'), app.indexOf('path="/redirect"'));
  assert.match(staffSection, /RescheduleManagementPage/);
  assert.match(staffSection, /CancellationManagementPage/);
  assert.doesNotMatch(ownerSection, /RescheduleManagementPage|CancellationManagementPage/);
  assert.match(ownerSection, /OwnerRefundsPage/);
  assert.match(ownerSection, /OwnerAuditPage/);
});
test('Nhật ký truy xuất tên, email, vai trò và ID của người thao tác', () => {
  assert.match(server, /u\.email AS actor_email,u\.role AS actor_role/);
  assert.match(owner, /row\.full_name/);
  assert.match(owner, /row\.actor_email/);
  assert.match(owner, /row\.user_id/);
});
test('Audit lưu user_id của nhân viên cùng hành động vào database', async () => {
  const calls=[];
  const client={query:async(sql,params)=>{calls.push({sql,params});}};
  await writeAudit(client,19,'APPROVE_CANCELLATION','CANCELLATION_REQUEST',12,{bookingCode:'HB-1234'});
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/INSERT INTO audit_logs/);
  assert.deepEqual(calls[0].params.slice(0,4),[19,'APPROVE_CANCELLATION','CANCELLATION_REQUEST','12']);
  assert.deepEqual(JSON.parse(calls[0].params[4]),{bookingCode:'HB-1234'});
});

// COMMIT 15 - non-destructive integration smoke test against a running local HIBIBOOTH API.
// Reads catalog/availability only; does not create bookings, payments or refunds.
import assert from 'node:assert/strict';

const base = (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const checks = [];
const request = async (path) => {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(6000) });
  let body;
  try { body=await response.json(); } catch { throw new Error(`${path}: response is not JSON (${response.status})`); }
  return {response,body};
};
const test = async (name, fn) => {
  try { await fn();checks.push({name,ok:true});console.log(`PASS ${name}`); }
  catch (error) {checks.push({name,ok:false});console.error(`FAIL ${name}: ${error.message}`); }
};

await test('backend health', async () => {
  const {response,body}=await request('/api/health');
  assert.equal(response.status,200);assert.equal(body.ok,true);
});
let firstRoomId;
await test('catalog and PostgreSQL read', async () => {
  const {response,body}=await request('/api/catalog');
  assert.equal(response.status,200);
  for (const key of ['rooms','packages','timeSlots']) assert.ok(Array.isArray(body[key]),`${key} must be an array`);
  assert.ok(body.rooms.length>0,'no active rooms (run db:init and initial seed on a NEW database only)');
  assert.ok(body.packages.length>0,'no active packages');
  assert.ok(body.timeSlots.length>0,'no time slots');
  firstRoomId=body.rooms[0].id;
});
await test('reject invalid availability input', async () => {
  const {response}=await request('/api/availability?date=2099-01-01&roomId=not-a-number');
  assert.equal(response.status,400);
});
if(firstRoomId!=null) {
  const future=new Date(Date.now()+30*86400000);
  const bits=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(future).map(x=>[x.type,x.value]));
  const date=`${bits.year}-${bits.month}-${bits.day}`;
  await test('availability reads booking conflicts', async () => {
    const {response,body}=await request(`/api/availability?date=${date}&roomId=${encodeURIComponent(firstRoomId)}`);
    assert.equal(response.status,200);assert.ok(Array.isArray(body.unavailable));
  });
}
const passed=checks.filter(x=>x.ok).length;
console.log(`\nSMOKE: ${passed}/${checks.length} checks passed (${base})`);
if(passed!==checks.length) process.exitCode=1;

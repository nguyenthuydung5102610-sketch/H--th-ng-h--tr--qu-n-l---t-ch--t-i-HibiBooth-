import test from 'node:test';
import assert from 'node:assert/strict';
import { isPayosNotFound, validPayosCheckoutUrl, recoverOrCreatePayosLink } from '../src/payos-link.js';

const args = { orderCode:1000020, amount:70000, holdExpiresAt:'2030-01-01T00:20:00.000Z', returnUrl:'http://localhost:5173/dat-lich', cancelUrl:'http://localhost:5173/dat-lich' };
const expected = {orderCode:1000020, amount:70000, status:'PENDING', qrCode:'000201010212...', checkoutUrl:'https://pay.payos.vn/web/test'};
const missing = () => Object.assign(new Error('HTTP 200, Mã thanh toán không tồn tại (code: 101)'), {code:'101'});
const clock = () => Date.parse('2030-01-01T00:00:00.000Z');
function fake({ get, create }) { const calls=[];return { calls, paymentRequests:{
  async get(code) {calls.push(['get',code]);return await get(code);},
  async create(body) {calls.push(['create',body]);return await create(body);},
}};}

test('recognize only explicit payOS not-found error, not a generic outage',()=>{
  assert.equal(isPayosNotFound(missing()),true);
  assert.equal(isPayosNotFound(new Error('fetch failed')),false);
  assert.equal(isPayosNotFound(Object.assign(new Error('other'),{code:'102'})),false);
});
test('existing pending payOS link is recovered without calling create',async()=>{
  const p=fake({get:async()=>expected,create:async()=>{throw Error('should not create');}});
  const link=await recoverOrCreatePayosLink(p,args,clock);
  assert.equal(link.qrContent,expected.qrCode);assert.deepEqual(p.calls.map(c=>c[0]),['get']);
});
test('stale reserved code 101 is retried with SAME orderCode, once',async()=>{
  const p=fake({get:async()=>{throw missing();},create:async(body)=>{assert.equal(body.orderCode,args.orderCode);return expected;}});
  const r=await recoverOrCreatePayosLink(p,args,clock);
  assert.equal(r.orderCode,args.orderCode);assert.deepEqual(p.calls.map(c=>c[0]),['get','create']);
});
test('network timeout or ambiguous status must NEVER create a new payment link',async()=>{
  const p=fake({get:async()=>{throw Error('ECONNRESET');},create:async()=>expected});
  await assert.rejects(recoverOrCreatePayosLink(p,args,clock),e=>e.code==='PROVIDER_UNAVAILABLE');
  assert.equal(p.calls.filter(c=>c[0]==='create').length,0);
});
test('concurrent create conflict recovers existing provider link (same code)',async()=>{
  let reads=0;const p=fake({get:async()=>{if(reads++===0)throw missing();return expected;},create:async()=>{throw Error('order already exists');}});
  assert.equal((await recoverOrCreatePayosLink(p,args,clock)).qrContent,expected.qrCode);
  assert.deepEqual(p.calls.map(c=>c[0]),['get','create','get']);
});
test('provider create failure and failed recovery keeps booking pending',async()=>{
  const p=fake({get:async()=>{throw missing();},create:async()=>{throw Error('provider unavailable');}});
  await assert.rejects(recoverOrCreatePayosLink(p,args,clock),e=>e.code==='CREATE_FAILED');
});
test('exact hold expiry refuses create, no calls to provider',async()=>{
  const p=fake({get:async()=>expected,create:async()=>expected});
  await assert.rejects(recoverOrCreatePayosLink(p,args,()=>Date.parse(args.holdExpiresAt)),e=>e.code==='EXPIRED');
  assert.equal(p.calls.length,0);
});
test('hold expiring after provider get prevents CREATE',async()=>{
  let current=clock();const p=fake({get:async()=>{current=Date.parse(args.holdExpiresAt);throw missing();},create:async()=>expected});
  await assert.rejects(recoverOrCreatePayosLink(p,args,()=>current),e=>e.code==='EXPIRED');
  assert.equal(p.calls.filter(c=>c[0]==='create').length,0);
});
test('wrong orderCode is rejected before QR is returned',async()=>{
  const p=fake({get:async()=>({...expected,orderCode:9999}),create:async()=>expected});
  await assert.rejects(recoverOrCreatePayosLink(p,args,clock),e=>e.code==='ORDER_MISMATCH');
});
test('wrong amount is rejected before QR is returned',async()=>{
  const p=fake({get:async()=>({...expected,amount:5000}),create:async()=>expected});
  await assert.rejects(recoverOrCreatePayosLink(p,args,clock),e=>e.code==='AMOUNT_MISMATCH');
});
test('already paid or cancelled provider order is not presented for payment',async()=>{
  for(const status of ['PAID','CANCELLED','EXPIRED']){
    const p=fake({get:async()=>({...expected,status}),create:async()=>expected});
    await assert.rejects(recoverOrCreatePayosLink(p,args,clock),e=>e.code==='NOT_PENDING');
  }
});
test('only trusted HTTPS payOS checkout links can be returned',async()=>{
  assert.equal(validPayosCheckoutUrl('javascript:alert(1)'),false);
  assert.equal(validPayosCheckoutUrl('https://pay.payos.vn.evil.com'),false);
  assert.equal(validPayosCheckoutUrl('https://pay.payos.vn/web/test'),true);
  const p=fake({get:async()=>({...expected,qrCode:'',checkoutUrl:'javascript:alert(1)'}),create:async()=>expected});
  await assert.rejects(recoverOrCreatePayosLink(p,args,clock),e=>e.code==='NO_LINK');
});
test('checkout-only response is valid when QR is temporarily unavailable',async()=>{
  const p=fake({get:async()=>({...expected,qrCode:''}),create:async()=>expected});
  const r=await recoverOrCreatePayosLink(p,args,clock);assert.equal(r.checkoutUrl,expected.checkoutUrl);assert.equal(r.qrContent,'');
});
test('invalid amount and order code are rejected before provider calls',async()=>{
  const p=fake({get:async()=>expected,create:async()=>expected});
  for(const orderCode of [0,-1,0.5,Number.MAX_SAFE_INTEGER+1]) {
    await assert.rejects(recoverOrCreatePayosLink(p,{...args,orderCode},clock),e=>e.code==='INVALID_INPUT');
  }
  assert.equal(p.calls.length,0);
});

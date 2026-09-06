/**
 * 상관관계 id 생성 / AsyncLocalStorage 오버헤드 측정.
 * request-context.ts 의 성능 주석에 적힌 수치의 근거다.
 *
 * 실행: node packages/net-utils/src/request-context.bench.mjs
 */
import { randomBytes, randomFillSync, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

const N = 500_000;

// ---- id 생성 ----
const POOL = 8 * 512;
let pool = Buffer.allocUnsafe(POOL);
let off = POOL;
function pooled() {
  if (off >= POOL) {
    randomFillSync(pool);
    off = 0;
  }
  const id = pool.toString('hex', off, off + 8);
  off += 8;
  return id;
}

function bench(label, fn, n = N) {
  fn();
  let best = Infinity;
  for (let r = 0; r < 3; r++) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < n; i++) fn();
    const ns = Number(process.hrtime.bigint() - t) / n;
    if (ns < best) best = ns;
  }
  console.log(`  ${label.padEnd(32)} ${best.toFixed(0).padStart(5)} ns`);
  return best;
}

console.log(`\n[1] id 생성 (${N.toLocaleString()}회)`);
bench('풀링 randomFillSync 8B hex', pooled);
bench('randomUUID()', () => randomUUID());
bench('randomUUID({cache:false})', () => randomUUID({ disableEntropyCache: true }));
bench('randomBytes(8).toString(hex)', () => randomBytes(8).toString('hex'));

// ---- AsyncLocalStorage ----
// 요청당 run() 1회 + 비동기 홉마다 getStore() 를 가정한 근사.
const als = new AsyncLocalStorage();
const ctx = Object.freeze({ traceId: 'a'.repeat(16), requestId: 'b'.repeat(16) });

console.log(`\n[2] AsyncLocalStorage (${N.toLocaleString()}회)`);
bench('run() + getStore() 1회', () => als.run(ctx, () => als.getStore()));
bench('getStore() 만 (컨텍스트 밖)', () => als.getStore());

const M = 50_000;
console.log(`\n[3] async 체인 5홉 (${M.toLocaleString()}회): ALS 유무 비교`);
const hop = async (v) => v + 1;
const chain = async () => {
  let v = 0;
  for (let i = 0; i < 5; i++) v = await hop(v);
  return v;
};
async function benchAsync(label, fn) {
  await fn();
  let best = Infinity;
  for (let r = 0; r < 3; r++) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < M; i++) await fn();
    const ns = Number(process.hrtime.bigint() - t) / M;
    if (ns < best) best = ns;
  }
  console.log(`  ${label.padEnd(32)} ${best.toFixed(0).padStart(5)} ns`);
  return best;
}
const plain = await benchAsync('ALS 없음', chain);
const wrapped = await benchAsync('ALS run() 으로 감쌈', () => als.run(ctx, chain));
console.log(`\n  요청당 ALS 오버헤드 ≈ ${(wrapped - plain).toFixed(0)} ns (5홉 기준)\n`);

#!/usr/bin/env node
/**
 * 모든 계약/무결성 게이트를 한 번에 돌린다 (`scripts/check-*.mjs` 전부).
 *
 * 왜 이 파일이 있는가: 게이트 목록이 두 곳에 손으로 적혀 있었다. `package.json` 의 lint 와
 * `.github/workflows/checks.yml` 이다. 그리고 실제로 갈라졌다. lint 는 4개를 부르고 CI 는 7개를
 * 불러, 세 게이트(로그 계약/단가 커버리지/포털 배선)가 로컬에서는 돌지 않았다. 두 목록을 손으로
 * 맞추는 방식은 다음 게이트를 추가할 때 또 갈라진다.
 *
 * 그래서 목록을 디스크에서 읽는다. `scripts/check-*.mjs` 를 찾아 전부 실행하므로, 새 게이트를
 * 추가하면 파일을 두는 것만으로 lint 와 CI 양쪽에 자동으로 들어온다.
 *
 * 첫 실패에서 멈추지 않는다. 게이트는 서로 독립이라 한 번에 모든 위반을 보여주는 편이 왕복을
 * 줄인다(포맷 하나 고쳐 push 하고 그제서야 다음 실패를 보는 일이 없게).
 *
 * 종료 코드: 하나라도 실패하면 1.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const SELF = 'check-all.mjs';

const gates = readdirSync(SCRIPTS_DIR)
  .filter((f) => f.startsWith('check-') && f.endsWith('.mjs') && f !== SELF)
  .sort();

if (gates.length === 0) {
  console.error('게이트를 찾지 못했습니다. scripts/check-*.mjs 가 있어야 합니다.');
  process.exit(1);
}

const failed = [];
for (const gate of gates) {
  console.log(`\n${'─'.repeat(72)}\n[check-all] ${gate}\n`);
  const r = spawnSync(process.execPath, [join(SCRIPTS_DIR, gate)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(gate);
}

console.log(`\n${'═'.repeat(72)}`);
if (failed.length === 0) {
  console.log(`[check-all] 게이트 ${gates.length}개 모두 통과`);
  process.exit(0);
}
console.error(`[check-all] 실패 ${failed.length}/${gates.length}: ${failed.join(', ')}`);
process.exit(1);
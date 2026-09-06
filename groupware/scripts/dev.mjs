// `pnpm run dev` 엔트리: 앱이 의존하는 도커 인프라를 먼저 보장(up -d)한 뒤 앱들을 turbo 로 띄우고,
// 무엇이 실제로 떴는지 점검해 요약한 다음 떠 있던 앱이 사라지는지 계속 지켜본다.
//
// 왜 점검이 필요한가: turbo 가 12개 dev 를 동시에 스트리밍하므로, 한 앱이 조용히 죽거나 아예 시작되지
//   않아도 로그가 흘러가 묻힌다. 실제로 "기획안 → 영상 만들기" 가 500 으로 실패한 원인이 video-model
//   미기동이었는데, 화면 문구("영상 만들기에 실패했습니다")로는 알 수 없었다. 그래서 기동 후 포트를
//   확인해 down 목록과 힌트를 한 블록으로 보여주고(report), 그 뒤로도 주기적으로 확인해 상태가 바뀔
//   때만 알린다(watchLiveness).
//
// 한 앱이 죽어도 전체를 내리지 않는다: turbo 를 `--continue=always` 로 돌리므로 나머지 11개는 그대로
//   살아 있고, `--summarize` 가 남긴 실행 요약으로 무엇이 먼저 죽었는지를 종료 시 짚어준다
//   (reportRunSummary). 자세한 이유는 아래 turbo 기동 지점의 주석 참고.
//
// 인프라 기동은 모두 비치명적이다: Docker 가 꺼져 있어도 경고만 하고 앱 dev 는 계속 진행한다
//   (그 서비스에 의존하는 기능만 비활성). 컨테이너는 restart:unless-stopped 라 한 번 뜨면 유지되고
//   `up -d` 는 멱등이다.
//
// 점검만 하려면(앱을 띄우지 않고 현재 상태만): `pnpm run dev:check`
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 앱 목록, 포트, 인프라는 dev-apps.mjs 가 단일 출처다. 종료(kill.mjs)도 같은 목록을 본다.
import { APPS, EXTERNAL, INFRA, probeAll } from './dev-apps.mjs';

/** turbo `--summarize` 산출 디렉터리(레포 루트 기준, .gitignore 됨). 종료 원인 특정에 쓴다. */
const RUNS_DIR = fileURLToPath(new URL('../.turbo/runs', import.meta.url));

/** 이 실행이 turbo 를 띄운 시각. 요약 파일을 고를 때의 하한선.
 *
 * 왜 필요한가: 요약은 turbo 를 부를 때마다 쌓인다. 다른 터미널에서 돌린 `pnpm build` 등이 dev 보다
 *   늦게 끝나면 "가장 최신 파일" 이 그쪽이라, 무관한 태스크 실패를 dev 의 사인으로 잘못 보고한다.
 */
let turboStartedAt = 0;

/** compose 파일 하나의 서비스들을 up -d 로 보장: 비치명적(실패해도 앱 dev 는 계속).
 *
 * 파일 단위로 한 번에 넘긴다: `up -d a b c` 가 compose 파싱을 한 번만 하고 서비스도 병렬로 띄운다.
 */
function ensureServices({ compose, services, warn }) {
  return new Promise((resolve) => {
    const child = spawn('docker', ['compose', '-f', compose, 'up', '-d', ...services], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    const done = (ok) => {
      if (!ok) console.warn(`\n[dev] ${warn} 앱 dev 는 계속 실행합니다.\n`);
      resolve();
    };
    child.on('exit', (code) => done(code === 0));
    child.on('error', () => done(false)); // docker 미설치/미기동.
  });
}

function report(apps, external) {
  const down = apps.filter((a) => !a.up);
  const lines = ['', '─'.repeat(72), '[dev] 기동 점검'];
  if (down.length === 0) {
    lines.push(`  앱 ${apps.length}개 모두 응답 (${apps.map((a) => a.port).join(', ')})`);
  } else {
    lines.push(`  응답 없음 ${down.length}/${apps.length}개:`);
    for (const a of down) {
      lines.push(`     - ${a.name} (:${a.port})${a.hint ? ` — ${a.hint}` : ''}`);
    }
    lines.push('     위 turbo 로그에서 해당 앱의 에러를 확인하세요(포트 충돌/의존성/설정).');
    // turbo 는 죽은 persistent 태스크를 되살리지 않는다. 전체를 재시작하지 않고 그 앱만 띄우면 된다.
    lines.push(`     그 앱만 다시: pnpm --filter ${down.map((a) => a.pkg).join(' --filter ')} dev`);
  }
  for (const e of external.filter((x) => !x.up)) {
    lines.push(`  ${e.name} (:${e.port}) 응답 없음. ${e.hint}`);
  }
  lines.push('─'.repeat(72), '');
  console.log(lines.join('\n'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GRACE_MS = 20_000; // 부팅 여유: nest/vite 가 포트를 잡기까지.
const DEADLINE_MS = 90_000;
const EVERY_MS = 5_000;
const WATCH_EVERY_MS = 15_000; // 기동 점검 이후 상시 감시 주기.

/** 기동 점검 이후 상시 감시. 떠 있던 앱이 사라지면 그 자리에서 알린다.
 *
 * 왜 필요한가: 기동 점검은 초반 한 번뿐이라, 그 뒤에 죽는 앱은 12개 로그 사이에 묻힌다. 두 가지가
 *   이 침묵을 만든다.
 *   1) turbo 를 `--continue=always` 로 돌리므로 한 앱이 죽어도 나머지는 그대로 살아 있다(의도된 동작).
 *   2) uvicorn --reload 는 자식(앱)이 크래시해도 리로더가 그대로 살아남는다(dead-child 감지 코드가
 *      없다). 그래서 FastAPI 앱은 죽어도 turbo 태스크가 정상으로 보인다. 포트로 봐야만 드러난다.
 *   상태가 바뀔 때만 출력하므로 조용할 땐 아무 것도 찍지 않는다.
 */
async function watchLiveness(initial) {
  const state = new Map(initial.map((a) => [a.name, a.up]));
  for (;;) {
    await sleep(WATCH_EVERY_MS);
    // 감시가 죽으면 이 프로세스가 통째로 끝나 turbo 가 고아가 된다(미처리 거부는 Node 를 종료시킨다).
    // 감시는 부가 기능이므로, 무슨 일이 있어도 루프를 유지한다.
    try {
      for (const a of await probeAll(APPS)) {
        if (state.get(a.name) === a.up) continue;
        state.set(a.name, a.up);
        if (a.up) {
          console.log(`\n[dev] ${a.name} (:${a.port}) 복구됨.\n`);
        } else {
          console.error(
            `\n[dev] ${a.name} (:${a.port}) 응답 중단.${a.hint ? ` ${a.hint}` : ''}` +
              `\n      해당 앱 로그를 확인하세요. 그 앱만 다시: pnpm --filter ${a.pkg} dev\n`,
          );
        }
      }
    } catch (err) {
      console.error(`[dev] 상시 감시 일시 오류(계속 감시): ${err?.message ?? err}`);
    }
  }
}

/** 기동 후 점검: 아직 안 뜬 것만 다시 찍고, 마감 시각에 한 번 요약한다. */
async function waitAndReport() {
  await sleep(GRACE_MS);
  const until = Date.now() + DEADLINE_MS;
  let apps = await probeAll(APPS);
  while (apps.some((a) => !a.up) && Date.now() < until) {
    await sleep(EVERY_MS);
    const rechecked = await probeAll(apps.filter((a) => !a.up));
    const byPort = new Map(rechecked.map((a) => [a.port, a.up]));
    apps = apps.map((a) => (a.up ? a : { ...a, up: byPort.get(a.port) ?? false }));
  }
  report(apps, await probeAll(EXTERNAL));
  watchLiveness(apps);
}

/** turbo 종료 후 원인 태스크 특정. `--summarize` 가 남긴 실행 요약에서 non-zero 태스크를 시간순으로 찍는다.
 *
 * 왜 필요한가: TUI 는 종료할 때 태스크별 로그 블록을 한꺼번에 쏟아내서, 정작 먼저 죽은 태스크가
 *   스크롤백 위로 밀려 안 보인다. 요약 파일에는 태스크별 종료코드와 종료시각이 남으므로, 그걸 시간순으로
 *   정렬하면 맨 위가 원인이고 나머지는 그 여파다.
 *   요약이 없으면(예: turbo 가 쓰기 전에 강제 종료) 조용히 넘어간다.
 */
function reportRunSummary() {
  let latest;
  try {
    const files = readdirSync(RUNS_DIR)
      .filter((n) => n.endsWith('.json'))
      .map((n) => join(RUNS_DIR, n))
      .filter((f) => statSync(f).mtimeMs >= turboStartedAt); // 이 실행 것만.
    if (files.length === 0) return;
    latest = files.reduce((a, b) => (statSync(a).mtimeMs >= statSync(b).mtimeMs ? a : b));
  } catch {
    return; // .turbo/runs 없음.
  }
  let tasks;
  try {
    tasks = JSON.parse(readFileSync(latest, 'utf8')).tasks ?? [];
  } catch {
    return; // 손상/미완성 요약.
  }
  const failed = tasks
    .filter((t) => (t.execution?.exitCode ?? 0) !== 0)
    .sort((a, b) => (a.execution?.endTime ?? 0) - (b.execution?.endTime ?? 0));
  if (failed.length === 0) return;

  const lines = ['', '─'.repeat(72), '[dev] 종료한 태스크 (먼저 끝난 순)'];
  for (const t of failed) {
    const e = t.execution ?? {};
    lines.push(`     ${t.taskId}  exit=${e.exitCode}${e.error ? `  ${e.error}` : ''}`);
  }
  lines.push('  맨 위가 원인, 아래는 그 여파일 가능성이 큽니다.', `  전체 요약: ${latest}`);
  lines.push('─'.repeat(72), '');
  console.error(lines.join('\n'));
}

// 점검 전용 모드: 앱을 띄우지 않고 현재 상태만 본다.
if (process.argv.includes('--check')) {
  const [apps, external] = await Promise.all([probeAll(APPS), probeAll(EXTERNAL)]);
  report(apps, external);
  process.exit(0);
}

// 1) 인프라 보장(비치명적, 멱등). 두 compose 파일은 서로 독립이라 동시에 띄운다.
//    postgres 는 네이티브라 여기서 관리하지 않고 점검만 한다.
await Promise.all(INFRA.map(ensureServices));

// 2) 앱 dev (turbo). Ctrl+C 시 함께 종료.
//
//    --continue=always: 한 앱이 죽어도 나머지를 유지한다. turbo 의 기본값은 `never`(= cancel all tasks)라,
//      태스크 하나가 non-zero 로 끝나면 멀쩡히 돌던 11개까지 강제 종료하고 전부 Failed 로 찍는다.
//      dev 는 persistent 라 성공 종료라는 게 없어서 요약이 `0 successful, 12 total` 로 나오고, 정작 원인은
//      드러나지 않는다. 죽은 하나만 재기동하면 되는 상황에서 전체를 다시 3~4분 띄우게 만들던 원인.
//    --summarize: .turbo/runs/<id>.json 에 태스크별 종료코드/종료시각을 남긴다 → reportRunSummary 가 사용.
//
//    같은 플래그가 package.json 의 `dev:apps` 에도 있다(turbo 를 직접 부르는 다른 진입점). 한쪽만
//    고치면 그 경로에서만 옛 전체취소 동작으로 되돌아간다. 바꿀 땐 둘을 함께.
turboStartedAt = Date.now();
const turbo = spawn(
  'turbo',
  ['run', 'dev', '--concurrency=15', '--continue=always', '--summarize'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
// Ctrl+C 로 끝낸 건 사고가 아니므로 사후 리포트를 띄우지 않는다(그때도 태스크는 non-zero 로 끝난다).
let interrupted = false;
turbo.on('exit', (code) => {
  if (!interrupted) reportRunSummary(); // 의도치 않게 끝났을 때만 원인 태스크를 짚어준다.
  process.exit(code ?? 0);
});
process.on('SIGINT', () => {
  interrupted = true;
  turbo.kill('SIGINT');
});
process.on('SIGTERM', () => {
  interrupted = true;
  turbo.kill('SIGTERM');
});

// 3) 기동 점검: turbo 로그 사이에 한 블록으로 요약(실패한 앱과 힌트).
//    turbo 가 죽으면 위 exit 핸들러가 프로세스를 끝내므로 별도 취소 장치는 필요 없다.
waitAndReport();

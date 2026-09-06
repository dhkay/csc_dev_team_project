// video-model dev 엔트리: `pnpm run dev`(turbo) 가 이 앱의 dev 로 호출한다.
//   video-model 은 API(uvicorn) 하나로 부족하다: 영상 렌더 잡을 소비하는 arq 워커가 없으면
//   버튼을 눌러도 잡이 큐에 영원히 대기한다. 그래서 dev 에서 API + 워커를 함께 상시 실행한다.
//   (운영은 compose 가 API/워커를 별 컨테이너로 띄운다. 이 스크립트는 로컬 dev 전용.)
//
// 순서: 1) alembic 마이그레이션(스키마 최신화. 안 하면 잡 생성이 스키마 불일치로 실패),
//       2) uvicorn(API, --reload) + arq 워커 동시 실행, 각자 죽으면 자동 재기동.
// 워커는 .env 의 COMFYUI_URL 을 읽어 씬 비주얼을 Wan(있으면)/slideshow(폴백) 로 렌더한다.
//
// 워커는 --watch 를 쓰지 않는다(의도적): Wan 렌더는 씬당 수 분이라, app/ 편집 시 워커가 리로드되면
//   진행 중 렌더가 끊긴다. 워커 코드를 바꿨을 땐 dev 를 수동 재시작하면 되고, 끊겨도 재개 설계가
//   완료 씬을 건너뛰고 이어서 한다. (API 의 uvicorn --reload 는 그대로: 렌더와 무관하므로.)
//
// 이 앱의 dev 는 한 번에 하나만 돈다(아래 LOCK_FILE). 두 번째 인스턴스는 먼저 것을 죽이지 않고
//   스스로 물러난다. 그러지 않으면 아래 reap 이 살아 있는 형제의 자식을 잔여물로 오인해 죽인다:
//   PID 파일에는 지금 돌고 있는 인스턴스의 자식도 들어 있고, 커맨드라인도 당연히 일치하기 때문이다.
//   실제로 그렇게 8000 이 조용히 내려갔다(다른 앱 13개는 멀쩡한데 이 앱만 사라져, "영상 만들기" 가
//   503 으로만 드러났다. 크래시가 아니라 정상 종료 경로라 로그도 남지 않았다).
//
// 한쪽이 죽어도 전체를 내리지 않고 그 프로세스만 재기동한다. API 가 (편집 reload/포트충돌/코드오류로)
//   죽어도 워커는 안 죽고, 워커가 (redis 늦게 뜸 등으로) 죽어도 API 는 안 죽는다. 각자 지수 backoff 로
//   영원히 재시도하므로 redis/DB 가 늦게 떠도 준비되는 순간 자동 복구된다. 전체 종료 서킷브레이커를
//   두면 워커까지 같이 내려 잡이 정체된다. 반복 크래시는 죽이는 대신 loud 경고로 드러내고
//   계속 재시도한다. 정상 가동(HEALTHY_MS 이상) 후 죽으면 backoff 를 리셋한다.
import { spawn, spawnSync } from 'node:child_process';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  rmSync,
  statSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

const opts = { stdio: 'inherit', shell: true };
const isWin = process.platform === 'win32';

// shell:true 라 spawn 이 만드는 건 래퍼(win: cmd.exe / posix: sh)이고 실제 uvicorn/arq 는 그 자식이다.
// child.kill() 은 래퍼만 죽여 자식(uvicorn/arq)이 고아로 남는다: 특히 옛 코드 arq 워커가 살아남아
// 큐 잡을 잘못 처리하고, 재시작마다 프로세스가 누적된다. 그래서 항상 트리 전체를 죽인다.
function killTree(pid) {
  if (pid == null) return;
  try {
    if (isWin) spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
    else process.kill(pid, 'SIGKILL');
  } catch {
    /* 이미 죽었으면 무시 */
  }
}

// 감시 대상: API 와 워커. reap 검증이 이 정의에서 파생되므로 여기가 앞에 온다.
//    한쪽의 반복 크래시가 다른 쪽(특히 워커)을 죽이지 않는다. redis/DB 가 늦게 떠도 준비되면 자동 복구.
const procs = [
  { name: 'api', cmd: 'uv', args: ['run', 'uvicorn', 'app.main:app', '--reload', '--port', '8000'] },
  { name: 'worker', cmd: 'uv', args: ['run', 'arq', 'app.worker.WorkerSettings'] },
];

// 지난 실행이 (비정상 종료 등으로) 남긴 자식 PID 를 기록해 두고, 다음 기동 때 트리째 정리한다.
//   이 파일의 PID 는 이 dev.mjs 가 직접 spawn 한 것들만: data-collector 등 다른 앱 프로세스는 절대 건드리지 않는다.
const PID_FILE = fileURLToPath(new URL('../.dev-pids', import.meta.url));

/**
 * 이 앱 dev 의 단일 인스턴스 락. 값은 이 스크립트를 돌리는 프로세스의 PID.
 *
 * PID 파일과 역할이 다르다. 그쪽은 "죽일 자식 목록" 이고 이쪽은 "감시자가 살아 있는가" 다. 둘을
 * 갈라야 reap 이 살아 있는 형제의 자식을 건드리지 않는다.
 */
const LOCK_FILE = fileURLToPath(new URL('../.dev-lock', import.meta.url));

// 락의 생존 신호는 PID 가 아니라 파일 수정 시각이다(heartbeat).
//
// PID 로 판단하려 했다가 두 번 틀렸다. PID 는 재사용되고, 커맨드라인으로 우리 것인지 확인하려 하면
// 실행 형태에 매달린다(`node scripts/dev.mjs` 는 상대 경로라 앱 이름이 커맨드라인에 없다. 실제로 그
// 판별이 조용히 실패해 락이 무력화됐다). heartbeat 는 그 둘에 의존하지 않는다: 살아 있는 감시자만
// 파일을 계속 만지므로, 최근에 만져졌는가가 곧 생존이다.
const LOCK_BEAT_MS = 5_000; // 이 간격으로 락 파일을 만진다.
const LOCK_STALE_MS = 20_000; // 이보다 오래 안 만져졌으면 감시자가 없다고 본다(비트 4회분).

/** 락이 살아 있으면 그 정보를, 낡았거나 없으면 null. */
function liveLock() {
  if (!existsSync(LOCK_FILE)) return null;
  let age = Infinity;
  let holder = '?';
  try {
    age = Date.now() - statSync(LOCK_FILE).mtimeMs;
    holder = readFileSync(LOCK_FILE, 'utf8').trim() || '?';
  } catch {
    return null; // 못 읽는 락은 낡은 것으로 본다.
  }
  return age <= LOCK_STALE_MS ? { holder, age } : null;
}

/**
 * 락을 잡는다. 이미 살아 있는 인스턴스가 있으면 아무것도 죽이지 않고 false 를 돌려준다.
 *
 * 이 게이트가 없으면 두 번째 기동이 첫 번째의 API/워커를 죽이고 자기 것을 띄운다(아래 reap 이
 * 살아 있는 형제의 자식을 잔여물로 오인한다). 그러면 8000 을 두 감시자가 다투고, 둘 중 하나가
 * 종료될 때 남은 쪽 자식까지 정리되어 앱이 조용히 사라진다.
 */
function acquireLock() {
  const live = liveLock();
  if (live) {
    console.log(
      `[video-model dev] 이미 이 앱의 dev 가 떠 있습니다(PID ${live.holder}). 이 인스턴스는 물러납니다.\n` +
        '   그쪽 인스턴스가 API(8000)와 arq 워커를 감시합니다. 새로 띄우려면 그것을 먼저 멈추세요.\n' +
        '   **워커 코드를 바꿨다면 이것만으로는 반영되지 않습니다**: 물러난 이 인스턴스는 아무것도\n' +
        '   재기동하지 않고, 그쪽 워커는 옛 코드로 계속 큐를 소비합니다(워커는 리로드하지 않습니다).\n' +
        `   그쪽이 이미 죽었다고 확신하면 ${Math.round(LOCK_STALE_MS / 1000)}초 뒤 다시 시도하거나 ` +
        '.dev-lock 파일을 지우세요.',
    );
    return false;
  }
  if (existsSync(LOCK_FILE)) {
    console.log('[video-model dev] 낡은 락을 회수합니다(감시자의 heartbeat 가 끊겼습니다).');
  }
  beatLock();
  // 살아 있는 동안 계속 만진다. unref: 이 타이머가 프로세스를 붙잡아 두지 않게 한다.
  setInterval(beatLock, LOCK_BEAT_MS).unref?.();
  return true;
}

function beatLock() {
  try {
    writeFileSync(LOCK_FILE, String(process.pid));
  } catch {
    /* 락을 못 써도 기동은 계속한다: 락은 안전장치이고 없으면 예전 동작이다 */
  }
}

/** 주어진 PID 들 중 우리가 띄운 것만 골라낸다. 커맨드라인으로 확인한다.
 *
 * PID 는 재사용된다. 지난 실행이 남긴 번호가 지금은 전혀 다른 프로세스(심지어 이 스크립트의 부모인
 * turbo/cmd)일 수 있고, 그걸 `taskkill /T` 로 트리째 죽이면 자기 자신이 사라진다: 그러면
 * `pnpm dev` 12개 스트림 중 이 앱만 조용히 없어지고(로그도 안 남고 PID 파일도 지워져) 나중에
 * "영상 만들기 500" 으로만 드러난다. 그래서 죽이기 전에 커맨드라인을 확인한다.
 *
 * 판별 기준은 `procs` 의 실행 인자에서 파생한다(정규식을 따로 들면 커맨드가 바뀔 때 조용히 안 맞고,
 * 그 순간 고아 워커 정리가 no-op 이 된다). 조회는 한 번에 한다. 프로세스 조회는 Windows 에서
 * 회당 수백 ms 라, 크래시 루프로 수십~수백 줄 쌓인 PID 파일을 하나씩 물으면 기동이 그만큼 늦어진다.
 */
function selectOurs(pids) {
  const targets = pids.filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  if (targets.length === 0) return [];
  const r = isWin
    ? spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Get-CimInstance Win32_Process -Filter "${targets
            .map((pid) => `ProcessId=${pid}`)
            .join(' or ')}" -ErrorAction SilentlyContinue | ` +
            'ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }',
        ],
        { encoding: 'utf8' },
      )
    : spawnSync('ps', ['-p', targets.join(','), '-o', 'pid=,args='], { encoding: 'utf8' });
  // 각 줄 = "<pid> <커맨드라인>". 커맨드라인에 우리 실행 인자(app.main:app / app.worker.…)가 있으면 우리 것.
  const ours = [];
  for (const [, pid, cmdline] of (r.stdout || '').matchAll(/^\s*(\d+)\s+(.*)$/gm)) {
    if (procs.some((p) => cmdline.includes(p.args[2]))) ours.push(Number(pid));
  }
  return ours;
}

function reapPreviousRun() {
  if (!existsSync(PID_FILE)) return;
  let pids = [];
  try {
    pids = readFileSync(PID_FILE, 'utf8').split(/\s+/).filter(Boolean).map(Number);
  } catch {
    /* 손상 파일 무시 */
  }
  pids = [...new Set(pids)]; // 재기동마다 append 되므로 중복이 쌓인다.
  const ours = selectOurs(pids);
  const skipped = pids.length - ours.length;
  if (ours.length) {
    console.log(`[video-model dev] 이전 실행의 잔여 프로세스 ${ours.length}개 정리(트리 종료)…`);
    for (const pid of ours) killTree(pid);
  }
  if (skipped > 0) {
    // 번호가 재사용됐거나 이미 죽은 경우: 남의 프로세스를 죽이지 않고 넘어간다.
    console.log(`[video-model dev] PID ${skipped}개는 우리 프로세스가 아니라 건너뜀(재사용/종료).`);
  }
  try {
    rmSync(PID_FILE);
  } catch {
    /* 무시 */
  }
}

function recordPid(pid) {
  if (pid == null) return;
  try {
    appendFileSync(PID_FILE, pid + '\n');
  } catch {
    /* 무시 */
  }
}
// 지수 backoff: 죽으면 이 간격으로 재시도(점점 늘어남), 정상 가동(HEALTHY_MS 이상) 후 죽으면 리셋.
const RESTART_MIN_MS = 1_000;
const RESTART_MAX_MS = 15_000;
const HEALTHY_MS = 30_000; // 이 시간 이상 살아있었으면 '정상'으로 보고 backoff/카운터 리셋.
const LOUD_AFTER = 3; // 연속 빠른 크래시 이 횟수부터 loud 경고(의존성/설정 문제 힌트): 그래도 계속 재시도.

// 0) 단일 인스턴스 확인. reap 보다 먼저여야 한다: 살아 있는 형제가 있으면 그 자식을 잔여물로
//    오인해 죽이기 전에 물러나야 한다.
if (!acquireLock()) process.exit(0);

// 0-1) 지난 실행이 남긴 잔여 프로세스(고아 uvicorn/arq) 정리: 옛 코드 워커가 큐를 가로채는 것 방지.
//      여기까지 왔으면 락을 우리가 쥐고 있으므로, PID 파일에 남은 것은 진짜 고아다.
reapPreviousRun();

// 1) 마이그레이션. 실패해도 dev 는 계속한다(비치명적). 단 성공할 때까지 배경에서 재시도한다.
//
// 한 번만 시도하면 안 되는 이유: Docker(DB)가 아직 뜨지 않은 채로 dev 를 시작하는 것이 흔한데, 그때
//   한 번 실패하고 끝나면 그 세션 내내 스키마가 낡은 상태로 남는다. API 는 그래도 8000 에 응답하므로
//   상위 dev 점검(probeAll)은 초록으로 보이고, 낡은 스키마는 "영상 만들기" 를 눌렀을 때 500 으로만
//   드러난다(모델에는 컬럼이 있고 DB 에는 없어 잡 생성 첫 질의에서 터지는 형태다).
//   프로세스 감시(supervise)와 같은 원칙을 스키마에도 적용한다: 준비되는 순간 자동으로 복구된다.
function migrateUntilOk(attempt = 1) {
  const r = spawnSync('uv', ['run', 'alembic', 'upgrade', 'head'], opts);
  if (r.status === 0) {
    if (attempt > 1) console.log('[video-model dev] alembic upgrade 성공: 스키마 최신화 완료.');
    return;
  }
  const delay = Math.min(RESTART_MIN_MS * 2 ** attempt, RESTART_MAX_MS);
  const secs = Math.round(delay / 1000);
  if (attempt >= LOUD_AFTER) {
    console.error(
      `\n[video-model dev] alembic upgrade 반복 실패(${attempt}회). ${secs}s 후 재시도(계속).\n` +
        '   스키마가 낡은 채로는 "영상 만들기" 가 500(잡 생성 시 컬럼 없음)으로 실패합니다.\n' +
        '   DB(localhost:5432)가 떠 있는지 확인하세요. 뜨면 자동 복구됩니다.\n',
    );
  } else {
    console.warn(`[video-model dev] alembic upgrade 실패. ${secs}s 후 재시도(앱은 계속 실행).`);
  }
  setTimeout(() => migrateUntilOk(attempt + 1), delay).unref?.();
}
migrateUntilOk();

let shutting = false;
const children = new Set();

/** 반복 크래시 시 무엇을 확인할지: 프로세스별 힌트. */
function crashHint(name) {
  return name === 'worker'
    ? 'redis(arq db2, localhost:6379)가 안 떠 있을 수 있어요. Docker Desktop/redis 확인. 뜨면 자동 복구됩니다.'
    : '포트 8000 충돌 또는 코드/설정 오류일 수 있어요. 위 로그 확인. 고치면 자동 복구됩니다.';
}

/**
 * 워커가 지금 코드보다 오래됐는지 알린다.
 *
 * 워커는 리로드하지 않는다(위 헤더의 이유: 렌더가 씬당 수 분이라 편집마다 끊기면 안 된다). 그래서
 * app/ 을 고친 뒤에도 옛 코드 워커가 계속 큐를 소비하는데, 그 상태는 화면에서 엉뚱한 실패로만
 * 드러난다. 새 씬 비주얼 provider 를 추가한 날 그것을 모르는 워커가 잡을 받아 "씬 이미지가
 * 필요합니다" 로 죽었고(그 provider 를 모른다는 사실은 어디에도 없었다) 같은 자리를 두 번 헤맸다.
 *
 * 그래서 여기서 사실만 말한다. 자동으로 재기동하지 않는 이유: 진행 중인 렌더를 끊는 판단은 사람의
 * 것이다(끊어도 재개되지만, 벤더 렌더는 그 사이에도 시간과 돈을 쓴다).
 */
const STALE_CHECK_MS = 60_000;
const STALE_NOTICE_MS = 5 * 60_000; // 같은 사실을 이보다 자주 말하지 않는다(편집마다 떠들지 않게).
const APP_DIR = fileURLToPath(new URL('../app', import.meta.url));
let workerStartedAt = 0; // 워커를 띄운 시각. 0 = 아직 안 띄웠다.
let lastStaleNotice = 0;

/** app/ 아래 .py 중 가장 최근에 바뀐 것. 없으면 null. */
function newestSource(dir) {
  let newest = null;
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return; // 지워지는 중 등: 신선도 알림은 부수 기능이라 조용히 넘긴다.
    }
    for (const e of entries) {
      if (e.name === '__pycache__' || e.name.startsWith('.')) continue;
      const full = `${d}/${e.name}`;
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name.endsWith('.py')) {
        try {
          const ms = statSync(full).mtimeMs;
          if (!newest || ms > newest.ms) newest = { ms, file: full };
        } catch {
          /* 무시 */
        }
      }
    }
  };
  walk(dir);
  return newest;
}

function noticeStaleWorker() {
  if (!workerStartedAt) return;
  const newest = newestSource(APP_DIR);
  if (!newest || newest.ms <= workerStartedAt) return;
  if (Date.now() - lastStaleNotice < STALE_NOTICE_MS) return;
  lastStaleNotice = Date.now();
  const at = (ms) => new Date(ms).toTimeString().slice(0, 8);
  const rel = newest.file.slice(APP_DIR.length + 1);
  console.warn(
    `\n[video-model dev] 워커가 코드보다 오래됐습니다(app/${rel} ${at(newest.ms)} > 워커 ${at(workerStartedAt)}).\n` +
      '   워커는 리로드하지 않습니다. 렌더 동작(씬 비주얼 provider 등)을 바꿨다면 이 dev 를 멈추고\n' +
      '   다시 띄우세요. 그러지 않으면 옛 코드 워커가 잡을 계속 소비합니다.\n',
  );
}

setInterval(noticeStaleWorker, STALE_CHECK_MS).unref?.();

function supervise(p) {
  let delay = RESTART_MIN_MS;
  let consecutive = 0;
  const start = () => {
    if (shutting) return;
    const startedAt = Date.now();
    if (p.name === 'worker') workerStartedAt = startedAt;
    const child = spawn(p.cmd, p.args, opts);
    children.add(child);
    recordPid(child.pid); // 비정상 종료 대비: 다음 기동의 reapPreviousRun 이 이 트리를 정리한다.
    let ended = false;
    const onEnd = (info) => {
      if (ended) return; // exit/error 중복 발화 방지.
      ended = true;
      children.delete(child);
      if (shutting) return;
      if (Date.now() - startedAt >= HEALTHY_MS) {
        delay = RESTART_MIN_MS; // 정상 가동 후 죽음 → transient 로 보고 리셋.
        consecutive = 0;
      } else {
        consecutive += 1;
        delay = Math.min(delay * 2, RESTART_MAX_MS);
      }
      const secs = Math.round(delay / 1000);
      if (consecutive >= LOUD_AFTER) {
        console.error(
          `\n[video-model dev] ${p.name} 반복 종료(${info}). ${secs}s 후 재시도(계속). ${crashHint(p.name)}\n`,
        );
      } else {
        console.error(`[video-model dev] ${p.name} 종료(${info}): ${secs}s 후 재기동.`);
      }
      setTimeout(start, delay);
    };
    child.on('exit', (code, signal) => onEnd(`code=${code ?? signal}`));
    child.on('error', (err) => onEnd(`spawn-error: ${err.message}`)); // uv 없음 등. 그래도 계속 재시도.
  };
  start();
}

function shutdown(exitCode) {
  if (shutting) return;
  shutting = true;
  // 래퍼만 죽이면 uvicorn/arq 가 고아로 남는다(win): 트리 전체를 죽인다.
  for (const c of children) killTree(c.pid);
  for (const f of [PID_FILE, LOCK_FILE]) {
    try {
      rmSync(f);
    } catch {
      /* 무시 */
    }
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

for (const p of procs) supervise(p);

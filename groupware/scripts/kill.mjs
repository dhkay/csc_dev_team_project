// dev 프로세스 확실히 종료하기. `pnpm kill:all` 및 `kill:<앱>` 의 실체.
//
// 왜 kill-port 로는 부족한가(전부 실측으로 확인된 것):
//   1) kill-port 는 `TaskKill /F /PID` 만 쓴다. /T 가 없어 트리를 안 죽인다. 리스닝 PID 만 죽으므로
//      `nest start --watch` 의 CLI 부모와 tsc 타입체커, uvicorn 리로더의 짝(부모 또는 자식)이 살아남는다.
//   2) video-model 은 아예 안 죽는다. apps/api/fastapi/video-model/scripts/dev.mjs 가 감시자라
//      자식이 죽으면 1초 뒤 되살린다. 포트로 죽이면 종료가 아니라 재시작이 된다.
//   3) 포트를 열지 않는 프로세스는 목록에 없다. arq 워커, turbo, nest CLI, 오케스트레이터가 남는다.
//
// 그래서 포트가 아니라 프로세스 트리를 다룬다. 절차는 다음과 같다.
//   1) 프로세스 표를 한 번 스냅샷한다(회당 수백 ms 라 여러 번 묻지 않는다).
//   2) 자기 자신과 자기 조상을 먼저 제외 목록에 넣는다. 이걸 빠뜨리면 kill 스크립트가 자신을 죽여
//      "절반만 정리된" 상태로 끝난다(같은 함정을 video-model dev.mjs 가 주석으로 남겨뒀다).
//   3) 씨앗 = 레지스트리 포트를 듣고 있는 PID + (레포 경로 AND dev 시그니처)를 가진 PID.
//      레포 경로만으로 고르면 에디터/언어서버까지 걸린다. 반드시 시그니처와 함께 본다.
//   4) 씨앗에서 위로(감시자, 래퍼) 아래로(자식) 확장한다. 위로 갈 때도 시그니처를 요구해 셸/터미널에서 멈춘다.
//   5) 부모부터 죽인다. 감시자가 먼저 죽어야 자식을 되살리지 못한다.
//   6) 포트를 다시 확인하고, 남아 있으면 한 번 더 돈다. 끝나고 남은 게 있으면 숨기지 않고 보고한다.
//
// 도커 인프라(redis/kafka/clickhouse/ollama)는 기본 대상이 아니다. 컨테이너는 멱등하게 재사용되고
//   기동이 느려서(특히 kafka, clickhouse), 앱만 내렸다 올리는 흔한 경우에 매번 같이 내리면 dev 시작이
//   그만큼 길어진다. 완전히 비우고 싶을 때만 `infra` 를 대상으로 명시한다.
//
// 사용:
//   node scripts/kill.mjs                 앱 전체
//   node scripts/kill.mjs api             그룹(api | web)
//   node scripts/kill.mjs video-model     개별
//   node scripts/kill.mjs infra           도커 인프라 컨테이너만 stop
//   node scripts/kill.mjs api infra       조합
//   node scripts/kill.mjs --dry-run       죽이지 않고 대상만 출력
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { INFRA, probeAll, selectApps } from './dev-apps.mjs';

const isWin = process.platform === 'win32';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');

/** dev 프로세스임을 말해주는 커맨드라인 시그니처.
 *
 * 레포 경로만으로 고르면 에디터, 언어서버, 이 스크립트를 띄운 도구까지 걸린다. 실제로 dev 로 뜨는
 * 것들만 좁혀 잡는다. 새 앱의 실행 방식이 다르면 여기 한 줄을 추가한다.
 */
const DEV_SIGNATURES = [
  /turbo(\.exe)?["']?\s+run\s+dev/i, // turbo 오케스트레이터
  /scripts[\\/]dev\.mjs/i, // 루트 dev 엔트리 + video-model 감시자
  /nest(\.js)?["']?\s+start/i, // NestJS watch
  /vite(\.js)?["']?\s+dev/i, // SvelteKit dev 서버
  /uvicorn\s+app\.main:app/i, // FastAPI
  /arq\s+app\.worker/i, // video-model 렌더 워커(포트 없음)
  /tsx["']?\s+watch/i, // scalar-gateway
  // 데스크톱(Tauri): node(vite) + cargo + 네이티브 exe 3층 트리라 포트만 봐서는 안 죽는다.
  /tauri(\.js|\.cmd)?["']?\s+dev/i, // Tauri CLI
  /cargo(\.exe)?["']?\s+(run|build)/i, // Tauri 가 띄우는 cargo
];

const hasDevSignature = (cmd) => !!cmd && DEV_SIGNATURES.some((re) => re.test(cmd));
const inRepo = (cmd) => !!cmd && cmd.toLowerCase().includes(REPO_ROOT.toLowerCase());

/** 커맨드라인이 특정 앱의 것인지. 앱 디렉터리 경로를 지문으로 쓴다(슬래시 방향 무관). */
function belongsTo(cmd, apps) {
  if (!cmd) return false;
  const lower = cmd.toLowerCase();
  return apps.some((a) => {
    const dir = a.dir?.toLowerCase();
    return dir && (lower.includes(dir) || lower.includes(dir.replace(/\//g, '\\')));
  });
}

/** 프로세스 표 스냅샷: Map<pid, { pid, ppid, name, cmd }>. 조회는 딱 한 번. */
function processTable() {
  const table = new Map();
  if (isWin) {
    // Get-CimInstance 는 netstat/tasklist 텍스트와 달리 로캘 영향을 받지 않는다.
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        '@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine) | ConvertTo-Json -Compress -Depth 2',
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    for (const p of parseJsonArray(r.stdout)) {
      table.set(p.ProcessId, {
        pid: p.ProcessId,
        ppid: p.ParentProcessId,
        name: p.Name ?? '',
        cmd: p.CommandLine ?? '',
      });
    }
    return table;
  }
  const r = spawnSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8' });
  for (const line of (r.stdout || '').split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (m) table.set(Number(m[1]), { pid: +m[1], ppid: +m[2], name: m[3], cmd: m[4] });
  }
  return table;
}

/** 단일 객체/배열/빈 출력 모두를 배열로. PowerShell 은 항목이 1개면 배열로 감싸지 않는다. */
function parseJsonArray(stdout) {
  try {
    const parsed = JSON.parse(stdout || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/** 주어진 포트들을 듣고 있는 PID: Map<port, Set<pid>>. */
function listeningPids(ports) {
  const byPort = new Map(ports.map((p) => [p, new Set()]));
  if (isWin) {
    // Get-NetTCPConnection 은 상태가 열거형이라 "LISTENING" 문자열 로캘 문제가 없다.
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        '@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess) | ConvertTo-Json -Compress',
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    for (const c of parseJsonArray(r.stdout)) {
      if (byPort.has(c.LocalPort)) byPort.get(c.LocalPort).add(c.OwningProcess);
    }
    return byPort;
  }
  const r = spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
  for (const line of (r.stdout || '').split('\n')) {
    const m = line.match(/^\S+\s+(\d+).*:(\d+)\s+\(LISTEN\)/);
    if (m && byPort.has(Number(m[2]))) byPort.get(Number(m[2])).add(Number(m[1]));
  }
  return byPort;
}

/** pid 의 조상 체인(자기 자신 포함). 순환/유실 부모에도 멈춘다. */
function ancestors(table, pid) {
  const chain = new Set();
  let cur = pid;
  while (cur && table.has(cur) && !chain.has(cur)) {
    chain.add(cur);
    cur = table.get(cur).ppid;
  }
  return chain;
}

/** 죽일 PID 집합을 계산한다. protectedPids 는 절대 포함되지 않는다. */
function collectTargets(table, seeds, protectedPids) {
  const targets = new Set();
  const children = new Map();
  for (const p of table.values()) {
    if (!children.has(p.ppid)) children.set(p.ppid, []);
    children.get(p.ppid).push(p.pid);
  }

  const add = (pid) => {
    if (pid && table.has(pid) && !protectedPids.has(pid)) targets.add(pid);
  };

  // 위로: 감시자와 셸 래퍼까지. 시그니처를 요구하므로 터미널/에디터에 닿기 전에 멈춘다.
  for (const seed of seeds) {
    add(seed);
    let cur = table.get(seed)?.ppid;
    const seen = new Set();
    while (cur && table.has(cur) && !seen.has(cur) && !protectedPids.has(cur)) {
      seen.add(cur);
      if (!hasDevSignature(table.get(cur).cmd)) break;
      add(cur);
      cur = table.get(cur).ppid;
    }
  }

  // 아래로: 위에서 모인 모든 대상의 자손. 감시자를 죽여도 손자가 남지 않게 한다.
  const queue = [...targets];
  while (queue.length) {
    for (const child of children.get(queue.pop()) ?? []) {
      if (targets.has(child) || protectedPids.has(child)) continue;
      add(child);
      queue.push(child);
    }
  }
  return targets;
}

/** 조상이 먼저 오도록 정렬. 감시자가 자식보다 먼저 죽어야 되살리지 못한다. */
function parentsFirst(table, pids) {
  const depth = (pid) => {
    let d = 0;
    let cur = pid;
    const seen = new Set();
    while (cur && table.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = table.get(cur).ppid;
      d += 1;
    }
    return d;
  };
  return [...pids].sort((a, b) => depth(a) - depth(b));
}

function killTree(pid) {
  try {
    if (isWin) spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
    else process.kill(pid, 'SIGKILL');
  } catch {
    /* 이미 죽었으면 무시 */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_PASSES = 3; // 감시자가 죽기 직전 자식을 되살리는 경합에 대비한 재시도.

/** 도커 인프라 컨테이너 stop. 비치명적(Docker 가 꺼져 있어도 앱 정리 결과를 버리지 않는다).
 *
 * `stop` 이지 `down` 이 아니다. 컨테이너와 볼륨을 지우지 않아야 다음 기동이 빠르고, 로그/데이터가 남는다.
 */
function stopInfra(dryRun) {
  for (const { compose, services } of INFRA) {
    if (dryRun) {
      console.log(`  [dry-run] docker compose -f ${compose} stop ${services.join(' ')}`);
      continue;
    }
    const r = spawnSync('docker', ['compose', '-f', compose, 'stop', ...services], {
      stdio: 'inherit',
      shell: isWin,
    });
    if (r.status !== 0) console.warn(`[kill] ${compose} 인프라 stop 실패(무시하고 계속).`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const requested = argv.filter((a) => !a.startsWith('--'));

  // `infra` 는 앱이 아니라 도커 컨테이너를 가리키는 특수 대상이다. 앱 이름/그룹과 자유롭게 섞인다.
  const wantInfra = requested.includes('infra');
  const names = requested.filter((n) => n !== 'infra');
  // `infra` 만 지정했으면 앱은 건드리지 않는다(인자 없음 = 앱 전체, 와 구분).
  const killApps = !wantInfra || names.length > 0;

  let apps = [];
  if (killApps) {
    try {
      apps = selectApps(names);
    } catch (err) {
      console.error(`[kill] ${err.message}`);
      process.exit(2);
    }
  }
  const ports = apps.map((a) => a.port);
  console.log(
    `[kill] 대상: ${requested.length ? requested.join(', ') : '앱 전체'}` +
      (ports.length ? ` (포트 ${ports.join(', ')})` : ''),
  );
  if (wantInfra) stopInfra(dryRun);
  if (!killApps) {
    console.log('[kill] 인프라만 정리했습니다.');
    return;
  }

  let killedTotal = 0;
  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    const table = processTable();
    if (table.size === 0) {
      console.error('[kill] 프로세스 목록을 읽지 못했습니다. 권한 또는 PowerShell/ps 확인이 필요합니다.');
      process.exit(1);
    }
    // 자기 자신과 조상은 무슨 일이 있어도 건드리지 않는다(자기 트리를 죽이면 정리가 중간에 끊긴다).
    const protectedPids = ancestors(table, process.pid);

    const seeds = new Set();
    for (const pids of listeningPids(ports).values()) for (const pid of pids) seeds.add(pid);
    // 포트를 안 잡고 멈춰 있는 잔여물도 쓸어낸다(크래시한 vite, 되살아난 워커 등). 전체 대상이면 dev
    // 시그니처만으로, 개별 대상이면 그 앱의 디렉터리까지 맞을 때만 잡아 남의 앱을 건드리지 않는다.
    for (const p of table.values()) {
      if (!inRepo(p.cmd) || !hasDevSignature(p.cmd)) continue;
      if (names.length > 0 && !belongsTo(p.cmd, apps)) continue;
      seeds.add(p.pid);
    }

    const targets = parentsFirst(table, collectTargets(table, seeds, protectedPids));
    if (targets.length === 0) {
      if (pass === 1) console.log('[kill] 살아 있는 dev 프로세스가 없습니다.');
      break;
    }

    for (const pid of targets) {
      const p = table.get(pid);
      // 커맨드라인에 줄바꿈이 섞이면 목록이 무너진다(예: `node -e` 로 띄운 프로세스). 한 줄로 눌러 찍는다.
      const label = (p.cmd || p.name).replace(/\s+/g, ' ').trim().slice(0, 110);
      if (dryRun) {
        console.log(`  [dry-run] ${pid}  ${label}`);
        continue;
      }
      killTree(pid);
      killedTotal += 1;
      console.log(`  종료 ${pid}  ${label}`);
    }
    if (dryRun) break;

    await sleep(400); // 종료가 반영될 여유.
    if ((await probeAll(apps, 300)).every((a) => !a.up)) break;
  }

  if (dryRun) {
    console.log('[kill] dry-run 이라 아무 것도 죽이지 않았습니다.');
    return;
  }

  const left = (await probeAll(apps, 500)).filter((a) => a.up);
  if (left.length === 0) {
    console.log(`[kill] 완료. 프로세스 ${killedTotal}개 종료, 포트 ${ports.length}개 모두 비었습니다.`);
    return;
  }
  console.error(
    `[kill] 프로세스 ${killedTotal}개를 종료했지만 아직 잡혀 있는 포트가 있습니다: ` +
      left.map((a) => `${a.name}(:${a.port})`).join(', ') +
      '\n      다른 사용자 계정이나 도커 컨테이너가 그 포트를 쓰고 있을 수 있습니다.' +
      '\n      확인: node scripts/kill.mjs --dry-run',
  );
  process.exit(1);
}

await main();

#!/usr/bin/env node
/**
 * Higgsfield 영상 모델의 지금 상태를 확인한다.
 *
 * 벤더에 목록 API 가 없다(경로는 모델 엔드포인트와 요청 상태/취소뿐). 그래서 쓸 수 있는 모델을 아는
 * 방법은 하나씩 찔러 보는 것뿐이고, 그 판정을 사람이 매번 기억하는 대신 여기 담는다.
 *
 * 왜 이 스크립트가 필요한가
 *
 * 조사 중에 빈 본문 POST 의 400 을 '쓸 수 있다' 로 잘못 읽었다. 이 경로들은 입력 검증이 크레딧
 * 검사보다 먼저라, 400 은 파라미터가 맞다는 뜻일 뿐이다. 유효한 본문을 보내자 전부 403 이었다.
 * 그래서 이 스크립트는 유효한 본문으로 묻는다. 그러면 벤더의 상태 코드가 그대로 답이 된다.
 *
 * 상태 코드의 뜻(벤더 공식 표)
 *
 *   403  크레딧 부족          접근은 있다. 충전하면 쓸 수 있다
 *   404  이 계정에 그 모델 없음  경로가 틀렸거나 접근이 없다
 *   423  일시 차단            벤더 권고: 나중에
 *   503  꺼짐 또는 준비 안 됨   벤더 권고: 나중에
 *   400  검증 오류            열려 있다. 그 이상은 모드가 정한다(아래 MEANING 주석)
 *   200  접수됨              유료 잡이 만들어졌다
 *
 * 두 모드와 과금
 *
 * 기본은 dry 다. 길이를 일부러 열거값 밖으로 보내 검증에서 끊는다: 접근 여부(404/503/423)는 그대로
 * 드러나고 잡은 만들어지지 않는다. 다만 dry 는 크레딧을 확정하지 못한다(경로마다 검증과 크레딧
 * 검사의 순서가 달라, 403 이 뜬 모델에서만 확정된다).
 *
 * `--submit` 은 유효한 본문으로 실제 제출한다. 크레딧이 없으면 403 에서 끊겨 과금이 없지만,
 * 크레딧이 있으면 그 순간 유료 잡이 만들어진다.
 *
 * 실행
 *
 *   HIGGSFIELD_KEY='<id>:<secret>' node scripts/probe-higgsfield-models.mjs
 *   SERVICE_TOKEN_SECRET='<시크릿>' node scripts/probe-higgsfield-models.mjs --org 12
 *     (두 번째 형태는 실행 중인 dev csc-groupware 에서 그 조직의 키를 해석한다)
 *
 * 모델 목록은 카탈로그에서 읽는다(aiModelOptions.ts). 목록을 여기 복제하면 곧 어긋난다.
 */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATALOG = path.join(
  ROOT,
  'apps/web/groupware/src/lib/pages/tools/marketing-video/aiModelOptions.ts',
);
const ADAPTER = path.join(
  ROOT,
  'apps/api/fastapi/video-model/app/domains/video/adapters/outbound/processing/higgsfield_video.py',
);
const BASE = 'https://platform.higgsfield.ai';

/**
 * 상태 코드 → [이름, 뜻]. 모드에 따라 400 의 뜻이 다르다.
 *
 * dry 모드의 400 은 "검증까지 갔다" 는 뜻일 뿐 크레딧을 말해 주지 않는다. 이 경로들은 검증이 크레딧
 * 검사보다 먼저이기 때문이다(경로마다 순서가 다르기도 하다: Kling 3.0 은 빈 본문에도 403 이었다).
 * 조사 중에 그 400 을 '쓸 수 있다' 로 읽었다가 유효 본문에서 403 을 봤다. 그 오독을 이 표가
 * 되풀이하지 않도록 모드별로 갈라 적는다.
 */
const MEANING = (submit) => ({
  200: ['접수됨', '유료 잡이 만들어졌다'],
  400: submit
    ? ['본문 오류', '열려 있고 크레딧도 있다. 우리 요청 본문이 틀렸다']
    : ['검증까지 도달', '접근은 있다. **크레딧은 이 방식으로 알 수 없다**(--submit 으로 확인)'],
  401: ['인증 실패', '키가 잘못됐다'],
  403: ['크레딧 부족', '접근은 있다. 충전하면 쓸 수 있다'],
  404: ['이 계정에 없음', '경로가 틀렸거나 접근이 없다'],
  422: ['본문 검증 실패', '열려 있다'],
  423: ['일시 차단', '벤더 권고: 나중에'],
  503: ['꺼짐/준비 안 됨', '벤더 권고: 나중에'],
});

/** 카탈로그의 Higgsfield 영상 모델: key(경로) + 라벨 + 노출 버전. */
function catalogModels() {
  const src = readFileSync(CATALOG, 'utf8');
  const re = /\{\s*key:\s*'higgsfield\/([^']+)'[^}]*?label:\s*'([^']*)'[^}]*?versions:\s*([^,]+)/g;
  const out = [];
  for (const m of src.matchAll(re)) {
    out.push({ path: m[1], label: m[2], versions: m[3].trim() });
  }
  return out;
}

/** 어댑터가 파라미터를 아는 모델 경로(그 표에 없으면 프롬프트만 나간다). */
function knownParamPaths() {
  const src = readFileSync(ADAPTER, 'utf8');
  const body = src.split('_MODEL_PARAMS: dict[str, _ModelParams] = {')[1]?.split('}')[0] ?? '';
  return new Set([...body.matchAll(/"([^"]+)":\s*_ModelParams/g)].map((m) => m[1]));
}

async function resolveKeyViaGroupware(orgId) {
  const secret = process.env.SERVICE_TOKEN_SECRET;
  if (!secret) throw new Error('SERVICE_TOKEN_SECRET 이 필요하다(--org 형태).');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ service: 'csc-marketing', iat: now, exp: now + 300 });
  const sig = createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url');
  const url = `http://localhost:3000/internal/api-credentials/resolve?organizationId=${orgId}&provider=HIGGSFIELD`;
  const res = await fetch(url, { headers: { 'X-Service-Token': `${head}.${payload}.${sig}` } });
  if (!res.ok) throw new Error(`조직 키 해석 실패(${res.status}). dev csc-groupware 가 떠 있는지 확인.`);
  const creds = await res.json();
  if (!creds?.apiKey || !creds?.apiSecret) throw new Error('그 조직에 HIGGSFIELD 키가 등록되지 않았다.');
  return `${creds.apiKey}:${creds.apiSecret}`;
}

async function main() {
  const args = process.argv.slice(2);
  const submit = args.includes('--submit');
  const orgIdx = args.indexOf('--org');
  const orgId = orgIdx >= 0 ? args[orgIdx + 1] : null;

  const key = process.env.HIGGSFIELD_KEY ?? (orgId ? await resolveKeyViaGroupware(orgId) : null);
  if (!key) {
    console.error(
      '키가 필요하다. 둘 중 하나:\n' +
        "  HIGGSFIELD_KEY='<id>:<secret>' node scripts/probe-higgsfield-models.mjs\n" +
        "  SERVICE_TOKEN_SECRET='<시크릿>' node scripts/probe-higgsfield-models.mjs --org <조직id>",
    );
    process.exit(1);
  }

  const models = catalogModels();
  const known = knownParamPaths();
  if (models.length === 0) {
    console.error(`카탈로그에서 Higgsfield 모델을 찾지 못했다: ${CATALOG}`);
    process.exit(1);
  }

  console.log(
    submit
      ? '모드: --submit (**유효한 본문으로 실제 제출한다. 크레딧이 있으면 유료 잡이 만들어진다**)'
      : '모드: dry (길이를 일부러 열거값 밖으로 보내 검증에서 끊는다. 잡이 만들어지지 않는다)',
  );
  console.log(`모델 ${models.length}개 (출처: 카탈로그)\n`);

  for (const model of models) {
    // 길이/비율은 모델마다 다르다. dry 모드는 일부러 열거값 밖(7)을 보내 400 을 받는다.
    //   그러면 접근(404/503/423)과 크레딧(403)은 그대로 드러나고 잡은 만들어지지 않는다.
    const body = { prompt: 'A vertical marketing shot of a small white jar, soft light' };
    if (!submit) body.duration = 7;

    let status;
    let detail = '';
    try {
      const res = await fetch(`${BASE}/${model.path}`, {
        method: 'POST',
        headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      status = res.status;
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed).slice(0, 60);
      } catch {
        detail = text.slice(0, 60);
      }
    } catch (err) {
      status = 0;
      detail = String(err).slice(0, 60);
    }

    const [name, note] = MEANING(submit)[status] ?? ['?', ''];
    const params = known.has(model.path) ? '파라미터 확인됨' : '파라미터 미확인(프롬프트만 나간다)';
    console.log(`${String(status).padEnd(4)} ${name.padEnd(16)} ${model.label}`);
    console.log(`     ${model.path}`);
    console.log(`     ${note}${detail ? ` (${detail})` : ''} / ${params} / 노출: ${model.versions}`);
  }

  if (!submit) {
    console.log(
      '\ndry 모드는 **접근 여부**를 확정한다(404/503/423). 크레딧은 403 이 뜬 모델에서만 확정되고,' +
        '\n400 은 크레딧을 말해 주지 않는다. 실제로 만들 수 있는지 보려면 --submit 을 쓴다' +
        '\n(크레딧이 있으면 그 순간 유료 잡이 만들어진다).',
    );
  }
  console.log(
    '\n잔액과 한도는 API 로 볼 수 없다(조회 경로가 없다). Higgsfield Cloud 콘솔에서 확인한다:' +
      '\n  https://cloud.higgsfield.ai',
  );
}

await main();

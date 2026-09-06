// 마케팅 BFF 공용 헬퍼: 조직 스코프 확인 + 백엔드 에러 → 사용자 응답 매핑
// 채널/키워드 라우트가 공유. 봉투/인증/에러매핑 기본기는 공용 코어($lib/server/http/bff)에 위임한다.
import type { RequestEvent } from '@sveltejs/kit';
import { AiToolKey } from '@csc/entitlements';
import { AUTH_ERROR_RULES, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';
import {
  canEditToolSettings,
  canViewActivityLogs,
  isToolManagerSubject
} from './toolAccess';
import {
  MODEL_RATE_LIMITED,
  MODEL_SETUP_REQUIRED,
  SAGA_BUSY,
  SEGMENT_LIMIT_EXCEEDED
} from '$lib/features/marketing-channels/lib/modelSetupError';
import { asVersionMode, type VersionMode } from '$lib/shared/lib/versionMode/versionMode';

/** 로그인 + 조직 소속 확인 후 organizationId 반환. 실패 시 에러 응답 */
export async function requireOrgId(
  event: RequestEvent
): Promise<{ orgId: number } | { error: Response }> {
  const authErr = requireAuth(event);
  if (authErr) return { error: authErr };
  const user = await event.locals.getUser();
  const orgId = user?.organization?.id;
  if (!orgId) {
    return { error: fail('조직 정보를 확인할 수 없습니다.', { status: 403 }) };
  }
  return { orgId };
}

/**
 * 조직 스코프 + 사용자 식별(userId) 확인. 활성 채널처럼 "사용자별" 상태 라우트가 사용한다.
 * userId 는 세션 토큰의 조직유저 id(event.locals.userId): BFF 가 신뢰해 marketing 으로 전달한다.
 */
export async function requireOrgUser(
  event: RequestEvent
): Promise<{ orgId: number; userId: number } | { error: Response }> {
  const base = await requireOrgId(event);
  if ('error' in base) return base;
  const userId = event.locals.userId;
  if (!userId) {
    return { error: fail('사용자 정보를 확인할 수 없습니다.', { status: 401 }) };
  }
  return { orgId: base.orgId, userId };
}

/**
 * 조직 스코프 + 사용자 + 요청이 말한 도구 버전
 *
 * v1.0 과 v1.5 는 별개 워크스페이스라 산출물과 설정 슬롯이 이 값으로 갈린다. 요청이 버전을 말하지
 * 않으면 서버가 개인 설정에서 유추하게 되고, 그러면 화면이 말한 버전과 쓰기가 쓴 버전이 갈린다.
 *
 * 없거나 모르는 값이면 400 이다. 기본으로 좁히면 그 순간 다시 유추가 되고, 그 오답은 화면을
 * 보고서야 드러난다. 이 함수를 쓴 라우트만 `version` 필드를 갖게 되므로, 버전을 나를 자격이 없는
 * 라우트가 백엔드에 버전을 보내는 일도 타입으로 막힌다.
 */
export async function requireOrgUserVersion(
  event: RequestEvent
): Promise<{ orgId: number; userId: number; version: VersionMode } | { error: Response }> {
  const base = await requireOrgUser(event);
  if ('error' in base) return base;
  const version = asVersionMode(event.url.searchParams.get('version'));
  if (!version) {
    return { error: fail('도구 버전이 지정되지 않았습니다.', { status: 400 }) };
  }
  return { orgId: base.orgId, userId: base.userId, version };
}

/**
 * 버전 스코프 백엔드 경로: `/v/{version}{path}`.
 *
 * 한 곳에서 만드는 이유는 백엔드와 같다. 접두사 형태가 라우트마다 갈리면 그 라우트만 404 가 되고,
 * 그것은 배포 후에 드러난다. 백엔드의 `TOOL_VERSION_ROUTE` 와 짝이다.
 */
export function versionedPath(version: VersionMode, path: string): string {
  return `/v/${version}${path}`;
}

/**
 * 기획 프롬프트 지침 편집 권한 확인
 *
 * 편집 = 루트권한자(ROOT/대표) 또는 (팀장 + 마케팅영상 AI도구 보유). 판정은 `toolAccess` 의
 * `canEditToolSettings` 가 소유하고, 인가의 단일 출처는 백엔드 검증(getUser)이다.
 *
 * 채널이 개인 소유가 된 뒤에도 이 게이트가 남는 이유는 지침이 LLM 을 어떻게 지시할지의 문제라
 * 채널 소유와 별개로 도구 운영에 속하기 때문이다. 개인 설정(AI 모델, 브랜드/컨셉 세트)은 여기
 * 해당하지 않는다.
 *
 * userId 를 함께 주는 이유는 저장 대상 채널이 그 사람의 것인지 백엔드가 확인해야 하기 때문이고,
 * version 을 함께 주는 이유는 지침이 그 버전 프롬프트의 구조를 전제로 쓰이기 때문이다.
 */
export async function requireToolSettingsEditor(
  event: RequestEvent
): Promise<{ orgId: number; userId: number; version: VersionMode } | { error: Response }> {
  const base = await requireOrgUserVersion(event);
  if ('error' in base) return base;

  const user = await event.locals.getUser();
  if (!canEditToolSettings(user, AiToolKey.MarketingVideo)) {
    return { error: fail('설정 편집 권한이 없습니다.', { status: 403 }) };
  }
  return { orgId: base.orgId, userId: base.userId, version: base.version };
}

/**
 * 도구 운영 관리급 보유 여부(게이트가 아니라 사실 조회): 루트(ROOT)/대표(REPRESENTATIVE)/팀장(TEAM_LEADER)
 *
 * 세션을 읽는 얇은 래퍼다. 판정 규칙은 `toolAccess.isToolManagerSubject` 가 소유하고 레이아웃도
 * 같은 함수를 부른다(가시성과 집행이 한 규칙).
 */
export async function isToolManager(event: RequestEvent): Promise<boolean> {
  return isToolManagerSubject(await event.locals.getUser());
}

/**
 * 도구 운영 관리 권한 확인: 위 조건을 만족해야 통과, 아니면 403.
 * 대상은 조직이 함께 쓰는 자산(에셋/세트/태그 카탈로그)이다. 개인 것(채널, 설정, 워크스페이스)은
 * 여기 해당하지 않는다(requireOrgUser 로 본인 확인만 한다)
 * 인가 단일 출처는 백엔드 검증(getUser)
 */
export async function requireToolManager(
  event: RequestEvent
): Promise<{ orgId: number } | { error: Response }> {
  const base = await requireOrgId(event);
  if ('error' in base) return base;

  if (!(await isToolManager(event))) {
    return { error: fail('공용 자산 관리 권한이 없습니다.', { status: 403 }) };
  }
  return { orgId: base.orgId };
}

/**
 * 활동 로그 열람 권한 확인: 관리급(루트/대표/팀장). 판정은 `toolAccess.canViewActivityLogs` 가 소유한다.
 *
 * 통과하면 열람 범위(조직 id)를 돌려준다. 범위는 조직 전체이고 채널은 필터일 뿐 경계가 아니다.
 * 로그 범위가 좁아지는 날(부서 범위 등)에는 이 반환값이 그 범위를 담는 자리다.
 *
 * 레이아웃의 `canViewLogs`(사이드바 버튼 가시성, 페이지 게이트)와 같은 함수를 부르며, 집행은 이쪽이다.
 * 가시성은 UI 편의이고 이 게이트가 실제 경계다(직접 URL 접근/BFF 직접 호출 차단)
 */
export async function requireLogViewer(
  event: RequestEvent
): Promise<{ orgId: number } | { error: Response }> {
  const base = await requireOrgId(event);
  if ('error' in base) return base;

  const user = await event.locals.getUser();
  if (!canViewActivityLogs(user)) {
    return { error: fail('로그 열람 권한이 없습니다.', { status: 403 }) };
  }
  return { orgId: base.orgId };
}

/** 백엔드 호출 에러를 사용자 응답으로 정규화(400/401/403/404/409/503/500)
 *  402(자격증명)/502(AI 벤더/엔진)는 백엔드가 준 사유(예: "조직에 OpenAI API 키가 등록되지 않았습니다.",
 *  "이미지 생성 요청이 거부되었습니다: Billing hard limit has been reached.")를 그대로 노출해 운영자가
 *  원인을 바로 알 수 있게 한다(내부 운영 도구). 사유가 비면 일반 안내로 폴백 */
export function mapMarketingError(error: unknown, fallback: string): Response {
  return mapHttpError(error, {
    fallback,
    log: 'marketing keyword bff failed',
    table: {
      ...AUTH_ERROR_RULES,
      // 400 은 사유가 둘이다: 잘못된 요청과 동영상 수 상한 초과. 후자는 사람이 입력을 고쳐야 하는
      //   사유라 서버 문장을 그대로 보이고 코드를 실어 화면이 배치를 걷게 한다.
      400: (e) =>
        e.response?.data?.code === SEGMENT_LIMIT_EXCEEDED
          ? { message: e.message, errorCode: SEGMENT_LIMIT_EXCEEDED }
          : { message: '잘못된 요청입니다.' },
      402: (e) => ({
        message:
          e.message ||
          'AI 모델 호출에 실패했습니다. 조직의 API 키 등록과 채널 모델 설정을 확인하세요.',
        // 402 = 사람이 조직 설정/과금을 고쳐야 하는 사유(키 미등록, 결제 한도 초과): language-model
        //   이미지 실패 카탈로그가 이 상태를 그 두 사유에만 쓴다. 재시도로는 풀리지 않으므로 코드를 실어
        //   클라이언트가 작업 전체를 취소할 수 있게 한다(씬마다 헛된 재시도를 권하지 않는다)
        errorCode: MODEL_SETUP_REQUIRED
      }),
      404: { message: '대상을 찾을 수 없습니다.' },
      // 409 는 사유가 둘이다: 이름 중복과 같은 요청이 처리 중(사가 실행권 경쟁, 중복 제출)
      //   상태코드만으로는 갈리지 않아 코드로 판별한다. 문장으로 판별하면 백엔드가 문구를 다듬는 순간
      //   조용히 어긋나고, 상태코드만 보고 한 문장으로 덮으면 중복 제출한 사람에게 "이미 존재하는
      //   이름" 이라는 엉뚱한 말을 하게 된다.
      409: (e) =>
        e.response?.data?.code === SAGA_BUSY
          ? { message: e.message, errorCode: SAGA_BUSY }
          : { message: '이미 존재하는 이름입니다.' },
      // 429 = 외부 AI 벤더의 분당 한도(language-model 이 Anthropic 429/529 를 이 상태로 내린다).
      //   402 와 조치가 정반대다(기다리기 / 결제 채우기). 상태를 보존하고 코드를 실어 화면 제목이
      //   그 차이를 말하게 한다. 규칙이 없으면 500 일반 문구로 떨어져 벤더 5xx 와 구분되지 않는다.
      429: (e) => ({
        message: e.message || 'AI 모델 요청이 몰려 한도에 걸렸습니다. 잠시 후 다시 시도하세요.',
        errorCode: MODEL_RATE_LIMITED,
        status: 429
      }),
      502: (e) => ({
        message: e.message || 'AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도하세요.'
      }),
      // 503 = 하위 서비스에 닿지 못했다(연결 거부/타임아웃을 `@csc/net-utils` 가 정규화한 코드)
      //   규칙이 없으면 500 + 일반 문구로 떨어져, 서비스가 안 떠 있는 것과 우리 버그가 구분되지 않는다.
      //   (실제로 영상 렌더 서버가 내려간 동안 "영상 만들기에 실패했습니다" 만 보였다)
      //   상태코드를 503 으로 보존한다: 재시도로 풀릴 수 있는 종류이고, 데이터 문제가 아니다.
      503: (e) => ({
        message: e.message || '연결할 수 없는 서비스가 있습니다. 잠시 후 다시 시도하세요.',
        status: 503
      })
    }
  });
}

/**
 * id 파라미터 파싱: 경로/쿼리 원문을 양의 정수로 좁힌다. 형식이 아니면 null.
 * DB id 는 전부 양의 정수라 검증 규칙이 하나면 충분하다(라우트마다 같은 코드를 다시 쓰지 않는다)
 */
export function parsePositiveId(raw: string | null | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * 채널 id 파싱: 위 규칙과 같지만 이름으로 의도를 드러낸다.
 * 마케팅 BFF 전 라우트 공용: 채널은 모든 마케팅 자원의 스코프 키라 라우트마다 같은 검증이 필요하다.
 * null 이면 백엔드로 보내지 말고 400 으로 막는다(스코프 없는 요청이 조용히 전 채널을 훑는 것을 차단)
 */
export const parseChannelId = parsePositiveId;

/**
 * 요청 본문의 연출 축 조합을 좁힌다: { axis, option } 문자열 쌍만 남긴다.
 *
 * 세 라우트가 같은 값을 나른다(기획서 생성, 씬 이미지 생성, 기획안 저장). 라우트마다 따로 좁히면
 * 어느 한 곳이 통과시키는 형태가 달라지고, 그 차이는 백엔드 400 으로만 드러난다.
 *
 * 문구(label/note)는 버린다. 문구의 주인은 서버 카탈로그다. 클라이언트가 보낸 문구를 흘려보내면
 * 화면과 모델이 서로 다른 문구를 보게 되고, 문구 자리에 임의 지시를 넣을 수도 있다.
 * 축/옵션이 카탈로그에 있는 값인지는 백엔드가 판정한다(카탈로그의 주인이 거기다)
 */
export function parseConceptChoices(raw: unknown): { axis: string; option: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    if (typeof v !== 'object' || v === null) return [];
    const { axis, option } = v as { axis?: unknown; option?: unknown };
    if (typeof axis !== 'string' || typeof option !== 'string') return [];
    if (axis.length === 0 || option.length === 0) return [];
    return [{ axis, option }];
  });
}

/**
 * 멱등키를 좁힌다: 문자열 + 길이 상한(백엔드 컬럼과 같은 120)만 통과시킨다.
 *
 * 세 라우트가 같은 값을 나른다(기획안 저장, 영상 만들기, 세트 적용). 라우트마다 따로 좁히면 어느
 * 하나가 통과시키는 형태가 달라지고 그 차이는 백엔드 400 으로만 드러난다.
 */
export function parseClientRequestId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= 120 ? trimmed : undefined;
}

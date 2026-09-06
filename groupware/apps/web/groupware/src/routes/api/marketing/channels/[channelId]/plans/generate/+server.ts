// 기획서 생성 BFF: csc-marketing `/channels/:id/plans/generate` 중계(서비스토큰 자동 주입)
// POST: 선택 브랜드/컨셉 + 선택 개수(기획안/씬) + (선택) 목적 키워드로 기획서 생성. 임시(저장 안 함): 재생성은 재호출
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import {
  mapMarketingError,
  parseChannelId,
  parseConceptChoices,
  requireOrgUserVersion,
  versionedPath,
} from '$lib/server/marketing/bff';

/** 백엔드로 넘길 생성 입력. 브라우저가 보낸 값을 좁힌 결과다. */
type GenerateInput = {
  brandName: string;
  concepts: { axis: string; option: string }[];
  purposeKeywords: string[];
  proposalCount: number;
  sceneCount: number;
  excludeInfographic: boolean;
  sceneBrief: string;
  constraints: string;
};

/**
 * 요청 본문을 생성 입력으로 좁힌다. 주제가 없으면 null.
 *
 * 이 계층은 타입만 좁히고 값의 범위는 건드리지 않는다. 상한과 그 버전의 고정 규칙은 백엔드가
 * 갖는다(clampPlanCount, proposalCountForVersion). 여기서 자르면 화면과 서버가 다른 값을 진실로
 * 삼는다.
 *
 * 개수의 기본값도 여기 적지 않는다. 그것은 화면의 결정이라 이 파일이 알면 두 곳이 어긋나고,
 * 잘못된 요청이 비싼 일을 지어내면 안 된다(기획안 5개는 토큰 예산이 다섯 배이고 그 요금은 실제로
 * 나간다). 그래서 누락과 비정상은 최솟값으로 떨어진다.
 */
function parseGenerateInput(body: Record<string, unknown>): GenerateInput | null {
  const brandName = typeof body.brandName === 'string' ? body.brandName.trim() : '';
  const sceneBrief = typeof body.sceneBrief === 'string' ? body.sceneBrief.trim() : '';

  // 주제가 있어야 한다. 브랜드를 골랐거나(컨셉입력) 무엇을 만들지 직접 적었거나(프롬프트) 둘 중
  //   하나다. 둘 다 없으면 기획안이 가리킬 중심이 없어 모델이 그 자리를 스스로 지어낸다.
  //   목적 키워드는 이 판정에 넣지 않는다. 그것은 선택이고, 키워드만 있고 주제가 없으면 그 키워드를
  //   무엇에 붙일지 알 수 없다.
  if (brandName.length === 0 && sceneBrief.length === 0) return null;

  const toCount = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 1);

  return {
    brandName,
    // 이번 생성에만 쓰는 연출 조합(작업자가 모달에서 바꾼 값). 비면 백엔드가 세트 조합을 쓴다.
    concepts: parseConceptChoices(body.concepts),
    // 키워드는 저장하지 않는 값이라 요청이 유일한 출처다. 문자열만 남기고 넘긴다.
    purposeKeywords: Array.isArray(body.purposeKeywords)
      ? body.purposeKeywords.filter((v): v is string => typeof v === 'string')
      : [],
    proposalCount: toCount(body.proposalCount),
    sceneCount: toCount(body.sceneCount),
    excludeInfographic: body.excludeInfographic === true,
    sceneBrief,
    constraints: typeof body.constraints === 'string' ? body.constraints.trim() : ''
  };
}

/** 기획서 생성: POST /api/marketing/channels/:channelId/plans/generate { brandName } */
export async function POST(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const channelId = parseChannelId(event.params.channelId);
  if (!channelId) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await event.request.json();
  } catch {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const input = parseGenerateInput(body);
  if (!input) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const { sceneBrief, constraints, ...rest } = input;

  try {
    // 응답은 기획안 배열이 아니라 봉투다: 어느 모델이 썼는지를 함께 돌려준다(저장이 그것을
    //   되돌려 주면 그대로 굳는다). 이 계층은 본문을 통과시키므로 타입만 맞춘다.
    const res = await serverMarketingClient().POST<{ proposals: unknown[]; llmModel: string }>(
      versionedPath(auth.version, `/channels/${channelId}/plans/generate`),
      {
        organizationId: auth.orgId,
        // 활동 원장에 '누가' 를 남기려면 세션 유저가 필요하다(백엔드가 필수로 받는다)
        ownerUserId: auth.userId,
        ...rest,
        // 빈 값은 아예 보내지 않는다. 백엔드가 선택 필드로 받으므로 없는 것과 빈 문자열이 갈린다.
        ...(sceneBrief ? { sceneBrief } : {}),
        ...(constraints ? { constraints } : {}),
      },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '기획서를 생성하지 못했습니다.');
  }
}

// 씬 이미지 생성 BFF: csc-marketing `/channels/:id/plans/scene-image` 중계(서비스토큰 자동 주입)
// POST: 선택 브랜드/컨셉 + 씬 내용으로 이미지 1장 생성. 기획안은 휘발성이라 결과는 inline data URL.
//   기획안 생성(plans/generate)과 동일하게 requireOrgUser: 이미지는 기획안 완성의 일부(같은 게이트)이고,
//   활동 원장이 행위자를 요구하므로 조직 + 세션 유저를 함께 넘긴다.
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

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** 씬 이미지 생성: POST /api/marketing/channels/:channelId/plans/scene-image */
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
  const brandName = str(body.brandName);
  // 씬의 영어 시각 브리프: 화면에 무엇이 담기는지의 전부(자막/나레이션/브랜드 맥락의 의미가 여기 접혀 있다)
  //  한국어 원문(자막/나레이션/목적 키워드/제목)은 보내지 않는다: 이미지 모델이 한국어를 못 읽고,
  //  마케팅 언어를 넣으면 문자 그대로 그릴 대상으로 읽어 엉뚱한 그림이 나오거나 거부된다(실측)
  const imagePrompt = str(body.imagePrompt);
  if (brandName.length === 0 || imagePrompt.length === 0) {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const proposalTitle = str(body.proposalTitle);
  // 재시도 변주: 재시도마다 다른 버전이 나오게
  const variant = Number.isInteger(body.variant) ? (body.variant as number) : 0;
  // 그 기획안을 만들 때 쓴 조합(저장본 스냅샷). 비면 백엔드가 세트의 현재 조합을 쓴다.
  const concepts = parseConceptChoices(body.concepts);

  try {
    // prompt = 실제로 이미지 모델에 보낸 최종 조립 결과(상세의 '프롬프트 보기'가 이걸 그대로 띄운다)
    const res = await serverMarketingClient().POST<{ dataUrl: string; prompt: string }>(
      versionedPath(auth.version, `/channels/${channelId}/plans/scene-image`),
      {
        organizationId: auth.orgId,
        // 활동 원장에 '누가' 를 남기려면 세션 유저가 필요하다(백엔드가 필수로 받는다)
        ownerUserId: auth.userId,
        brandName,
        ...(concepts.length > 0 ? { concepts } : {}),
        imagePrompt,
        ...(proposalTitle.length > 0 ? { proposalTitle } : {}),
        ...(variant > 0 ? { variant } : {}),
      },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '이미지를 생성하지 못했습니다.');
  }
}

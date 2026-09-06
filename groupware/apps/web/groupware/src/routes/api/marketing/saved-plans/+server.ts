// 저장된 기획안 BFF: csc-marketing `/saved-plans` 로 중계(서비스토큰 자동 주입)
// 개인 워크스페이스(작업자 × 채널): organizationId + ownerUserId 는 BFF 가 세션에서 도출해 주입하고,
// channelId 는 클라이언트가 현재 채널을 넘긴다(워크스페이스는 채널별로 분리된다)
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { fileAccessUrl } from '$lib/server/upload/fileUrl';
import { ok, fail } from '$lib/server/http/bff';
import {
  mapMarketingError,
  parseChannelId,
  parseConceptChoices,
  requireOrgUserVersion,
  versionedPath,
  parseClientRequestId,
} from '$lib/server/marketing/bff';

interface SceneImageRef {
  index: number;
  uploadId: string;
  // 이 이미지를 만든 최종 프롬프트(생성 시점). 외부 이미지엔 없다.
  prompt?: string;
}

/** 저장본은 uploadId만 담는다. 접근 URL은 조회 시 현재 공개 베이스로 재구성(스토리지/도메인 비종속) */
interface RawSavedPlan {
  sceneImages?: SceneImageRef[];
  [k: string]: unknown;
}

/**
 * 내 개인 워크스페이스 저장본 목록: GET /api/marketing/saved-plans?channelId=N
 *
 * 워크스페이스는 채널별로 분리되므로 channelId 가 필수다. 클라이언트가 현재 채널을 넘긴다.
 * (라우트 파라미터가 아니라 쿼리인 이유: 이 BFF 는 채널 경로 밖에 있고 목록 성격이라 쿼리가 자연스럽다)
 */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const channelId = parseChannelId(event.url.searchParams.get('channelId'));
  if (!channelId) return fail('채널이 지정되지 않았습니다.', { status: 400 });

  try {
    const res = await serverMarketingClient().GET<RawSavedPlan[]>(
      versionedPath(auth.version, `/saved-plans?organizationId=${auth.orgId}&ownerUserId=${auth.userId}&channelId=${channelId}`)
    );
    // uploadId → 브라우저 표시용 서명 접근 URL(요청 때마다 재구성+서명 → 저장 URL stale/미서명 없음)
    const plans = (res.data ?? []).map((p) => ({
      ...p,
      sceneImages: (p.sceneImages ?? []).map((img) => ({
        index: img.index,
        uploadId: img.uploadId,
        url: fileAccessUrl(img.uploadId),
        // 생성 시점 프롬프트: 저장본 상세의 '프롬프트 보기'가 띄운다(여기서 빠뜨리면 화면에 도달하지 않는다)
        ...(img.prompt ? { prompt: img.prompt } : {})
      }))
    }));
    return ok(plans);
  } catch (error) {
    return mapMarketingError(error, '저장된 기획안을 불러오지 못했습니다.');
  }
}

/** 개인 저장(자동): POST /api/marketing/saved-plans { channelId?, brandName, title, summary, scenes, sceneImages } */
export async function POST(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const body = await event.request.json();
  const {
    channelId,
    brandName,
    brandConcepts,
    llmModel,
    videoModel,
    segmentMode,
    clientRequestId,
    title,
    summary,
    scenes,
    sceneImages,
    bgm,
  } = body ?? {};
  if (typeof title !== 'string' || title.trim() === '' || !Array.isArray(scenes)) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }

  try {
    const res = await serverMarketingClient().POST(versionedPath(auth.version, '/saved-plans'), {
      organizationId: auth.orgId,
      ownerUserId: auth.userId,
      channelId: typeof channelId === 'number' ? channelId : undefined,
      brandName: typeof brandName === 'string' ? brandName : '',
      // 멱등키: 같은 값으로 다시 저장하면 새 행이 아니라 먼저 저장된 행이 돌아온다('다시 저장' 안전)
      ...(parseClientRequestId(clientRequestId)
        ? { clientRequestId: parseClientRequestId(clientRequestId) }
        : {}),
      // 만들 때 쓴 연출 조합 스냅샷: 씬 이미지를 나중에 같은 화풍으로 다시 만들기 위한 값
      brandConcepts: parseConceptChoices(brandConcepts),
      // 이 기획안을 실제로 쓴 기획 LLM(생성 응답이 돌려준 값)
      //
      // 문자열이 아니면 빈 값으로 바꾸지 않고 그대로 빠뜨린다. 백엔드가 필수로 받으므로 400 이
      //   되고 그 사유가 우하단 알림에 뜬다. 빈 값으로 채우면 "모델을 모른다" 가 유효한 저장으로
      //   위장되고, 그 위장은 원장을 나중에 읽어도 드러나지 않는다.
      // 빈 문자열은 버리지 않는다. 그것은 서버가 실제로 돌려주는 값이다(그 채널에 기획 LLM 을
      //   고르지 않았고 language-model 도 모델 이름을 말하지 않은 경우). 원장의 값과 같아야 한다.
      ...(typeof llmModel === 'string' ? { llmModel } : {}),
      // 이 기획안을 만들 때 고른 영상 모델(설정과 다를 수 있다). 문자열이 아니면 없는 것으로 본다.
      ...(typeof videoModel === 'string' && videoModel.trim()
        ? { videoModel: videoModel.trim() }
        : {}),
      // 세그먼트 연결 방식(렌더가 해석하는 문자열). 값 공간은 렌더가 알고 여기서는 좁히지 않는다.
      ...(typeof segmentMode === 'string' && segmentMode.trim()
        ? { segmentMode: segmentMode.trim() }
        : {}),
      title: title.trim(),
      summary: typeof summary === 'string' ? summary : '',
      // 씬(효과음 sfx 포함) + 전체 BGM 스냅샷을 그대로 중계(백엔드 DTO 가 검증)
      scenes,
      sceneImages: Array.isArray(sceneImages) ? (sceneImages as SceneImageRef[]) : [],
      ...(bgm ? { bgm } : {})
    });
    return ok(res.data);
  } catch (error) {
    return mapMarketingError(error, '기획안 저장에 실패했습니다.');
  }
}

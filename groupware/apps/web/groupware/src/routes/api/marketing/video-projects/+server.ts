// 영상 프로젝트 BFF: csc-marketing `/video-projects` 로 중계(서비스토큰 자동 주입)
// 개인 워크스페이스(작업자 × 채널): organizationId + ownerUserId 는 BFF 가 세션에서 도출해 주입하고,
// channelId 는 클라이언트가 현재 채널을 넘긴다(워크스페이스는 채널별로 분리된다)
// 목록/생성 응답에 thumbnailUrl(첫 씬)/resultUrl(완성 영상)을 uploadId 로 재구성해 붙인다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail } from '$lib/server/http/bff';
import {
  mapMarketingError,
  parseChannelId,
  requireOrgUserVersion,
  versionedPath,
  parseClientRequestId,
} from '$lib/server/marketing/bff';
import {
  withVideoProjectUrls,
  type RawVideoProject,
} from '$lib/server/marketing/videoProjectUrls';

/**
 * 내 개인 워크스페이스 원천 영상 목록: GET /api/marketing/video-projects?channelId=N
 * (렌더 중이면 백엔드가 잡 상태 재조정). 워크스페이스는 채널별로 분리되므로 channelId 가 필수다.
 */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const channelId = parseChannelId(event.url.searchParams.get('channelId'));
  if (!channelId) return fail('채널이 지정되지 않았습니다.', { status: 400 });

  try {
    const res = await serverMarketingClient().GET<RawVideoProject[]>(
      versionedPath(auth.version, `/video-projects?organizationId=${auth.orgId}&ownerUserId=${auth.userId}&channelId=${channelId}`),
    );
    return ok((res.data ?? []).map(withVideoProjectUrls));
  } catch (error) {
    return mapMarketingError(error, '영상 프로젝트를 불러오지 못했습니다.');
  }
}

/** 영상 만들기: POST /api/marketing/video-projects { savedPlanId }. 기획안 스냅샷 → 렌더 잡 등록 */
export async function POST(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const body = (await event.request.json().catch(() => null)) as {
    savedPlanId?: number;
    resolution?: string;
    clientRequestId?: unknown;
  } | null;
  const savedPlanId = Number(body?.savedPlanId);
  if (!Number.isInteger(savedPlanId) || savedPlanId <= 0) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }
  // 화질은 그대로 넘긴다. 어휘 검증은 csc-marketing DTO, 모델 지원 여부 clamp 는 그 서비스가 한다.
  //   (BFF 가 한 번 더 판단하면 규칙이 두 곳으로 갈라진다)
  const resolution = typeof body?.resolution === 'string' ? body.resolution : undefined;
  // 멱등키: 더블클릭/재시도가 렌더 잡을 두 번 만들지 않게 한다(백엔드가 유료 잡 전에 판정)
  const clientRequestId = parseClientRequestId(body?.clientRequestId);

  try {
    const res = await serverMarketingClient().POST<RawVideoProject>(versionedPath(auth.version, '/video-projects'), {
      organizationId: auth.orgId,
      ownerUserId: auth.userId,
      savedPlanId,
      ...(resolution ? { resolution } : {}),
      ...(clientRequestId ? { clientRequestId } : {}),
    });
    return ok(withVideoProjectUrls(res.data));
  } catch (error) {
    return mapMarketingError(error, '영상 만들기에 실패했습니다.');
  }
}

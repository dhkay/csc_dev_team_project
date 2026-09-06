// 최종 영상 BFF: csc-marketing `/video-finals` 로 중계(서비스토큰 자동 주입)
// 개인 워크스페이스(작업자 × 채널): organizationId + ownerUserId 는 BFF 가 세션에서 도출해 주입하고,
// channelId 는 클라이언트가 현재 채널을 넘긴다(워크스페이스는 채널별로 분리된다)
// 목록/생성 응답에 resultUrl(완성 영상)을 uploadId 로 재구성해 붙인다.
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
import { withVideoFinalUrls, type RawVideoFinal } from '$lib/server/marketing/videoFinalUrls';

/** 내 최종 영상 목록: GET /api/marketing/video-finals (렌더 중이면 백엔드가 잡 상태 재조정) */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const channelId = parseChannelId(event.url.searchParams.get('channelId'));
  if (!channelId) return fail('채널이 지정되지 않았습니다.', { status: 400 });

  try {
    const res = await serverMarketingClient().GET<RawVideoFinal[]>(
      versionedPath(auth.version, `/video-finals?organizationId=${auth.orgId}&ownerUserId=${auth.userId}&channelId=${channelId}`),
    );
    return ok((res.data ?? []).map(withVideoFinalUrls));
  } catch (error) {
    return mapMarketingError(error, '최종 영상을 불러오지 못했습니다.');
  }
}

/** 세트 적용: POST /api/marketing/video-finals { sourceId, setId }. 완성 원천 + 세트 → FINALIZE 잡 등록 */
export async function POST(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const body = (await event.request.json().catch(() => null)) as
    | { sourceId?: number; setId?: number; clientRequestId?: unknown }
    | null;
  const sourceId = Number(body?.sourceId);
  const setId = Number(body?.setId);
  if (!Number.isInteger(sourceId) || sourceId <= 0 || !Number.isInteger(setId) || setId <= 0) {
    return fail('잘못된 요청입니다.', { status: 400 });
  }
  // 멱등키: 더블클릭/재시도가 합성 잡을 두 번 만들지 않게 한다(백엔드가 유료 잡 전에 판정)
  const clientRequestId = parseClientRequestId(body?.clientRequestId);

  try {
    const res = await serverMarketingClient().POST<RawVideoFinal>(versionedPath(auth.version, '/video-finals'), {
      organizationId: auth.orgId,
      ownerUserId: auth.userId,
      sourceId,
      setId,
      ...(clientRequestId ? { clientRequestId } : {}),
    });
    return ok(withVideoFinalUrls(res.data));
  } catch (error) {
    return mapMarketingError(error, '세트 적용에 실패했습니다.');
  }
}

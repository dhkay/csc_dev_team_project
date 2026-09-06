// 이미지 엔진 부하 BFF: csc-marketing `/plans/image-engine-load` 중계(서비스토큰 자동 주입)
// GET: 자체 모델이면 { running, pending }(공유 GPU 큐), 외부 벤더면 null(큐 없음)
//   생성 게이트(requireOrgUser)와 같은 접근 조건: 부하 표시는 생성 흐름의 일부다.
//   채널을 받지 않는다: 부하는 그 사람이 고른 이미지 모델의 엔진에 달렸고 채널과 무관하다.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { mapMarketingError, requireOrgUserVersion, versionedPath } from '$lib/server/marketing/bff';

/** 자체 모델일 때의 공유 큐 현황. 외부 벤더는 body 자체가 null. */
interface EngineLoad {
  running: number;
  pending: number;
}

/** 이미지 엔진 부하 조회: GET /api/marketing/plans/image-engine-load */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  try {
    // 외부 벤더면 csc-marketing 이 null 을 준다. 그대로 전달(화면이 "큐 없음"으로 해석)
    const res = await serverMarketingClient().GET<EngineLoad | null>(
      versionedPath(auth.version, `/plans/image-engine-load?organizationId=${auth.orgId}&ownerUserId=${auth.userId}`),
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '이미지 엔진 부하를 불러오지 못했습니다.');
  }
}

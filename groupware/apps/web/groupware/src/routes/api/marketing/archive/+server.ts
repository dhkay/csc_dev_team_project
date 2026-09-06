// 보관함 목록 BFF: 그 버전의 보관물 자원으로 중계(서비스토큰 자동 주입)
//
// 보관함은 조직 공용이다: 누가 만든 것이든 그 조직의 보관물이면 모두 보인다. 그래서 개인 축
// (ownerUserId, channelId)을 보내지 않는다. 채널로 나누지 않는 이유는 채널이 개인 소유라
// 남의 채널 id 로는 아무도 걸러낼 수 없기 때문이다(채널로 묶으면 "공용" 이 성립하지 않는다)
// 버전은 나른다: 산출물은 만든 버전의 것이고, 어느 표에서 오는지도 버전이 정한다(archiveTarget)
// 응답의 ownerUserId 가 만든 사람이고, 화면이 조직 멤버 명부로 이름을 붙인다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok } from '$lib/server/http/bff';
import { mapMarketingError, requireOrgUserVersion, versionedPath } from '$lib/server/marketing/bff';
import { archiveTarget } from '$lib/server/marketing/archiveTarget';

/** 보관함 목록: GET /api/marketing/archive (조직 공용이라 채널 파라미터가 없다) */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const target = archiveTarget(auth.version);
  try {
    const res = await serverMarketingClient().GET<Record<string, unknown>[]>(
      versionedPath(auth.version, `/${target.resource}/archive?organizationId=${auth.orgId}`),
    );
    return ok((res.data ?? []).map(target.withUrls));
  } catch (error) {
    return mapMarketingError(error, '보관함을 불러오지 못했습니다.');
  }
}

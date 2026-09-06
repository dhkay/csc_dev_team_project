// 보관 항목 BFF: 보내기(POST) / 영구 삭제(DELETE)
//
// 자원은 "그 영상의 보관 항목" 이다. POST 가 그것을 만들고(작업 공간 → 보관함) DELETE 가 없앤다.
// (되돌릴 수 없음). 되돌리기는 삭제가 아니라 이동이라 별도 경로다(`./restore`)
//
// 어느 표를 고치는지는 버전이 정한다(archiveTarget). 원천과 최종을 나누지 않는 버전에서는 그
// 하나뿐인 영상이 곧 배포본이라 원천 표가 보관물을 갖는다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, parseIdParam } from '$lib/server/http/bff';
import {
  isToolManager,
  mapMarketingError,
  requireOrgUserVersion,
  versionedPath,
} from '$lib/server/marketing/bff';
import { archiveTarget } from '$lib/server/marketing/archiveTarget';

/**
 * 보관함 보내기: POST /api/marketing/archive/:id (내 작업 공간 → 보관함)
 *
 * 경계는 소유다: 내 항목만 보낼 수 있고 백엔드가 ownerUserId 로 검증한다. 완성되지 않았거나
 * 작업 공간에 배치되지 않은 영상은 백엔드가 400 으로 막는다.
 */
export async function POST(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const id = parseIdParam(event.params.id);
  if (!id) return fail('잘못된 요청입니다.', { status: 400 });

  const target = archiveTarget(auth.version);
  try {
    const res = await serverMarketingClient().POST<Record<string, unknown>>(
      versionedPath(auth.version, `/${target.resource}/${id}/archive`),
      { organizationId: auth.orgId, ownerUserId: auth.userId },
    );
    return ok(target.withUrls(res.data));
  } catch (error) {
    return mapMarketingError(error, '보관함 보내기에 실패했습니다.');
  }
}

/**
 * 보관 항목 영구 삭제: DELETE /api/marketing/archive/:id (멱등)
 *
 * 작업 공간 삭제와 대상과 권한이 다르다. 이 경로는 보관 중인 항목만 지우고(백엔드가 한정한다),
 * 만든 사람 외에 관리급(대표/팀장) 도 지울 수 있다. 공용 공간은 누군가 정리해야 하고, 만든
 * 사람만 지울 수 있으면 그 사람이 조직을 떠난 뒤 아무도 손댈 수 없는 항목이 남는다.
 *   판정은 여기서 한다(`isToolManager`: 세션의 직책을 보는 곳이 BFF 다). 백엔드는 그 결과를 값으로
 *   받아 질의를 고른다. 빠뜨리면 소유자 경로로 동작한다(넓은 쪽이 기본값이 되지 않게)
 */
export async function DELETE(event: RequestEvent) {
  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const id = parseIdParam(event.params.id);
  if (!id) return fail('잘못된 요청입니다.', { status: 400 });

  // 관리급이면 소유와 무관하게 지운다. 아니면 자기 것만(백엔드가 소유 질의로 거른다)
  const manageAll = await isToolManager(event);

  const target = archiveTarget(auth.version);
  try {
    await serverMarketingClient().DELETE(
      versionedPath(
        auth.version,
        `/${target.resource}/${id}/archived?organizationId=${auth.orgId}&ownerUserId=${auth.userId}` +
          (manageAll ? '&manageAll=true' : ''),
      ),
    );
    return ok();
  } catch (error) {
    return mapMarketingError(error, '보관함 항목 삭제에 실패했습니다.');
  }
}

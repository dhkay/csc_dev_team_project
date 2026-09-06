// 진입 기본 버전 기록(브라우저). BFF(/api/marketing/my/entry-version) frontClient 호출
// 대상 유저는 BFF 가 세션에서 정한다(요청에 담지 않는다)
//
// "지금 보는 버전" 을 바꾸는 것이 아니다. 그건 주소가 정한다(버전 전환 = URL 이동)
// 이 값은 다음에 도구를 열 때 어디로 갈지의 힌트뿐이라, 낡아도 산출물이 섞이지 않는다.
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { run, type ApiResult } from './result';

export function setMyEntryVersion(
  version: VersionMode,
): Promise<ApiResult<{ version: VersionMode }>> {
  return run<{ version: VersionMode }>(() =>
    frontClient().PUT(ROUTES.MARKETING.MY_ENTRY_VERSION, { version }),
  );
}

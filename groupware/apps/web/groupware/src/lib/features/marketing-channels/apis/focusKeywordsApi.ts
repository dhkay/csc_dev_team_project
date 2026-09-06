// 포커스 키워드 후보 검색(브라우저): BFF(/api/marketing/channels/:channelId/keyword-suggestions) 호출
// 저장 경로는 없다. 고른 키워드는 기획서 생성 요청에 실려 가고 그때뿐이다.
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { run, type ApiResult } from './result';
import { versionQuery } from './versionQuery';
import type { FocusKeywordCandidate } from '../types';

/**
 * 주제 한 줄로 검색 키워드 후보 받기(저장하지 않는다)
 *
 * 서버가 수집을 먼저 하고 모자란 만큼만 LLM 으로 채우므로 응답이 몇 초 걸린다. 후보마다 출처
 * 라벨이 붙어 오고, 화면은 그 라벨로 실측과 추정을 구분해 보여준다.
 */
export function suggestKeywords(
  version: VersionMode,
  channelId: number,
  seed: string,
): Promise<ApiResult<FocusKeywordCandidate[]>> {
  return run<FocusKeywordCandidate[]>(() =>
    frontClient().POST(
      `${ROUTES.MARKETING.CHANNELS}/${channelId}/keyword-suggestions?${versionQuery(version)}`,
      { seed },
    ),
  );
}

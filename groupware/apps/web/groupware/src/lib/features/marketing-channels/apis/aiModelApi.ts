// 개인 AI 모델 선택 데이터 접근(브라우저)
// BFF(/api/marketing/my/ai-model) frontClient 호출. 값 = 역량별 모델 id 선택 객체
//
// 채널 id 를 받지 않는다: 이 선택은 채널이 아니라 고른 사람의 것이라 채널을 옮겨도 따라온다.
// 대상 유저는 BFF 가 세션에서 정한다(요청에 담지 않는다: 담으면 남의 선택을 덮어쓸 수 있다)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { AiModelSelection } from '../types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { run, type ApiResult } from './result';
import { versionQuery } from './versionQuery';

export function getMyAiModel(version: VersionMode): Promise<ApiResult<AiModelSelection>> {
  return run<AiModelSelection>(() =>
    frontClient().GET(`${ROUTES.MARKETING.MY_AI_MODEL}?${versionQuery(version)}`),
  );
}

export function setMyAiModel(
  version: VersionMode,
  selection: AiModelSelection,
): Promise<ApiResult<AiModelSelection>> {
  return run<AiModelSelection>(() =>
    frontClient().PUT(`${ROUTES.MARKETING.MY_AI_MODEL}?${versionQuery(version)}`, selection),
  );
}

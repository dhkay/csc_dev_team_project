// 최종 영상 데이터 접근(브라우저): 개인 워크스페이스 목록/생성/조회/재렌더/삭제
// 모두 같은 origin BFF(/api/marketing/video-finals)를 frontClient 로 호출(백엔드 직접 호출 금지)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { VideoFinal } from '../types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { run, type ApiResult } from './result';
import { scopeQuery, versionQuery } from './versionQuery';

/** 내 최종 영상 목록(최신순, 렌더 상태 포함) */
/** 개인 워크스페이스 최종 목록: 워크스페이스는 채널별로 분리되므로 channelId 가 필수다. */
export function listVideoFinals(
  version: VersionMode,
  channelId: number,
): Promise<ApiResult<VideoFinal[]>> {
  return run<VideoFinal[]>(() =>
    frontClient().GET(`${ROUTES.MARKETING.VIDEO_FINALS}?${scopeQuery(version, channelId)}`),
  );
}

/** 완성된 원천 영상 + 세트로 최종 합성 잡 등록 */
export function createVideoFinal(
  version: VersionMode,
  input: {
    sourceId: number;
    setId: number;
    // 멱등키: 이 클릭 한 번을 식별한다. 재시도가 같은 값을 보내면 렌더 잡이 두 번 만들어지지 않는다.
    clientRequestId?: string;
  },
): Promise<ApiResult<VideoFinal>> {
  return run<VideoFinal>(() =>
    frontClient().POST(`${ROUTES.MARKETING.VIDEO_FINALS}?${versionQuery(version)}`, input),
  );
}

/** 저장된 세트 스냅샷 + 원천으로 새 FINALIZE 잡 등록(재렌더) */
export function rerenderVideoFinal(
  version: VersionMode,
  id: number,
): Promise<ApiResult<VideoFinal>> {
  return run<VideoFinal>(() =>
    frontClient().POST(`${ROUTES.MARKETING.VIDEO_FINALS}/${id}/render?${versionQuery(version)}`, {}),
  );
}

/** 내 최종 영상 삭제(멱등) */
export function deleteVideoFinal(version: VersionMode, id: number): Promise<ApiResult<void>> {
  return run<void>(() =>
    frontClient().DELETE(`${ROUTES.MARKETING.VIDEO_FINALS}/${id}?${versionQuery(version)}`),
  );
}

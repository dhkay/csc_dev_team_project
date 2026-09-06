// 보관함 데이터 접근(브라우저): 조직 공용 목록 + 보내기/꺼내기/영구삭제
// 모두 같은 origin BFF 를 frontClient 로 호출(백엔드 직접 호출 금지). 경계는 백엔드가 정한다.
//   목록: 조직 공용(채널 파라미터 없음). 보내기: 내 작업 공간 항목만
//   꺼내기: 누구 것이든 가능하고 꺼낸 사람 작업 공간으로 들어온다 → 대상 채널을 보낸다.
//   삭제: 만든 사람 또는 관리급(대표/팀장). 화면의 비활성화는 편의다.
//
// 어느 산출물 표가 보관물을 갖는지는 여기서 정하지 않는다. 버전만 실어 보내고 BFF 가 그 판정을
// 한다(archiveTarget). 그래서 이 파일에 '최종' 도 '원천' 도 나오지 않는다: 화면 하나가 그 버전의
// 배포본을 다룬다는 것만 표현하면 된다.
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { ArchivedVideo, VideoCard } from '../types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { run, type ApiResult } from './result';
import { scopeQuery, versionQuery } from './versionQuery';

/** 보관함 목록(최신순): 조직 공용이라 버전만 나른다. */
export function listArchivedVideos(version: VersionMode): Promise<ApiResult<ArchivedVideo[]>> {
  return run<ArchivedVideo[]>(() =>
    frontClient().GET(`${ROUTES.MARKETING.ARCHIVE}?${versionQuery(version)}`),
  );
}

/** 보관함 보내기(내 작업 공간 → 보관함, 이동) */
export function archiveVideo(version: VersionMode, id: number): Promise<ApiResult<VideoCard>> {
  return run<VideoCard>(() =>
    frontClient().POST(`${ROUTES.MARKETING.ARCHIVE}/${id}?${versionQuery(version)}`, {}),
  );
}

/**
 * 보관함 꺼내기(보관함 → 꺼낸 사람의 작업 공간). 누가 만든 것이든 꺼낼 수 있다.
 *
 * channelId 를 보내는 이유: 꺼낸 항목이 들어갈 작업 공간을 정해야 한다(작업자 × 채널)
 * 안 보내면 남이 만든 항목이 그 사람의 채널에 남아 꺼낸 사람 눈에는 사라진 것처럼 보인다.
 *
 * 삭제가 아니라 POST 인 이유: 원본이 사라지지 않고 위치만 바뀐다.
 */
export function unarchiveVideo(
  version: VersionMode,
  id: number,
  channelId: number,
): Promise<ApiResult<VideoCard>> {
  return run<VideoCard>(() =>
    frontClient().POST(
      `${ROUTES.MARKETING.ARCHIVE}/${id}/restore?${scopeQuery(version, channelId)}`,
      {},
    ),
  );
}

/** 보관 항목 영구 삭제(멱등): 만든 사람 또는 관리급. 판정은 BFF 와 백엔드가 한다. */
export function deleteArchivedVideo(version: VersionMode, id: number): Promise<ApiResult<void>> {
  return run<void>(() =>
    frontClient().DELETE(`${ROUTES.MARKETING.ARCHIVE}/${id}?${versionQuery(version)}`),
  );
}

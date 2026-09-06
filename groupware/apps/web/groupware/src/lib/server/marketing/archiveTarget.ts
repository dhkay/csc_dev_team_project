// 보관함의 저장소를 정하는 한 자리
//
// 보관함은 화면 하나다(`/[channelSlug]/archive`). 버전마다 따로 있지 않고, 갈리는 것은 그 안에
// 무엇이 들어가는가다. 원천과 최종을 나누는 버전에서는 세트를 입힌 배포본(최종 영상)이 담기고,
// 나누지 않는 버전에서는 그 하나뿐인 구역의 영상이 곧 배포본이라 그것이 담긴다.
//
// 이 판정을 BFF 에 두는 이유: 브라우저와 백엔드 어느 쪽에도 두고 싶지 않은 지식이다. 브라우저에
// 두면 화면이 어느 표를 고칠지 정하게 되고, 백엔드에 두면 두 도메인 중 하나가 남의 표를 알아야
// 한다. 버전을 아는 것은 주소를 해석하는 이 계층이라, 여기서 자원 이름으로 한 번 바꾼다.
//
// 그래서 브라우저는 버전만 실어 `/api/marketing/archive` 를 부르고, 아래 표가 그 요청을
// csc-marketing 의 어느 자원으로 보낼지와 응답의 uploadId 를 어떻게 주소로 바꿀지를 함께 정한다.
// (표마다 카드 그림을 찾는 규칙이 다르다: 최종은 붙은 썸네일뿐이고, 원천은 없으면 첫 씬 이미지다)
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { versionProfile } from '$lib/pages/tools/marketing-video/versionProfile';
import { withVideoFinalUrls, type RawVideoFinal } from './videoFinalUrls';
import { withVideoProjectUrls, type RawVideoProject } from './videoProjectUrls';

/** 백엔드 보관물(raw): 두 표의 공통 관심사만. 나머지는 그대로 통과한다. */
type RawArchived = RawVideoFinal & RawVideoProject;

export interface ArchiveTarget {
  // csc-marketing 의 자원 경로 조각(버전 세그먼트 뒤에 붙는다)
  readonly resource: 'video-finals' | 'video-projects';
  // uploadId → 브라우저 접근 URL 재구성
  readonly withUrls: (row: RawArchived) => Record<string, unknown>;
}

const TARGETS: Record<'final' | 'source', ArchiveTarget> = {
  final: {
    resource: 'video-finals',
    withUrls: (row) => withVideoFinalUrls(row),
  },
  source: {
    resource: 'video-projects',
    withUrls: (row) => withVideoProjectUrls(row),
  },
};

/** 그 버전의 보관물이 어느 자원에 있는가. 판정 근거는 `versionProfile.archiveSource` 다 */
export function archiveTarget(version: VersionMode): ArchiveTarget {
  return TARGETS[versionProfile(version).archiveSource];
}

/**
 * 오디오 에셋 스냅샷(선택 시점): 기획안 생성부터 렌더까지 공유하는 커널
 * uploadId 를 선택 시점에 박아 이후 단계가 조회 없이 넘기고, assetId 는 카탈로그 추적과 UI 배지용
 */
export interface AudioAssetRef {
  assetId: number;
  uploadId: string;
  name: string;
}

/**
 * 씬 효과음 1개: 오디오 스냅샷 + 부호 있는 씬 시작 기준 재생 오프셋(초)
 *
 * 효과음은 씬에 매인 요소가 아니라 타임라인 큐. offsetSec 음수면 그 씬으로 들어가는 전환에 걸쳐 재생
 * 씬 기준 상대값이라 스튜디오가 씬 길이를 바꿔도 위치가 깨지지 않음
 */
export interface SceneSfxRef extends AudioAssetRef {
  offsetSec: number;
}

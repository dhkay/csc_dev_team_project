import type { SetOverlayStyles } from '../../../../../shared/domain/overlay';

/**
 * 에셋 세트: 배경프레임 + 아웃트로 + 구역별 오버레이 스타일(제목/자막)을 한 세트로 묶은 자기완결 단위
 * 프레임/아웃트로 바이트를 file-upload uploadId 로 직접 소유(없으면 null). 접근 URL 은 소비자(BFF)가 재구성
 * 오버레이는 세트를 적용해 최종 영상을 만들 때 그 스타일로 번인된다(제목 텍스트는 원천 영상 제목)
 * 이름으로 식별(별도 태그/설명 없음. 사용자가 영상 제작 시 수동 선택)
 */
export interface AssetSetEntity {
  id: number;
  name: string;
  scope: string;
  // scope='organization' 이면 소유 조직 id. common/pack 은 null.
  organizationId: number | null;
  // scope='pack' 이면 소속 팩 id. 그 외 null.
  packId: number | null;
  sortOrder: number;
  // 배경프레임(이미지) file-upload uploadId: 없으면 null.
  frameUploadId: string | null;
  // 아웃트로(mp4) file-upload uploadId: 없으면 null.
  outroUploadId: string | null;
  // 구역별 오버레이 스타일(제목/자막 각 배경색+폰트): 미설정(구 세트)이면 null → 최종 생성 시 기본값
  overlays: SetOverlayStyles | null;
}

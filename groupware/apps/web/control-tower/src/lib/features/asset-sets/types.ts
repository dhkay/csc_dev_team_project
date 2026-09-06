// 에셋 세트 타입: 백엔드 csc-marketing asset-sets 응답 + SSR URL 재구성
//   세트 = 배경프레임(이미지) + 아웃트로(mp4) 두 슬롯을 자기완결 소유(별도 풀 참조 없음)
//   사용자가 영상 제작 마지막에 세트를 수동 선택 → 별도 태그/라벨 없음

/** 세트 슬롯(역할): 배경프레임 + 아웃트로. UI 가 이 순서로 슬롯 행을 렌더 */
export const SET_SLOTS = ['frame', 'outro'] as const;
export type SetSlot = (typeof SET_SLOTS)[number];

/** 슬롯별 표시/업로드 메타(라벨, accept, 종류, 상한) */
export interface SetSlotMeta {
  label: string;
  accept: string;
  kind: 'image' | 'video';
  maxBytes: number;
  desc: string;
}

const IMAGE_MAX = 10 * 1024 * 1024; // 이미지 10MB
const VIDEO_MAX = 50 * 1024 * 1024; // 영상 50MB(file-upload 상한)

export const SET_SLOT_META: Record<SetSlot, SetSlotMeta> = {
  frame: { label: '배경프레임', accept: 'image/*', kind: 'image', maxBytes: IMAGE_MAX, desc: '영상 배경 프레임으로 쓰는 이미지.' },
  outro: { label: '아웃트로', accept: 'video/*', kind: 'video', maxBytes: VIDEO_MAX, desc: '영상 뒤에 붙는 마무리 클립(mp4).' },
};

// 구역별 오버레이 스타일(제목/자막): 세트를 적용해 최종 영상을 만들 때 그 스타일로 번인
//   세트 편집 UI 는 배경색(band.color)+폰트(fontUploadId)만 노출. csc-marketing overlay 커널과 동형

/**
 * 구역 뒷배경 직사각형(밴드): 텍스트를 감싸는 상자가 아니라 구역 뒤에 깔리는 직사각형
 * 기하(x/y/폭/높이 %)는 완성 영상에서 리사이즈. 세트 편집은 색만 지정하고 기하는 렌더러 기본을 쓴다.
 * null 이면 배경 없음(외곽선)
 */
export interface OverlayBand {
  color?: string;
  opacityPct?: number;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  heightPct?: number;
}
/** 구역 텍스트 오버레이 스타일 */
export interface TextOverlayStyle {
  fontUploadId?: string | null;
  fontKey?: string;
  sizePct?: number;
  color?: string;
  band?: OverlayBand | null;
}
/** 세트 구역별 오버레이 스타일(제목/자막) */
export interface SetOverlays {
  title: TextOverlayStyle;
  subtitle: TextOverlayStyle;
}

/** 세트(백엔드 `/asset-sets` 응답 1건): 슬롯 uploadId 직접 소유(접근 URL 은 미포함) */
export interface AssetSetRecord {
  id: number;
  name: string;
  sortOrder: number;
  frameUploadId: string | null;
  outroUploadId: string | null;
  overlays: SetOverlays | null;
}

/** SSR 결과: 슬롯 uploadId 를 접근 URL(/files/{uploadId})로 재구성 */
export interface AssetSet {
  id: number;
  name: string;
  sortOrder: number;
  frameUrl: string | null;
  outroUrl: string | null;
  overlays: SetOverlays | null;
}

export interface CreateAssetSetInput {
  name: string;
  overlays?: SetOverlays | null;
}
export interface UpdateAssetSetInput {
  name?: string;
  overlays?: SetOverlays | null;
}

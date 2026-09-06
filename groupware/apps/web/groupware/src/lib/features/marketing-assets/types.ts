// 마케팅영상 조직 자산 타입: 백엔드 csc-marketing common-assets/asset-sets 와 convention-sync.
//   에셋 화면(그룹웨어)은 플랫폼 공통(scope='common', 읽기전용) + 조직(scope='organization', ROOT/대표/팀장 편집)을 함께 다룬다.
//   AI 자동 삽입 풀(샘플이미지/BGM/효과음) + 세트(프레임+아웃트로, 사람이 영상 제작 시 선택)

/** 미리보기/업로드 종류: 이미지/오디오/영상/폰트(글꼴 미리보기) */
export type AssetKind = 'image' | 'audio' | 'video' | 'font';

// 풀 카테고리(AI 자동 삽입 + 폰트)
export const MARKETING_ASSET_CATEGORIES = ['SAMPLE_IMAGE', 'BGM', 'SFX', 'FONT'] as const;
export type MarketingAssetCategory = (typeof MARKETING_ASSET_CATEGORIES)[number];

export function isMarketingAssetCategory(value: unknown): value is MarketingAssetCategory {
  return (
    typeof value === 'string' &&
    (MARKETING_ASSET_CATEGORIES as readonly string[]).includes(value)
  );
}

// 태그 카탈로그(축/태그): 백엔드 asset-catalog 가 SSOT
//   축, 태그는 DB 카탈로그(플랫폼 런타임 편집). 프론트는 SSR 로 받아 렌더만 한다(구 프론트 상수 SSOT 폐기)
/** 태그 값(카탈로그): csc-marketing `/asset-catalog/axes` 응답의 tags[]. scope 로 공통/조직 구분 */
export interface AssetTagView {
  id: number;
  axisId: number;
  scope: string; // 'common' | 'organization'
  organizationId: number | null;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}
/** 태그 축(카탈로그) + 소속 태그. scope='common'(플랫폼, 조직엔 읽기전용) | 'organization'(우리 조직 편집 가능) */
export interface AssetAxisView {
  id: number;
  scope: string;
  organizationId: number | null;
  category: string;
  key: string;
  label: string;
  hint: string;
  sortOrder: number;
  isActive: boolean;
  tags: AssetTagView[];
}

/** 자산에 붙은 태그 1개(조회 shape): 카탈로그 조인 결과(백엔드 CommonAssetTag 와 동형). scope 로 목록 칩에서 공통/우리 조직 구분 */
export interface AssetTagRef {
  tagId: number;
  axisKey: string;
  value: string;
  label: string;
  scope: 'common' | 'organization';
}

/** 신뢰 못 할 값이 정수 id 배열인지 얕게 검사 후 정규화(BFF 통과 게이트). 아니면 undefined. */
export function toTagIds(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.filter((n): n is number => Number.isInteger(n) && n > 0);
  return ids;
}

export interface AssetCategoryMeta {
  label: string;
  accept: string;
  kind: AssetKind;
  maxBytes: number;
  desc: string;
}

const IMAGE_MAX = 10 * 1024 * 1024; // 이미지 10MB
const MEDIA_MAX = 50 * 1024 * 1024; // 오디오/영상 50MB(file-upload 상한)
const FONT_MAX = 20 * 1024 * 1024; // 폰트 20MB(CJK TTF/OTF 대비)

export const MARKETING_ASSET_CATEGORY_META: Record<MarketingAssetCategory, AssetCategoryMeta> = {
  SAMPLE_IMAGE: { label: '샘플이미지', accept: 'image/*', kind: 'image', maxBytes: IMAGE_MAX, desc: '씬 참고용 샘플 이미지. AI 가 자동 삽입.' },
  BGM: { label: 'BGM', accept: 'audio/*', kind: 'audio', maxBytes: MEDIA_MAX, desc: '영상 전체에 깔리는 배경음악. AI 가 자동 삽입.' },
  SFX: { label: '효과음', accept: 'audio/*', kind: 'audio', maxBytes: MEDIA_MAX, desc: '전환/포인트에 얹는 짧은 사운드. AI 가 자동 삽입.' },
  FONT: { label: '폰트', accept: '.ttf,.otf', kind: 'font', maxBytes: FONT_MAX, desc: '제목/자막에 쓰는 글꼴(TTF/OTF). 최종 영상에 번인.' },
};

// 세트 슬롯(사람이 선택)
export const SET_SLOTS = ['frame', 'outro'] as const;
export type SetSlot = (typeof SET_SLOTS)[number];

export function isSetSlot(value: unknown): value is SetSlot {
  return typeof value === 'string' && (SET_SLOTS as readonly string[]).includes(value);
}

export const SET_SLOT_META: Record<SetSlot, AssetCategoryMeta> = {
  frame: { label: '프레임', accept: 'image/*', kind: 'image', maxBytes: IMAGE_MAX, desc: '영상을 감싸는 이미지. 가운데를 비워 두면 그 자리에 영상이 들어갑니다.' },
  outro: { label: '아웃트로', accept: 'video/*', kind: 'video', maxBytes: MEDIA_MAX, desc: '영상 뒤에 붙는 마무리 클립(mp4).' },
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

// 뷰(SSR 로드 결과)
/** 공통 에셋 1건(뷰): scope 로 편집가능(조직)/읽기전용(공통) 판별 */
export interface CommonAssetView {
  id: number;
  category: string; // SAMPLE_IMAGE | BGM | SFX | FONT
  scope: string; // 'common' | 'organization' | 'pack'
  // file-upload uploadId: 세트 오버레이 폰트 선택값(fontUploadId)으로 사용
  uploadId: string;
  name: string;
  url: string;
  kind: AssetKind;
  // 카탈로그 태그(분위기/템포/장르/용도 등). 없으면 []
  tags: AssetTagRef[];
}

/** 세트 1건(뷰): 슬롯 uploadId 를 접근 URL 로 재구성 */
export interface AssetSetView {
  id: number;
  name: string;
  scope: string; // 'common' | 'organization'
  frameUrl: string | null;
  outroUrl: string | null;
  // 구역별 오버레이 스타일(제목/자막 배경색+폰트): 미설정이면 null.
  overlays: SetOverlays | null;
}

/** SSR 백엔드 응답 raw(스코프 포함) */
export interface CommonAssetRecord {
  id: number;
  category: string;
  scope: string;
  uploadId: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  sortOrder: number;
  // 백엔드 응답 태그(카탈로그 조인). 없을 수 있음. SSR 이 [] 로 보정
  tags?: AssetTagRef[];
}
export interface AssetSetRecord {
  id: number;
  name: string;
  scope: string;
  frameUploadId: string | null;
  outroUploadId: string | null;
  sortOrder: number;
  overlays: SetOverlays | null;
}

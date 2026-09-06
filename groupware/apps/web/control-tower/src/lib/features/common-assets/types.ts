// 공통 에셋(마케팅영상) 타입: 백엔드 csc-marketing CommonAssetCategory 와 convention-sync.
//   카테고리 추가 시 여기 + 백엔드 유니온 + groupware AssetsPanel 을 함께 수정한다.
//   AI 자동 삽입 풀만(샘플이미지/BGM/효과음). 배경프레임/아웃트로는 세트가 자기완결 소유(asset-sets)

// 탭 표시 순서 = 이 배열 순서. 샘플이미지 → BGM → 효과음 → 폰트
export const COMMON_ASSET_CATEGORIES = ['SAMPLE_IMAGE', 'BGM', 'SFX', 'FONT'] as const;
export type CommonAssetCategory = (typeof COMMON_ASSET_CATEGORIES)[number];

export function isCommonAssetCategory(value: unknown): value is CommonAssetCategory {
  return typeof value === 'string' && (COMMON_ASSET_CATEGORIES as readonly string[]).includes(value);
}

/** 미리보기/업로드 종류: 이미지(썸네일)/오디오(플레이어)/폰트(글꼴 미리보기). (영상은 세트 아웃트로 전용.) */
export type AssetKind = 'image' | 'audio' | 'font';

// 태그 카탈로그(축/태그): 백엔드 asset-catalog 가 SSOT
//   축, 태그는 DB 카탈로그(플랫폼 런타임 편집). 프론트는 SSR 로 받아 렌더/관리만 한다(구 프론트 상수 SSOT 폐기)
/** 태그 값(카탈로그). scope 로 공통/조직 구분 */
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
/** 태그 축(카탈로그) + 소속 태그 */
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
/** 자산에 붙은 태그 1개(조회 shape): 카탈로그 조인 결과. scope 로 목록 칩에서 공통/우리 조직 구분 */
export interface AssetTagRef {
  tagId: number;
  axisKey: string;
  value: string;
  label: string;
  scope: 'common' | 'organization';
}

/** 신뢰 못 할 값이 정수 id 배열인지 얕게 검사 후 정규화. 아니면 undefined. */
export function toTagIds(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((n): n is number => Number.isInteger(n) && n > 0);
}

/** 카테고리별 표시/업로드 메타(라벨, accept, 종류, 상한) */
export interface CommonAssetCategoryMeta {
  label: string;
  accept: string;
  kind: AssetKind;
  maxBytes: number;
  desc: string;
}

const IMAGE_MAX = 10 * 1024 * 1024; // 이미지 10MB
const MEDIA_MAX = 50 * 1024 * 1024; // 오디오/영상 50MB(file-upload 상한)
const FONT_MAX = 20 * 1024 * 1024; // 폰트 20MB(CJK TTF/OTF 대비)

export const COMMON_ASSET_CATEGORY_META: Record<CommonAssetCategory, CommonAssetCategoryMeta> = {
  SAMPLE_IMAGE: { label: '샘플이미지', accept: 'image/*', kind: 'image', maxBytes: IMAGE_MAX, desc: '씬 참고용 샘플 이미지. AI 가 자동 삽입.' },
  BGM: { label: 'BGM', accept: 'audio/*', kind: 'audio', maxBytes: MEDIA_MAX, desc: '영상 전체에 깔리는 배경음악. AI 가 자동 삽입.' },
  SFX: { label: '효과음', accept: 'audio/*', kind: 'audio', maxBytes: MEDIA_MAX, desc: '전환/포인트에 얹는 짧은 사운드. AI 가 자동 삽입.' },
  FONT: { label: '폰트', accept: '.ttf,.otf', kind: 'font', maxBytes: FONT_MAX, desc: '제목/자막에 쓰는 글꼴(TTF/OTF). 최종 영상에 번인.' },
};

/** csc-marketing `/common-assets` 응답 1건(접근 URL 은 미포함. SSR 이 재구성) */
export interface CommonAssetRecord {
  id: number;
  category: CommonAssetCategory;
  uploadId: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  sortOrder: number;
  // 카탈로그 태그(조인). 없을 수 있음. SSR 이 [] 로 보정
  tags?: AssetTagRef[];
}

/** SSR 로드 결과: record + BFF 가 재구성한 접근 URL(/files/{uploadId}) */
export interface CommonAsset extends CommonAssetRecord {
  accessUrl: string;
}

/** 등록 입력(메타): file-upload 업로드 완료 후 */
export interface CreateCommonAssetInput {
  category: CommonAssetCategory;
  uploadId: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  tagIds?: number[];
}

/** 수정 입력: 표시명 + (선택)태그 id 목록 */
export interface UpdateCommonAssetInput {
  name?: string;
  tagIds?: number[];
}

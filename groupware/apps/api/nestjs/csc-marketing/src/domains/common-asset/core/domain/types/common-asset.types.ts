/**
 * 공통 에셋 카테고리(AI 자동 삽입 풀 + 폰트) 코드 SSOT
 * varchar 저장이라 카테고리 추가는 마이그레이션 없이 유니온과 프론트 상수만 맞추면 됨
 * 배경프레임과 아웃트로는 풀이 아니라 세트가 자기완결로 소유(asset-set 도메인)
 */
export const COMMON_ASSET_CATEGORIES = [
  'SAMPLE_IMAGE',
  'BGM',
  'SFX',
  'FONT',
] as const;

export type CommonAssetCategory = (typeof COMMON_ASSET_CATEGORIES)[number];

/**
 * 자산에 붙은 태그 1개(조회 shape): 카탈로그(marketing_asset_tags + axes) 조인 결과
 *   axisKey 는 그룹핑용(분위기/템포/…), value 는 매칭 안정값, label 은 표시명
 *   scope 는 태그 출처(공통 카탈로그 vs 우리 조직): 목록 칩에서 어떤 게 공통인지 구분
 *   쓰기는 tagId 목록으로 받고, 읽기는 이 shape 로 돌려준다.
 */
export interface CommonAssetTag {
  tagId: number;
  axisKey: string;
  value: string;
  label: string;
  scope: 'common' | 'organization';
}

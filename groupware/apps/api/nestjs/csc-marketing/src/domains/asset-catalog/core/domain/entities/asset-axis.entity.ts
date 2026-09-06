/**
 * 태그 축: 자산 카테고리(BGM/효과음 등)별 태그 분류축(분위기/템포/장르/용도, 유형 …)
 * scope='common'(플랫폼 전역) | 'organization'(조직 전용, 그 조직만 노출/편집). category 는 CommonAssetCategory 와 1:1.
 */
export interface AssetAxisEntity {
  id: number;
  scope: string;
  // scope='organization' 이면 소유 조직 id. common 은 null.
  organizationId: number | null;
  category: string;
  key: string;
  label: string;
  hint: string;
  sortOrder: number;
  isActive: boolean;
}

import { CommonAssetCategory, CommonAssetTag } from '../types';

/**
 * 공통 에셋 1행: 재사용 미디어(샘플이미지/BGM/효과음). 접근 URL 은 uploadId 로 조회 시 재구성
 * scope='common'(플랫폼 전역) | 'organization'(조직 소유) | 'pack'(플러그인 팩, 활성화 조직만). 소비자는 scope 로 편집가능 여부를 판단한다.
 */
export interface CommonAssetEntity {
  id: number;
  category: CommonAssetCategory;
  scope: string;
  // scope='organization' 이면 소유 조직 id. common/pack 은 null.
  organizationId: number | null;
  // scope='pack' 이면 소속 팩 id. 그 외 null.
  packId: number | null;
  uploadId: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  sortOrder: number;
  // 카탈로그 태그(분위기/템포/장르/용도 등). 관계형 태깅 조인 결과. 없으면 []
  tags: CommonAssetTag[];
}

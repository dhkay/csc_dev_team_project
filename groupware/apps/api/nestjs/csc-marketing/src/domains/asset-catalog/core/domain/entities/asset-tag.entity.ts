import { AssetAxisEntity } from './asset-axis.entity';

/**
 * 태그 값: 한 축의 통제 어휘(선택지). value=저장/매칭 안정값, label=표시명
 * scope='common'(플랫폼) | 'organization'(조직 전용). 조직 태그는 공통 축 또는 자기 조직 축 아래에 붙는다.
 */
export interface AssetTagEntity {
  id: number;
  axisId: number;
  scope: string;
  // scope='organization' 이면 소유 조직 id. common 은 null.
  organizationId: number | null;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

/** 축 + 소속 태그(조회 트리): 태깅 UI/관리 UI 가 소비 */
export interface AxisWithTags extends AssetAxisEntity {
  tags: AssetTagEntity[];
}

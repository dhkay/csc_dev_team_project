/**
 * 지표 성격 카탈로그(SSOT): 서버 모니터링 게이지와 모달과 차트가 공유한다.
 *
 * 성격이 다른 두 %를 같은 게이지로 그리면(GPU 가동률 90% ↔ VRAM 사용률 90%) 가동률 90% 가
 * 포화로 오해된다. 그래서 kind 로 시각화와 용어와 임계색을 분기한다.
 *
 *  - utilization: 가동률. 장치가 일한 시간의 비율이고 추론 중엔 90~100% 가 정상이라 위험색이 없다.
 *  - capacity   : 사용률. 전체 용량 대비 사용량이라 100% 에 가까울수록 여유가 없어 경고색을 쓴다.
 *
 * 새 리소스 추가는 아래 RESOURCE_META 에 한 줄이면 게이지와 모달과 차트가 따라온다.
 */
import type { ResourceKey } from './types';

export type MetricKind = 'utilization' | 'capacity';

export interface ResourceMeta {
  label: string;
  kind: MetricKind;
  // 시리즈 식별색(브랜드-중립). 게이지 기본색 + 라인차트 시리즈색으로 공유
  color: string;
}

export const RESOURCE_META: Record<ResourceKey, ResourceMeta> = {
  cpu: { label: 'CPU', kind: 'utilization', color: '#3b82f6' }, // 파랑
  ram: { label: 'RAM', kind: 'capacity', color: '#8b5cf6' }, // 보라
  disk: { label: 'Disk', kind: 'capacity', color: '#64748b' }, // 슬레이트
  gpu: { label: 'GPU', kind: 'utilization', color: '#10b981' }, // 초록
  vram: { label: 'VRAM', kind: 'capacity', color: '#f59e0b' }, // 주황
};

/** kind 별 표시 용어 + 오해 방지 설명(모달 캡션) */
export const METRIC_TERM: Record<MetricKind, { rate: string; hint: string }> = {
  utilization: {
    rate: '가동률',
    hint: '가동률은 장치가 일한 시간의 비율입니다. 100%에 가까워도 과부하가 아니며, 실제 여유는 용량(메모리), 대기로 판단하세요.',
  },
  capacity: {
    rate: '사용률',
    hint: '사용률은 전체 용량 대비 사용량입니다. 100%에 가까울수록 여유가 없습니다.',
  },
};

// 인포그래픽(정보 정리형 씬) 앱 공유 커널. channel(생성)과 saved-plan(영속)이 똑같이 다뤄 shared 에 둠
// 구조화 데이터가 SSOT 라 정적 이미지 렌더와 후속 애니메이션이 이 데이터를 공유
// 새 형태 추가 시 고칠 곳: 여기(인터페이스 + 유니온 + InfographicType),
//   prompt/v10/system.ts 의 INFOGRAPHIC_TYPE_SCHEMAS, plan-generator/v10/scene.ts 의 파서 case,
//   web infographicImage.ts 의 BODY_RENDERERS 와 web types(앱이 달라 wire 계약으로 분리)

/** 인포그래픽 형태 판별자 */
export type InfographicType =
  | 'list'
  | 'table'
  | 'bar'
  | 'comparison'
  | 'steps'
  | 'stat'
  | 'timeline';

/** 목록: 불릿과 번호 항목 */
export interface ListInfographic {
  type: 'list';
  title: string;
  items: string[];
}
/** 표: 헤더 컬럼 + 행 */
export interface TableInfographic {
  type: 'table';
  title: string;
  columns: string[];
  rows: string[][];
}
/** 막대그래프: 라벨 + 값(수평 막대) */
export interface BarInfographic {
  type: 'bar';
  title: string;
  unit?: string;
  bars: { label: string; value: number }[];
}
/** 비교: 좌우 2열(각 heading + 요점) */
export interface ComparisonInfographic {
  type: 'comparison';
  title: string;
  left: { heading: string; points: string[] };
  right: { heading: string; points: string[] };
}
/** 단계: 순서 있는 스텝 */
export interface StepsInfographic {
  type: 'steps';
  title: string;
  steps: string[];
}
/** 핵심지표: 큰 값 + 라벨(KPI) */
export interface StatInfographic {
  type: 'stat';
  title: string;
  stats: { value: string; label: string }[];
}
/** 타임라인: 시점 + 라벨 */
export interface TimelineInfographic {
  type: 'timeline';
  title: string;
  events: { time: string; label: string }[];
}

/** 다형 유니온(type 판별). 해당 씬이 인포그래픽 씬일 때만 */
export type Infographic =
  | ListInfographic
  | TableInfographic
  | BarInfographic
  | ComparisonInfographic
  | StepsInfographic
  | StatInfographic
  | TimelineInfographic;

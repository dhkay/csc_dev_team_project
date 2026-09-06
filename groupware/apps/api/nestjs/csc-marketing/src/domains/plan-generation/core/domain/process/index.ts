/**
 * 프로세스 뷰: 어휘(types) + 노드 변환(segment-nodes) + 뷰 컨텍스트 + 공유 키워드 단계 + 버전별 view
 * 배선은 모듈의 PLAN_PROCESS_VIEWS 가 하고 새 버전은 폴더 하나 + 그 표 한 줄
 */
export * from './types';
export { PLAN_PROCESS_VIEW_V10 } from './v10/view';
export { PLAN_PROCESS_VIEW_V15 } from './v15/view';

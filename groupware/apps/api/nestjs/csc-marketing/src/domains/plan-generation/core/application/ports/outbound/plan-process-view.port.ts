import type { BuildProcessViewInput, ProcessView } from '../../../domain';

/**
 * 버전별 프로세스 뷰 빌더(파이프라인 이음새). 새 버전은 배선 표 한 줄
 *
 * 세 이음새의 소유: 조립기는 무엇을 물을지, 생성기는 어떻게 묻고 읽을지,
 * 이 포트는 그 파이프라인이 무엇을 어떤 순서로 하는지(작업자에게 보여줄 서술)
 * 조립기에 흡수하지 않는 이유: 이 뷰는 키워드 수집과 원천 영상, 최종 합성까지 그림
 * 버전별로 갈린 이유: 한 파일에서 두 버전의 산문이 나란히 살면 상대의 문장을 함께 읽어야 함
 * 갈라 두면 각 빌더가 자기 버전의 사실을 정적으로 알아 없는 단계가 조건이 아니라 부재로 표현됨
 */
export interface PlanProcessViewBuilder {
  build(input: BuildProcessViewInput): ProcessView;
}

export const PLAN_PROCESS_VIEWS = Symbol('PLAN_PROCESS_VIEWS');

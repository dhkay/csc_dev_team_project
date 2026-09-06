// 활동 로그 아웃바운드 포트(공유): 누가, 어떤 채널에서, 무엇을 했고 얼마 청구됐나
// 포트를 두는 이유: 코어가 로그 계약(@csc/log-contracts 의 kind/scope/actor)을 모르게 하기 위함
// 전달 보장은 at-least-once + 손실 가능. 활동 원장이지 트랜잭션 저널이 아니고 로깅이 비즈니스 경로를 막지 않음

import type { BillingMode, CostStatus } from '@csc/pricing';
import type { ToolVersion } from '../tool-version';

/**
 * 활동 종류: 닫힌 어휘. 점 표기 조립(`marketing.` 접두사)은 어댑터 담당
 * 세그먼트는 프로세스 뷰의 stage id(plan/source/final)에 맞춤. step id 는 video-model 내부라 미채택
 */
export type ActivityAction =
  // 기획 단계
  | 'plan.generated'
  // 기획 앞의 입력 정제. 유료 LLM 호출이라 별도 행이어야 원장의 금액이 맞는다.
  | 'plan.brief_refined'
  | 'plan.scene_image_generated'
  | 'saved_plan.created'
  | 'saved_plan.scene_updated'
  | 'saved_plan.deleted'
  // 원천 영상 단계
  | 'source.created'
  | 'source.rerendered'
  | 'source.deleted'
  | 'source.render_completed'
  // 취소는 실패와 다른 사건(산출물이 남지 않음). 지난 기록에만 있는 값은 여기 두지 않고 뷰어가 라벨 보유
  | 'source.render_cancelled'
  // 원천 보관함 이동. 최종과 합치면 어느 표의 항목인지 잃음(target.kind 와 상세 경로가 다름)
  | 'source.archived'
  | 'source.unarchived'
  // 최종 영상 단계
  | 'final.created'
  | 'final.rerendered'
  | 'final.deleted'
  | 'final.render_completed'
  | 'final.render_cancelled'
  // 보관함(조직 공유) 이동: 삭제가 아니라 위치 전이라 별도 어휘
  | 'final.archived'
  | 'final.unarchived';

/** 활동이 가리키는 대상. 뷰어가 항목을 특정하고 상세로 이어갈 근거 */
export interface ActivityTarget {
  kind: 'saved_plan' | 'source' | 'final' | 'channel';
  id: number;
}

/**
 * 비용 스냅샷: 이벤트 시점 단가로 굳힌 값(단가가 바뀌어도 과거 청구액이 그대로여야 증빙)
 * 필드는 `@csc/pricing` CostResult 와 1:1 이고 계산은 호출부 담당
 */
export interface ActivityCostSnapshot {
  // 0 이 '무료'인지 '모름'인지를 이 값만 구분
  status: CostStatus;
  // 정수 마이크로USD. computed/free 가 아니면 생략(0 으로 위장 금지)
  microUsd?: number;
  // 적용된 단가 버전 id: 동결값의 재계산과 감사 근거
  rateVersion?: string | null;
  // 실제로 쓰인 모델 key(요청값이 아니라 폴백된 쪽)
  model: string;
  billing?: BillingMode | null;
  // 원시 사용량(key = BillingUnit): 재계산과 감사용
  units?: Record<string, number>;
  breakdown?: { unit: string; units: number; microUsd: number }[];
}

/** 활동 로그 한 건 */
export interface ActivityLogEntry {
  organizationId: number;
  // 행위자. 폴링으로 관측한 완료도 그 항목의 소유자에게 귀속
  actorUserId: number;
  // 활동이 일어난 채널(뷰어 컬럼과 필터). 채널 없는 활동은 null
  channelId: number | null;
  // 어느 도구 버전의 활동인가. 액션 이름만으로는 두 버전을 가릴 수 없고 과금 방식도 달라 필수
  // 선택값이면 누락이 조용히 지나가고 지난 기록은 되메울 수 없음
  version: ToolVersion;
  action: ActivityAction;
  // 뷰어에 그대로 보이는 한 줄. 제목을 넣으면 로그 서버의 부분일치 검색이 곧 제목 검색이 됨
  message: string;
  target?: ActivityTarget;
  // 렌더 잡 id: video-model 로그와 이어붙이는 키(승격 컬럼)
  jobId?: string | null;
  // 소요 시간: 동기 생성 호출만. 폴링 관측 완료는 관측 시각과 완료 시각이 달라 제외
  durationMs?: number | null;
  // 토큰 사용량: 승격 컬럼(token_input/token_output)으로 가서 집계에 쓰임
  usage?: { tokenInput?: number; tokenOutput?: number };
  cost?: ActivityCostSnapshot;
  // 실패 활동 여부. level WARN 으로 내려가 뷰어의 실패 필터에 잡힘
  failed?: boolean;
  // 멱등 키. 어댑터가 결정적 event_id 로 변환하고 1차 방어는 호출부의 조건부 DB 갱신
  dedupeKey?: string;
  // 그 외 부가 정보. payload 에 snake_case 키로 실림
  detail?: Record<string, unknown>;
}

/** 활동 로그 기록 포트 */
export interface ActivityLogPort {
  /**
   * 활동 1건 기록. 동기 void 라 throw 하지 않고 호출부는 결과를 보지 않음
   * Promise 를 돌려주지 않는 것이 계약(비즈니스 경로가 로깅을 기다릴 수 없게 타입으로 고정)
   */
  log(entry: ActivityLogEntry): void;
}

export const ACTIVITY_LOG_PORT = Symbol('ACTIVITY_LOG_PORT');

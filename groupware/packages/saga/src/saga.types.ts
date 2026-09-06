/**
 * 사가 커널: 여러 단계에 걸친 쓰기 하나를 단계 목록으로 선언하고 진행 상태를 durable 하게 남긴다.
 *
 * 이 도구의 쓰기는 로컬 DB 한 행 + 원격 부수효과(file-upload 자산, video-model 렌더 잡) 조합이라
 * 한 트랜잭션으로 묶을 수 없다. 인라인 try/catch 보상은 프로세스가 살아 있을 때만 돌아, 단계
 * 사이에서 죽으면 중간 상태가 영구히 남는다. 잡 없이 멈춘 예약 행, 확정되지 않은 자산을 가리키는
 * 저장본. 둘 다 스스로 낫지 않고 사용자에게 알려지지도 않는다.
 *
 * 새 다단계 쓰기 = 정의 파일 하나(`SagaDefinition` 구현) + 도메인 모듈에 provider 등록.
 * 러너도 저장소도 손대지 않는다.
 *
 * 단계를 쓸 때의 계약(이것을 지켜야 재개가 안전하다):
 *
 * 1. 산출물은 반드시 반환한다. 러너가 단계 직후 context 에 합쳐 저장하므로 재개가 앞 단계를
 *    되풀이하지 않는다. 지역 변수에만 담으면 그 값은 크래시와 함께 사라진다.
 * 2. 재실행에 안전해야 한다(멱등). 단계 실행과 그 기록 사이에서 죽으면 그 단계가 한 번 더 돈다.
 *    두 번째 부수효과를 만들 수밖에 없는 단계(예: 벤더 잡 생성)는 그 사실을 주석에 남긴다.
 * 3. 보상은 자기 단계만 되돌린다. 순서는 러너가 역순으로 보장한다.
 */

/** 사가 인스턴스 상태. DB varchar 의 값 공간이 이 유니온이다. */
export type SagaStatus = 'RUNNING' | 'COMPLETED' | 'COMPENSATING' | 'COMPENSATED';

/** 아직 끝나지 않은 상태(복구 대상). COMPENSATED/COMPLETED 는 종료다. */
export const NON_TERMINAL_SAGA_STATUSES: readonly SagaStatus[] = ['RUNNING', 'COMPENSATING'];

/**
 * 끝난 상태(보존기간 정리 대상)
 *
 * 두 목록을 각각 적는 이유: 정리가 "비종료의 여집합" 이면 나중에 상태를 하나 더 만들 때 그것이 자동으로
 * 정리 대상이 된다. 지우는 쪽은 대상을 명시적으로 나열해야 안전하다.
 */
export const TERMINAL_SAGA_STATUSES: readonly SagaStatus[] = ['COMPLETED', 'COMPENSATED'];

/**
 * 단계 실행 정보. 러너가 매 호출에 함께 넘긴다.
 *
 * `idempotencyKey` 가 이것의 존재 이유다. 규칙 2(재실행 안전)를 스스로 지킬 수 없는 단계가 있다.
 * 외부 서비스에 무언가를 만드는 단계다. 벤더를 호출하고 진행을 기록하기 전(DB 쓰기 한 번 폭)에
 * 죽으면 그 단계가 한 번 더 돌고, 그러면 두 번째 잡이 생긴다. 그 창을 닫는 방법은 하나뿐이다:
 * 같은 요청임을 외부 서비스가 알아보게 하는 것. 그래서 재실행에도 변하지 않는 키가 필요하다.
 *
 * 키는 `사가 id + 단계 번호` 다. 재실행은 진행 기록 전에 죽은 경우이므로 단계 번호가 그대로다.
 * 사가마다, 단계마다 다르고, 재시도에는 같다. 컨텍스트에서 만들면(예: 행 id) 그 행이 생기기 전에
 * 호출하는 단계는 키를 만들 수 없다.
 */
export interface SagaStepMeta {
  // 이 실행이 속한 사가 인스턴스 id.
  readonly sagaId: number;
  // 단계 번호(0부터). 재개 지점이자 키의 일부다.
  readonly stepIndex: number;
  // 단계 이름(로그용)
  readonly stepName: string;
  // 외부 서비스에 넘길 멱등키. 재실행에도 같다.
  //
  // 외부 서비스가 이 키로 중복을 접어 주면(같은 키 = 먼저 만든 것을 반환) 그 단계는 재실행에 안전해진다.
  readonly idempotencyKey: string;
}

/**
 * 단계 하나
 *
 * `execute` 는 context 조각을 돌려주고 러너가 그것을 누적 저장한다. 아무것도 만들지 않는 단계는
 * 빈 객체를 돌려준다. `compensate` 가 없으면 되돌릴 것이 없는 단계다(조회, 검증 등)
 *
 * 두 번째 인자(`meta`)는 필요할 때만 받는다. 외부에 무언가를 만드는 단계는 `meta.idempotencyKey` 를
 * 그 호출에 실어 보낸다.
 */
export interface SagaStep<Ctx extends object> {
  // 단계 이름. 로그와 디버깅용이며 순서(배열 인덱스)가 진실원이라 이름을 바꿔도 재개는 깨지지 않는다.
  readonly name: string;
  execute(ctx: Ctx, meta: SagaStepMeta): Promise<Partial<Ctx>>;
  /** 이 단계가 만든 것을 되돌린다. best-effort: 실패해도 나머지 보상은 계속한다(러너가 삼키고 경고) */
  compensate?(ctx: Ctx, meta: SagaStepMeta): Promise<void>;
}

/** 단계 멱등키를 만든다. 재실행에 불변인 두 값만 쓴다(사가 id, 단계 번호) */
export function sagaStepIdempotencyKey(sagaId: number, stepIndex: number): string {
  return `saga:${sagaId}:${stepIndex}`;
}

/**
 * 사가 정의: 종류 + 단계 목록 + 재개용 컨텍스트 복원
 *
 * `hydrate` 가 필요한 이유: 재개하는 프로세스에는 최초 요청의 지역 변수가 없다. payload(입력)와
 * context(지금까지의 산출물)만으로 단계가 볼 컨텍스트를 되살릴 수 있어야 한다. 그래서 payload 에
 * 재개에 필요한 전부를 담는 것이 정의 작성자의 책임이다.
 */
export interface SagaDefinition<Ctx extends object> {
  // 저장된 saga_type. 복구 러너가 이 값으로 정의를 찾는다(레지스트리 key)
  readonly type: string;
  readonly steps: readonly SagaStep<Ctx>[];
  hydrate(payload: Record<string, unknown>, context: Record<string, unknown>): Ctx;
}

/** 저장된 사가 인스턴스(진행 상태) */
export interface SagaInstance {
  id: number;
  organizationId: number;
  ownerUserId: number;
  sagaType: string;
  clientRequestId: string | null;
  status: SagaStatus;
  // 완료된 단계 수 = 다음에 실행할 인덱스
  step: number;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 사가 실행 결과 */
export interface SagaOutcome<Ctx extends object> {
  // 마지막 단계까지 끝난 컨텍스트
  context: Ctx;
  // 이 호출이 실행한 것이 아니라 이미 완료돼 있던 사가를 그대로 돌려준 것인가
  //
  // 호출부가 후처리(활동 로그 등)를 되풀이하지 않는 근거다. 멱등키를 쓰는 쓰기에서 재시도가
  // 두 번째 로그를 남기면 원장이 거짓이 된다.
  alreadyCompleted: boolean;
}

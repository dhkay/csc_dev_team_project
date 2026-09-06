import { SagaInstance, SagaStatus } from './saga.types';

/** 사가 시작 입력. 멱등키가 있으면 같은 키의 기존 인스턴스를 집는다. */
export interface StartSagaInput {
  organizationId: number;
  ownerUserId: number;
  sagaType: string;
  clientRequestId: string | null;
  payload: Record<string, unknown>;
}

/**
 * 사가 진행 상태 저장소 아웃바운드 포트
 *
 * 러너는 이 포트만 알고 marketingdb 를 모른다(코어가 ORM 을 모르는 규칙). 저장 실패는 삼키지 않는다:
 * 진행 상태를 못 적으면 재개가 앞 단계를 되풀이하므로, 그 실패는 사가 자체의 실패로 다뤄야 한다.
 */
export interface SagaStorePort {
  /**
   * 사가를 시작하거나 이미 있는 것을 집는다.
   *
   * 멱등키가 있으면 (조직, 소유자, 종류, 키) 유니크가 하나임을 보장한다. 경합으로 INSERT 가 충돌하면
   * 다시 조회해서 그 행을 돌려준다(드라이버 에러 코드에 의존하지 않는다: 교체에 깨지지 않게)
   */
  startOrGet(input: StartSagaInput): Promise<SagaInstance>;
  /**
   * 단계 하나 완료를 기록한다: step 을 앞으로, context 를 교체
   *
   * 단계 실행 직후 한 번의 쓰기여야 한다. 두 번으로 나누면 그 사이에서 죽었을 때 step 과 context
   * 가 어긋나 재개가 잘못된 지점에서 시작한다.
   *
   * 같은 문장이 실행권도 갱신한다(claimed_at). 이 호출은 실행권을 든 실행만 하므로 자기 리스를
   * 미루는 것이다. 그래서 리스가 답하는 질문이 "사가 전체가 leaseMs 안에 끝나나" 에서 "한 단계가
   * leaseMs 안에 끝나나" 로 좁아진다. 갱신하지 않으면 느린 사가가 아직 살아 있는데도 리스를 잃고,
   * 그때 들어온 중복 요청이 남은 단계를 함께 수행한다(재실행 안전하지 않은 단계에서 사고가 된다)
   */
  advance(id: number, step: number, context: Record<string, unknown>): Promise<void>;
  /** 상태 전이(+ 사유). 성공 전이는 error 를 null 로 되돌린다. */
  setStatus(id: number, status: SagaStatus, error: string | null): Promise<void>;
  findById(id: number): Promise<SagaInstance | null>;
  /**
   * 실행권을 집는다(성공하면 true). 이미 살아 있는 실행이 들고 있으면 false.
   *
   * 같은 사가를 두 실행이 동시에 돌리지 못하게 하는 장치다. 없으면 같은 멱등키의 두 요청이 남은
   * 단계를 각자 한 번씩 수행한다(유료 잡이 둘, 그중 하나는 아무도 폴링하지 않는 고아가 된다).
   * 조건부 UPDATE 한 문장이어야 한다. 조회와 나누면 그 틈으로 둘 다 통과한다.
   *
   * leaseMs 가 지난 실행권은 죽은 것으로 보고 빼앗는다.
   */
  tryAcquire(id: number, leaseMs: number): Promise<boolean>;
  /** 실행권을 놓는다. 실행이 끝나면(성공이든 보상이든) 반드시 부른다. */
  release(id: number): Promise<void>;
  /**
   * 중단된 인스턴스를 집는다(복구용). `updatedAt < cutoff` 인 비종료 인스턴스를 claim 하고 돌려준다.
   *
   * claim(claimed_at 갱신)을 조회와 같은 문장으로 해야 동시 러너가 같은 인스턴스를 두 번 돌리지
   * 않는다. 조회 후 별도 UPDATE 로 나누면 그 틈에 다른 러너가 같은 행을 집는다.
   */
  claimStale(cutoff: Date, limit: number): Promise<SagaInstance[]>;
  /**
   * 끝난 인스턴스를 지운다(보존기간 정리). `updatedAt < cutoff` 인 종료 상태만 지우고 지운 수를 돌려준다.
   *
   * 이 표는 쓰기 시도마다 한 행이 생기므로 정리가 없으면 무한히 자란다. 진행 중인 것은 절대 지우지
   * 않는다(지우면 그 사가는 이어 갈 근거를 잃는다). 사용자에게 보이는 흔적은 활동 원장이 따로 갖는다.
   */
  deleteSettledBefore(cutoff: Date, limit: number): Promise<number>;
}

export const SAGA_STORE_PORT = Symbol('SAGA_STORE_PORT');

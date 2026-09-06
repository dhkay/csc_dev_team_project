import { readFileSync } from 'node:fs';
import {
  MAX_OPERATIONS_PER_BATCH,
  MutationOp,
  REJECT_RETRYABLE,
  RejectReason,
  SyncEntity,
  SyncOpStatus,
  WIRE_VERSION,
  decodeCursor,
  encodeCursor,
  isRetryable,
  type PullResponse,
  type PushRequest,
  type PushResponse,
} from '../index';

/**
 * 골든 픽스처 계약 테스트
 *
 * 같은 JSON 을 세 곳이 읽는다. 이 Jest 테스트, 데스크톱 Rust 의 serde 파싱 테스트, 데스크톱 TS
 * 테스트. 하나라도 파싱에 실패하면 계약이 갈라진 것이고 그 사실이 CI 에서 드러난다.
 */
function loadFixture<T>(name: string): T {
  const path = require.resolve(`@csc/mes-contracts/fixtures/${name}`);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

describe('MES 동기화 계약 골든 픽스처', () => {
  describe('push 요청', () => {
    it('봉투의 모든 필드가 계약 타입과 맞아야 한다', () => {
      const fixture = loadFixture<PushRequest>('push-request.json');

      expect(fixture.operations).toHaveLength(2);
      expect(fixture.operations.length).toBeLessThanOrEqual(MAX_OPERATIONS_PER_BATCH);

      const [intent, create] = fixture.operations;
      expect(intent.op).toBe(MutationOp.Intent);
      expect(intent.entity).toBe(SyncEntity.WorkOrder);
      // INTENT 는 절대값이 아니라 의도를 보낸다. baseVersion 낙관적 잠금이 함께 실린다.
      expect(intent.intent).toBe('START');
      expect(intent.baseVersion).toBe(2);

      expect(create.op).toBe(MutationOp.Create);
      expect(create.entity).toBe(SyncEntity.ProductionRecord);
      // append-only 라 대상 id 도 baseVersion 도 없다(충돌 개념 자체가 없다)
      expect(create.targetId).toBeNull();
      expect(create.baseVersion).toBeNull();
    });

    it('clientOpId 는 UUID 형식이어야 한다', () => {
      const fixture = loadFixture<PushRequest>('push-request.json');
      for (const op of fixture.operations) {
        expect(op.clientOpId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }
    });
  });

  describe('push 응답', () => {
    it('부분 성공을 op별 결과 배열로 표현해야 한다', () => {
      const fixture = loadFixture<PushResponse>('push-response.json');
      const [applied, rejected] = fixture.results;

      expect(applied.status).toBe(SyncOpStatus.Applied);
      expect(applied.serverSeq).not.toBeNull();
      expect(applied.reason).toBeNull();

      expect(rejected.status).toBe(SyncOpStatus.Rejected);
      expect(rejected.reason).toBe(RejectReason.QtyExceedsPlan);
    });

    it('거부 결과의 retryable 이 REJECT_RETRYABLE 매핑과 일치해야 한다', () => {
      const fixture = loadFixture<PushResponse>('push-response.json');
      for (const result of fixture.results) {
        if (result.reason === null) continue;
        // 클라이언트가 분류를 하드코딩하지 않도록 응답에 함께 싣는다. 두 값이 갈리면
        // 클라이언트가 영구 실패를 무한 재시도하거나 반대로 재시도 가능한 것을 버린다.
        expect(result.retryable).toBe(isRetryable(result.reason));
      }
    });
  });

  describe('pull 응답', () => {
    it('changes 가 seq 오름차순이어야 한다', () => {
      const fixture = loadFixture<PullResponse>('pull-response.json');
      const seqs = fixture.changes.map((c) => c.seq);
      // 엔티티가 섞여도 전역 seq 순서를 지킨다. 작업지시 생성이 그 실적보다 먼저 도착하는
      // 인과 순서가 이 정렬로 보장된다.
      expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    });

    it('삭제는 tombstone 으로 전파되어야 한다', () => {
      const fixture = loadFixture<PullResponse>('pull-response.json');
      const deletion = fixture.changes.find((c) => c.op === 'DELETE');
      // 하드 삭제면 오프라인 클라이언트가 "없어진 행"을 스스로 알 방법이 없다.
      expect(deletion).toBeDefined();
      expect(deletion?.deletedAt).not.toBeNull();
    });

    it('커서가 현재 계약 버전으로 디코딩되어야 한다', () => {
      const fixture = loadFixture<PullResponse>('pull-response.json');
      const cursor = decodeCursor(fixture.cursor);
      expect(cursor.v).toBe(WIRE_VERSION);
      // 엔티티별 맵이라 나중에 엔티티를 추가해도 그 엔티티만 0 부터 시작한다.
      expect(Object.keys(cursor.s).length).toBeGreaterThan(0);
    });
  });

  describe('커서 인코딩', () => {
    it('왕복해도 값이 보존되어야 한다', () => {
      const original = {
        v: WIRE_VERSION,
        sv: 3,
        s: { [SyncEntity.WorkOrder]: 184190, [SyncEntity.ProductionRecord]: 184203 },
      };
      expect(decodeCursor(encodeCursor(original))).toEqual(original);
    });

    it('스코프 버전이 다르면 거부해야 한다', () => {
      // 라인 재배정을 받은 단말이 새 라인의 과거 데이터를 영원히 못 받는 것을 막는 검증이다.
      const token = encodeCursor({ v: WIRE_VERSION, sv: 3, s: {} });
      expect(() => decodeCursor(token, 4)).toThrow();
    });
  });

  describe('거부 사유 매핑', () => {
    it('모든 RejectReason 에 retryable 이 정의되어야 한다', () => {
      for (const reason of Object.values(RejectReason)) {
        expect(REJECT_RETRYABLE[reason]).toBeDefined();
      }
    });

    it('클라이언트 버그성 거부는 재시도하지 않아야 한다', () => {
      // 이걸 재시도하면 같은 요청이 영원히 서버를 두드린다.
      expect(isRetryable(RejectReason.OpIdReused)).toBe(false);
      expect(isRetryable(RejectReason.ValidationFailed)).toBe(false);
      expect(isRetryable(RejectReason.ForbiddenScope)).toBe(false);
    });
  });
});

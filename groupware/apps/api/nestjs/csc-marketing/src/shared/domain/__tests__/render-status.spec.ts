import { deriveRenderStatus, RENDER_STALLED_AFTER_MS } from '../render-status';

describe('deriveRenderStatus', () => {
  const created = new Date('2026-01-01T00:00:00Z');
  const createdMs = created.getTime();
  const afterGrace = createdMs + RENDER_STALLED_AFTER_MS + 1_000;
  const withinGrace = createdMs + RENDER_STALLED_AFTER_MS - 1_000;

  it('비종료 + 워커 부재(false) + 유예 경과 → STALLED', () => {
    expect(
      deriveRenderStatus({ status: 'RENDERING', workerAlive: false }, created, afterGrace),
    ).toBe('STALLED');
  });

  it('워커 생존(true)이면 유예가 지나도 RENDERING 유지', () => {
    expect(
      deriveRenderStatus({ status: 'RENDERING', workerAlive: true }, created, afterGrace),
    ).toBe('RENDERING');
  });

  it('워커 정보 없음(null)이면 RENDERING 유지(판단 보류: 조급한 STALLED 방지)', () => {
    expect(
      deriveRenderStatus({ status: 'RENDERING', workerAlive: null }, created, afterGrace),
    ).toBe('RENDERING');
  });

  it('유예 이내면 워커 부재라도 RENDERING 유지(디바운스)', () => {
    expect(
      deriveRenderStatus({ status: 'RENDERING', workerAlive: false }, created, withinGrace),
    ).toBe('RENDERING');
  });

  it('COMPLETED 는 워커 부재여도 그대로 둔다', () => {
    expect(
      deriveRenderStatus({ status: 'COMPLETED', workerAlive: null }, created, afterGrace),
    ).toBe('COMPLETED');
  });

  it('잡의 FAILED 는 CANCELLED 로 번역한다. 작업을 되돌린 것으로 본다', () => {
    // 이 번역이 여기 없으면 각 poller 가 복제해야 하고, 하나가 빠지면 FAILED 로 영속돼
    //   되돌림 집합(ROLLED_BACK_RENDER_STATUSES)에서 조용히 누락된다 → 목록에 유령 카드가 남는다.
    expect(
      deriveRenderStatus({ status: 'FAILED', workerAlive: false }, created, afterGrace),
    ).toBe('CANCELLED');
    expect(
      deriveRenderStatus({ status: 'FAILED', workerAlive: true }, created, withinGrace),
    ).toBe('CANCELLED');
  });
});

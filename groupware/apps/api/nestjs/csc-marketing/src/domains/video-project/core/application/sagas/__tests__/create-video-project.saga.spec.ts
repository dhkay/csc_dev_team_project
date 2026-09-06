import { CreateVideoProjectSaga } from '../create-video-project.saga';
import type { CreateVideoProjectSagaContext } from '../create-video-project.saga';

/**
 * 사가 단계의 재실행 안전성. 러너가 진행을 적기 전에 죽으면 복구가 그 단계를 한 번 더 돌림
 * 어긋남은 크래시 뒤 복구에서만 드러나고 남는 것은 아무도 렌더하지 않는 PENDING 행 하나
 */

/**
 * 예약 행 저장소 페이크. 포트 계약대로 같은 멱등키면 이미 만든 행을 반환
 * 그 계약 자체는 reserve-once.spec.ts 가 실제 헬퍼로 증명하고 여기서는 사가의 동작만 봄
 */
class FakeRepository {
  rows: { id: number; organizationId: number; ownerUserId: number; clientRequestId: string | null }[] = [];
  private seq = 0;

  async createRecord(scope: { organizationId: number; ownerUserId: number }, record: { clientRequestId: string | null }) {
    if (record.clientRequestId != null) {
      const dup = this.rows.find(
        (r) =>
          r.organizationId === scope.organizationId &&
          r.ownerUserId === scope.ownerUserId &&
          r.clientRequestId === record.clientRequestId,
      );
      if (dup) return dup;
    }
    this.seq += 1;
    const row = {
      id: this.seq,
      organizationId: scope.organizationId,
      ownerUserId: scope.ownerUserId,
      clientRequestId: record.clientRequestId,
      title: '테스트 영상',
      channelId: 7,
      resolution: '720p',
      videoModel: 'grok',
      scenes: [{ order: 1 }],
    };
    this.rows.push(row);
    return row;
  }

  async findOneOwned(_scope: unknown, id: number) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async deleteRecordById(_orgId: number, id: number) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.id !== id);
    return this.rows.length < before;
  }
  async startRenderRecord() {
    return true;
  }
}

const PLAN = { id: 11, channelId: 7, title: '테스트 영상', bgm: { uploadId: 'bgm-1' }, segmentMode: 'sequential' };

const SPECS = {
  prepareFromPlan: async () => ({
    aspectRatio: '9:16',
    resolution: '720p',
    aiModels: { video: 'grok', videoMode: 't2v' },
    scenes: [{ order: 1 }],
    spec: { tts: { provider: 'edge', voice: 'ko-KR', pitch: 0 } },
  }),
  assertSpecAssetsUploaded: async () => undefined,
  buildSpecFromRow: async () => ({ tts: {} }),
};

function build() {
  const repository = new FakeRepository();
  const saga = new CreateVideoProjectSaga(
    repository as never,
    { createJob: async () => 'job-1', cancelJob: async () => undefined } as never,
    { getPersonal: async () => PLAN } as never,
    {} as never,
    { log: () => undefined } as never,
    { 'v1.0': SPECS, 'v1.5': SPECS } as never,
  );
  return { saga, repository };
}

function context(): CreateVideoProjectSagaContext {
  return {
    scope: { organizationId: 1, ownerUserId: 2, version: 'v1.5' },
    savedPlanId: 11,
    requestedResolution: null,
    clientRequestId: 'req-abc',
  } as CreateVideoProjectSagaContext;
}

const META = { sagaId: 1, stepIndex: 0, stepName: 'reserve-row', idempotencyKey: 'saga:1:0' };

describe('CreateVideoProjectSaga: 예약 단계', () => {
  it('두 번 돌아도 같은 행 하나만 남는다(진행 기록 직전 크래시 재현)', async () => {
    // 러너가 진행을 적기 전에 죽으면 이 단계가 그대로 다시 돈다. 계약이 요구하는 것은 그때
    //   "이미 만든 그 행" 이 돌아오는 것이다. 새 행이 생기거나 예외가 나면 계약 위반이다.
    const { saga, repository } = build();
    const step = saga.steps[0];

    const first = await step.execute(context(), META);
    const second = await step.execute(context(), META);

    expect(repository.rows).toHaveLength(1);
    expect(second.projectId).toBe(first.projectId);
  });

  it('멱등키가 없으면 되돌릴 수 있게 보상이 그 행을 지운다', async () => {
    // 키 없는 경로는 접을 근거가 없어 재실행이 행을 하나 더 만든다. 그때 최소한 보상이 자기
    //   단계의 흔적을 지워야 원장에 아무도 렌더하지 않는 행이 남지 않는다.
    const { saga, repository } = build();
    const step = saga.steps[0];
    const ctx = { ...context(), clientRequestId: null };

    const produced = await step.execute(ctx, META);
    await step.compensate!({ ...ctx, ...produced }, META);

    expect(repository.rows).toHaveLength(0);
  });
});

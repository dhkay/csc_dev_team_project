import { describe, it, expect, vi } from 'vitest';
import type { PlanProposal, PlanScene, SceneImageState } from '$lib/features/marketing-channels/types';
import {
  planSceneImagesStore,
  type SceneImageJob,
} from '$lib/shared/lib/stores/planSceneImagesStore/planSceneImagesStore.svelte';

// 씬 이미지 생산은 씬당 GPU 호출이라 비싸고 비멱등이다. 이 스토어의 존재 이유는
// "배치 컴포넌트가 언마운트/재마운트돼도 절대 다시 만들지 않는다" 이므로 그 불변식을 중심으로 검증한다.

const scene = (index: number): PlanScene => ({
  index,
  sourceDirection: `연출 ${index}`, // 한국어(화면 표시)
  subtitle: `자막 ${index}`,
  narration: `나레이션 ${index}`,
  imagePrompt: `English visual brief for shot ${index}`, // 영어(이미지 모델 전용)
});

const proposal = (id: string, sceneCount = 2): PlanProposal => ({
  id,
  title: `기획안 ${id}`,
  summary: '요약',
  scenes: Array.from({ length: sceneCount }, (_, i) => scene(i + 1)),
  bgm: null,
});

/** produce 호출을 세는 job 목록 + 스파이 */
function jobsFor(p: PlanProposal, produce?: SceneImageJob['produce']) {
  const spy = vi.fn(
    produce ??
      (async (_signal: AbortSignal, variant: number): Promise<SceneImageState> => ({
        status: 'done',
        dataUrl: `data:image/png;base64,v${variant}`,
      })),
  );
  const jobs: SceneImageJob[] = p.scenes.map((s) => ({
    proposalId: p.id,
    scene: s,
    produce: spy,
  }));
  return { jobs, spy };
}

/** 스토어는 모듈 싱글톤: 테스트마다 새 batchId 로 격리한다. */
let nextBatchId = 1000;
const freshBatch = () => nextBatchId++;

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('planSceneImagesStore', () => {
  it('start 하면 각 씬을 생성하고 상태를 done 으로 채운다', async () => {
    const batchId = freshBatch();
    const p = proposal('a');
    const { jobs, spy } = jobsFor(p);

    planSceneImagesStore.start(batchId, jobs);
    await flush();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(planSceneImagesStore.image(batchId, 'a', 1)).toEqual({
      status: 'done',
      dataUrl: 'data:image/png;base64,v0',
    });
    expect(planSceneImagesStore.image(batchId, 'a', 2)?.status).toBe('done');
  });

  it('같은 배치를 다시 start 해도 재생성하지 않는다 (재마운트 안전: 이 스토어의 존재 이유)', async () => {
    const batchId = freshBatch();
    const p = proposal('a');
    const first = jobsFor(p);

    planSceneImagesStore.start(batchId, first.jobs);
    await flush();
    expect(first.spy).toHaveBeenCalledTimes(2);

    // 컴포넌트 재마운트 → 같은 batchId 로 다시 start.
    const second = jobsFor(p);
    planSceneImagesStore.start(batchId, second.jobs);
    await flush();

    expect(second.spy).not.toHaveBeenCalled(); // 단 한 번도 다시 만들지 않는다
    expect(planSceneImagesStore.hasStarted(batchId)).toBe(true);
    expect(planSceneImagesStore.image(batchId, 'a', 1)?.status).toBe('done'); // 기존 결과 유지.
  });

  it("restart 는 처음부터 다시 생성한다 ('다시 생성')", async () => {
    const batchId = freshBatch();
    const p = proposal('a');
    planSceneImagesStore.start(batchId, jobsFor(p).jobs);
    await flush();

    const again = jobsFor(p);
    planSceneImagesStore.restart(batchId, again.jobs);
    await flush();

    expect(again.spy).toHaveBeenCalledTimes(2);
  });

  it('markReported 는 기획안당 한 번만 true: 자동 저장 중복 발화를 막는다', () => {
    const batchId = freshBatch();
    expect(planSceneImagesStore.markReported(batchId, 'a')).toBe(true);
    expect(planSceneImagesStore.markReported(batchId, 'a')).toBe(false);
    expect(planSceneImagesStore.markReported(batchId, 'b')).toBe(true);
  });

  it('retry 는 variant 를 올려 같은 씬의 다른 버전을 만든다', async () => {
    const batchId = freshBatch();
    const p = proposal('a');
    planSceneImagesStore.start(batchId, jobsFor(p).jobs);
    await flush();

    const { jobs, spy } = jobsFor(p);
    planSceneImagesStore.retry(batchId, jobs[0]);
    await flush();
    expect(spy).toHaveBeenCalledWith(expect.anything(), 1);
    expect(planSceneImagesStore.image(batchId, 'a', 1)?.dataUrl).toBe('data:image/png;base64,v1');

    planSceneImagesStore.retry(batchId, jobs[0]);
    await flush();
    expect(spy).toHaveBeenCalledWith(expect.anything(), 2); // 재시도마다 증가
  });

  it('진행 중인 재생성은 그 사이 넣은 외부 이미지를 덮어쓰지 않는다 (최신 의도가 이긴다)', async () => {
    // 공유 GPU라 재생성이 느리다. 그 창에 외부 이미지를 넣으면, 뒤늦게 끝난 재생성이 그걸 덮어
    // "재생성하면 그다음에 이미지를 못 바꾸는" 문제가 있었다. 토큰 가드로 최신 의도(외부 이미지)가 이겨야 한다.
    const batchId = freshBatch();
    const p = proposal('a', 1);
    planSceneImagesStore.start(batchId, jobsFor(p).jobs);
    await flush();

    // 느린 재생성: resolve 를 우리가 쥔다(끝나는 시점을 제어)
    let finishRetry!: (s: SceneImageState) => void;
    const slow = new Promise<SceneImageState>((r) => (finishRetry = r));
    planSceneImagesStore.retry(batchId, {
      proposalId: 'a',
      scene: scene(1),
      produce: () => slow,
    });
    await flush();
    expect(planSceneImagesStore.image(batchId, 'a', 1)?.status).toBe('loading');

    // 재생성이 도는 동안 작업자가 외부 이미지를 넣는다.
    planSceneImagesStore.setImage(batchId, 'a', 1, {
      status: 'done',
      dataUrl: 'data:image/png;base64,EXTERNAL',
    });
    expect(planSceneImagesStore.image(batchId, 'a', 1)?.dataUrl).toBe('data:image/png;base64,EXTERNAL');

    // 이제 느린 재생성이 뒤늦게 끝난다. 외부 이미지를 덮으면 안 된다.
    finishRetry({ status: 'done', dataUrl: 'data:image/png;base64,STALE-REGEN' });
    await flush();
    expect(planSceneImagesStore.image(batchId, 'a', 1)?.dataUrl).toBe('data:image/png;base64,EXTERNAL');
  });

  it('삭제된 기획안은 생성하지 않고 이미지도 버린다', async () => {
    const batchId = freshBatch();
    const p = proposal('a');
    const { jobs, spy } = jobsFor(p);

    planSceneImagesStore.remove(batchId, p);
    planSceneImagesStore.start(batchId, jobs);
    await flush();

    expect(spy).not.toHaveBeenCalled();
    expect(planSceneImagesStore.isRemoved(batchId, 'a')).toBe(true);
    expect(planSceneImagesStore.image(batchId, 'a', 1)).toBeUndefined();
  });

  it('setImage 는 외부 이미지를 생성 결과와 같은 자리에 놓는다', async () => {
    const batchId = freshBatch();
    const p = proposal('a', 2);
    // 씬 1이 안전 시스템에 거부된 상황을 만든다.
    const { jobs } = jobsFor(p, async (): Promise<SceneImageState> => ({
      status: 'error',
      error: 'rejected by the safety system',
    }));
    planSceneImagesStore.start(batchId, jobs);
    await flush();
    expect(planSceneImagesStore.image(batchId, 'a', 1)?.status).toBe('error');

    // 작업자가 외부 이미지를 가져온다 → 생성물과 구분 없이 같은 자리에 들어가고, 자동 저장이 그대로 올린다.
    planSceneImagesStore.setImage(batchId, 'a', 1, {
      status: 'done',
      dataUrl: 'data:image/png;base64,EXTERNAL',
    });

    expect(planSceneImagesStore.image(batchId, 'a', 1)).toEqual({
      status: 'done',
      dataUrl: 'data:image/png;base64,EXTERNAL',
    });
  });

  it('release 는 저장 끝난 기획안의 base64 를 버린다 (메모리)', async () => {
    const batchId = freshBatch();
    const p = proposal('a');
    planSceneImagesStore.start(batchId, jobsFor(p).jobs);
    await flush();
    expect(planSceneImagesStore.image(batchId, 'a', 1)).toBeDefined();

    planSceneImagesStore.release(batchId, p);

    expect(planSceneImagesStore.image(batchId, 'a', 1)).toBeUndefined();
    expect(planSceneImagesStore.image(batchId, 'a', 2)).toBeUndefined();
  });

  it('동시 생성은 4개를 넘지 않는다 (이미지 엔진 보호)', async () => {
    const batchId = freshBatch();
    const p = proposal('a', 12);
    let inFlight = 0;
    let peak = 0;
    const { jobs } = jobsFor(p, async (): Promise<SceneImageState> => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return { status: 'done', dataUrl: 'x' };
    });

    planSceneImagesStore.start(batchId, jobs);
    await vi.waitFor(() => expect(planSceneImagesStore.image(batchId, 'a', 12)).toBeDefined());

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // 직렬도 아니다(병렬은 실제로 동작)
  });

  // 아래 둘은 상한이 "배치마다"가 아니라 "전역"임을 고정한다. 목적은 공유 엔진에서의 공정성이다.
  // 한 세션이 큐를 독점하면 남의 잡 1장이 내 30장 뒤로 밀린다(엔진은 FIFO 직렬)
  // 위 단일 배치 테스트만으로는 배치별 상한도 통과해서 이 회귀를 못 잡는다.

  it('동시 생성 상한은 전역이다. 배치가 여러 개여도 4를 넘지 않는다', async () => {
    const ids = [freshBatch(), freshBatch(), freshBatch()];
    let inFlight = 0;
    let peak = 0;
    const produce = async (): Promise<SceneImageState> => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return { status: 'done', dataUrl: 'x' };
    };

    // '기획서 생성'을 연달아 눌러 배치가 동시에 살아 있는 상황
    const names = ['a', 'b', 'c'];
    ids.forEach((id, i) => {
      const p = proposal(names[i], 6);
      planSceneImagesStore.start(id, jobsFor(p, produce).jobs);
    });

    await vi.waitFor(() =>
      ids.forEach((id, i) => expect(planSceneImagesStore.image(id, names[i], 6)).toBeDefined()),
    );

    expect(peak).toBeLessThanOrEqual(4);
  });

  it('재시도도 전역 상한을 지킨다. 풀 밖으로 새지 않는다', async () => {
    const batchId = freshBatch();
    const p = proposal('r', 8);
    let inFlight = 0;
    let peak = 0;
    const { jobs } = jobsFor(p, async (): Promise<SceneImageState> => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return { status: 'done', dataUrl: 'x' };
    });

    // 실패한 씬들을 한꺼번에 재시도. 풀을 거치지 않으면 그대로 다 나간다.
    for (const job of jobs) planSceneImagesStore.retry(batchId, job);

    await vi.waitFor(() =>
      expect(planSceneImagesStore.image(batchId, 'r', 8)?.status).toBe('done'),
    );

    expect(peak).toBeLessThanOrEqual(4);
  });

  it('progress 는 모든 배치를 합산한다 (상단 요약: 배치가 올려주는 배선 없이 스토어가 답한다)', async () => {
    const one = freshBatch();
    const two = freshBatch();
    // progress 는 전역 합산이라 앞선 테스트의 남은 비동기 생성이 섞인다. 조용해진 뒤 기준을 잡는다.
    await vi.waitFor(() => expect(planSceneImagesStore.progress().inProgress).toBe(false));
    const before = planSceneImagesStore.progress();

    // 느린 produce 로 loading 상태를 붙잡아 둔다.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = jobsFor(proposal('a', 2), async (): Promise<SceneImageState> => {
      await gate;
      return { status: 'done', dataUrl: 'x' };
    });
    planSceneImagesStore.start(one, slow.jobs);
    planSceneImagesStore.start(two, jobsFor(proposal('b', 3)).jobs);
    await flush();

    const mid = planSceneImagesStore.progress();
    expect(mid.total - before.total).toBe(5); // 2 + 3 (두 배치 합산)
    expect(mid.done - before.done).toBe(3); // two 배치만 완료
    expect(mid.inProgress).toBe(true); // one 배치가 아직 loading

    release();
    await vi.waitFor(() =>
      expect(planSceneImagesStore.image(one, 'a', 2)?.status).toBe('done'),
    );
    expect(planSceneImagesStore.progress().inProgress).toBe(false); // 전부 끝나면 요약이 사라진다
  });

  it('release 한 이미지는 progress 합산에서 빠진다', async () => {
    const batchId = freshBatch();
    const p = proposal('a', 2);
    planSceneImagesStore.start(batchId, jobsFor(p).jobs);
    await flush();
    const before = planSceneImagesStore.progress();

    planSceneImagesStore.release(batchId, p);

    expect(planSceneImagesStore.progress().total).toBe(before.total - 2);
  });

  it('배치끼리 상태가 격리된다', async () => {
    const one = freshBatch();
    const two = freshBatch();
    const p = proposal('a');

    planSceneImagesStore.start(one, jobsFor(p).jobs);
    await flush();

    expect(planSceneImagesStore.image(one, 'a', 1)).toBeDefined();
    expect(planSceneImagesStore.image(two, 'a', 1)).toBeUndefined();
    expect(planSceneImagesStore.hasStarted(two)).toBe(false);
  });
});

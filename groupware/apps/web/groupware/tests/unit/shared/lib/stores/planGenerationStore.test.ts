/**
 * 생성 배치 스토어에서 이 테스트가 지키는 것은 배치와 서버 작업을 잇는 두 실이다.
 *
 * 저장본 id(`linkRender`)와 프로젝트 id(`linkProject`)는 이름이 비슷하지만 하는 일이 다르다.
 * 앞엣것 하나만 있으면 "아직 안 만들어졌다" 와 "만들어졌다가 사라졌다" 가 같은 모양(못 찾음)이 되어,
 * 하단 탭이 끝난 작업을 영영 붙잡거나 되돌림 전이를 실은 응답 한 번에 판정을 걸게 된다.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { planGenerationStore } from '$lib/shared/lib/stores/planGenerationStore/planGenerationStore.svelte';
import type { PlanGenerationRequest } from '$lib/features/marketing-channels/types';

const REQ: PlanGenerationRequest = {
  brandName: '정관장',
  concepts: [],
  purposeKeywords: [],
  proposalCount: 1,
  sceneCount: 3,
  excludeInfographic: false,
};

/** 채널을 테스트마다 새로 잡는다. 스토어가 싱글톤이라 같은 채널을 쓰면 앞 테스트가 남는다 */
let channelId = 0;
beforeEach(() => {
  channelId += 1;
});

describe('배치 추가', () => {
  it('시작 시각을 적어 둔다(경과 시간의 기준)', () => {
    // 창이 열 때마다 now 를 쓰면 3분째 돌던 생성이 00:00 부터 다시 세어진다.
    const before = Date.now();
    const id = planGenerationStore.addBatch(channelId, REQ);
    expect(planGenerationStore.batch(id)!.startedAt).toBeGreaterThanOrEqual(before);
  });

  it('프로젝트는 아직 없다', () => {
    const id = planGenerationStore.addBatch(channelId, REQ);
    expect(planGenerationStore.batch(id)!.projectId).toBeNull();
  });

  it('어느 초안에서 나왔는지 적어 둔다', () => {
    // 새로고침으로 배치가 사라져도 이 실이 있으면 적은 것이 남아 폼이 다시 선다.
    const id = planGenerationStore.addBatch(channelId, REQ, 'd1');
    expect(planGenerationStore.batch(id)!.draftId).toBe('d1');
    // 초안 없이 시작한 제출도 있다(초안이 이미 정리된 경우)
    expect(planGenerationStore.batch(planGenerationStore.addBatch(channelId, REQ))!.draftId).toBeNull();
  });
});

describe('서버 작업과 잇기', () => {
  it('저장본과 프로젝트를 따로 적는다', () => {
    // 저장본은 기획안이고 프로젝트는 렌더다. 하나로 합치면 그 사이 구간을 표현할 수 없다.
    const id = planGenerationStore.addBatch(channelId, REQ);
    planGenerationStore.linkRender(id, 65);
    expect(planGenerationStore.batch(id)!.savedPlanIds).toEqual([65]);
    expect(planGenerationStore.batch(id)!.projectId).toBeNull();

    planGenerationStore.linkProject(id, 23);
    expect(planGenerationStore.batch(id)!.projectId).toBe(23);
  });

  it('같은 값을 두 번 이어도 흔들리지 않는다', () => {
    // 재시도로 두 번 불릴 수 있다. 그때 목록이 새 배열이 되면 파생 계산이 헛돈다.
    const id = planGenerationStore.addBatch(channelId, REQ);
    planGenerationStore.linkRender(id, 65);
    planGenerationStore.linkRender(id, 65);
    planGenerationStore.linkProject(id, 23);
    const snapshot = planGenerationStore.batch(id);
    planGenerationStore.linkProject(id, 23);

    expect(planGenerationStore.batch(id)!.savedPlanIds).toEqual([65]);
    expect(planGenerationStore.batch(id)).toBe(snapshot);
  });

  it('없는 배치를 이어도 무해하다', () => {
    planGenerationStore.linkProject(99_999, 1);
    expect(planGenerationStore.batch(99_999)).toBeUndefined();
  });
});

describe('걷기와 되돌리기', () => {
  it('걷은 배치는 목록에서 사라지고, 되돌리면 그대로 돌아온다', () => {
    // 취소 사가가 뒤 단계에서 실패하면 아직 도는 작업이 화면에서 사라진 채 남는다(과금은 계속된다).
    const id = planGenerationStore.addBatch(channelId, REQ);
    planGenerationStore.linkProject(id, 23);
    const batch = planGenerationStore.batch(id)!;

    planGenerationStore.removeBatch(id);
    expect(planGenerationStore.batchesFor(channelId)).toEqual([]);

    planGenerationStore.restoreBatch(batch);
    expect(planGenerationStore.batch(id)!.projectId).toBe(23);
  });

  it('같은 배치를 두 번 되돌려도 하나다', () => {
    const id = planGenerationStore.addBatch(channelId, REQ);
    const batch = planGenerationStore.batch(id)!;
    planGenerationStore.removeBatch(id);
    planGenerationStore.restoreBatch(batch);
    planGenerationStore.restoreBatch(batch);

    expect(planGenerationStore.batchesFor(channelId)).toHaveLength(1);
  });

  it('채널이 다른 배치는 섞이지 않는다', () => {
    planGenerationStore.addBatch(channelId, REQ);
    planGenerationStore.addBatch(channelId + 1000, REQ);
    expect(planGenerationStore.batchesFor(channelId)).toHaveLength(1);
  });
});

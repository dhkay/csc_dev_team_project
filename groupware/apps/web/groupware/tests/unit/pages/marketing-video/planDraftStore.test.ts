/**
 * 초안 스토어: 여러 초안을 창과 셸이 함께 보는 자리
 *
 * 창은 그중 하나를 편집하고 셸은 전부를 탭으로 세운다. 그래서 "저장" 과 "제거" 의 경계가 이
 * 스토어의 계약이다. 내용 없는 초안이 남으면 담긴 것 없는 탭이 서고, 제거가 저장소까지 닿지 않으면
 * 새로고침에 그것이 되살아난다.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

const store = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { planDraftStore } = await import(
  '$lib/pages/tools/marketing-video/create/planDraftStore.svelte'
);
const { draftsKey, hasContent } = await import(
  '$lib/pages/tools/marketing-video/create/planDraft'
);
type PlanDraft = Parameters<typeof hasContent>[0];

function makeDraft(id: string, sceneBrief: string, updatedAt = 1): PlanDraft {
  return {
    id,
    updatedAt,
    mode: 'concept',
    brandName: null,
    concepts: [],
    purposeKeywords: [],
    proposalCount: 1,
    sceneCount: 3,
    excludeInfographic: false,
    sceneBrief,
    constraints: '',
    videoModel: '',
    segmentMode: 'sequential',
  } as PlanDraft;
}

/** 칸을 테스트마다 새로 잡는다. 스토어가 싱글톤이라 같은 칸을 쓰면 앞 테스트가 남는다 */
let seq = 0;
let key = '';
beforeEach(() => {
  store.clear();
  seq += 1;
  key = draftsKey('v1.5', seq);
});

describe('여러 초안', () => {
  it('각자 id 로 남고 최근 것이 앞이다', () => {
    planDraftStore.upsert(key, makeDraft('a', '첫째', 1));
    planDraftStore.upsert(key, makeDraft('b', '둘째', 2));

    expect(planDraftStore.list(key).map((d) => d.id)).toEqual(['b', 'a']);
    expect(planDraftStore.get(key, 'a')?.sceneBrief).toBe('첫째');
  });

  it('같은 id 는 갈아 끼운다(초안이 늘지 않는다)', () => {
    planDraftStore.upsert(key, makeDraft('a', '적던 것'));
    planDraftStore.upsert(key, makeDraft('a', '고친 것'));

    expect(planDraftStore.list(key)).toHaveLength(1);
    expect(planDraftStore.get(key, 'a')?.sceneBrief).toBe('고친 것');
  });

  it('내용이 없어지면 저장이 아니라 제거다', () => {
    // 그래서 초안을 지우는 코드가 따로 필요하지 않다. 폼을 비우면 그 자체로 사라진다.
    planDraftStore.upsert(key, makeDraft('a', '적던 것'));
    planDraftStore.upsert(key, makeDraft('a', '   '));

    expect(planDraftStore.get(key, 'a')).toBeUndefined();
  });

  it('제거는 저장소까지 닿는다', () => {
    // 상태만 지우면 새로고침에 그 초안이 되살아난다.
    planDraftStore.upsert(key, makeDraft('a', '적던 것'));
    planDraftStore.upsert(key, makeDraft('b', '남길 것'));
    planDraftStore.remove(key, 'a');

    expect(JSON.parse(store.get(key)!).map((d: PlanDraft) => d.id)).toEqual(['b']);
  });

  it('마지막 초안을 지우면 칸이 비워진다', () => {
    planDraftStore.upsert(key, makeDraft('a', '적던 것'));
    planDraftStore.remove(key, 'a');

    expect(store.has(key)).toBe(false);
  });

  it('없는 id 를 지워도 무해하다', () => {
    planDraftStore.upsert(key, makeDraft('a', '적던 것'));
    planDraftStore.remove(key, 'nope');

    expect(planDraftStore.list(key)).toHaveLength(1);
  });
});

describe('저장소에서 읽어 오기', () => {
  it('한 번만 읽는다(두 번 읽으면 그 사이 편집을 덮어쓴다)', () => {
    store.set(key, JSON.stringify([makeDraft('saved', '저장돼 있던 것')]));

    planDraftStore.hydrate(key);
    planDraftStore.upsert(key, makeDraft('typed', '방금 적은 것', 2));
    planDraftStore.hydrate(key);

    expect(planDraftStore.list(key).map((d) => d.id)).toEqual(['typed', 'saved']);
  });

  it('읽지 않은 칸은 빈 목록이다', () => {
    expect(planDraftStore.list(draftsKey('v1.5', 9999))).toEqual([]);
  });
});

// 효과 안에서 저장하는 경로는 여기서 검증하지 않는다. 이 프로젝트는 node 환경(SSR 컴파일)이라
//   효과가 돌지 않는다. 그 회귀는 tests/component 의 planDraftStore.svelte.test.ts 가 잡는다.

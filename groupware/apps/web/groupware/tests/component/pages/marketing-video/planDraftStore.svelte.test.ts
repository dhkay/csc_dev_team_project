/**
 * 초안 스토어를 효과 안에서 쓰는 경로
 *
 * 생성 폼은 적는 동안 늘 저장한다($effect). 그 갱신이 같은 상태를 추적하며 읽으면 자기 쓰기가 자기
 * 의존을 무효화해 효과가 끝없이 다시 돌고(effect_update_depth_exceeded) 화면이 멈춘다. 폼이 넘기는
 * 값은 매번 새 객체라(`updatedAt`) 그 되돌기가 스스로 멎지도 않는다.
 *
 * 계약(무엇이 저장되고 무엇이 제거되는가)은 unit 쪽 planDraftStore.test.ts 가 잠근다. 여기서는
 * 효과가 실제로 도는 환경이 필요한 것만 본다(unit 프로젝트는 node 환경이라 효과가 no-op 이다).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

const { runDraftAutosave } = await import('./_draftAutosave.svelte');
const { planDraftStore } = await import(
  '$lib/pages/tools/marketing-video/create/planDraftStore.svelte'
);
const { draftsKey, hasContent } = await import(
  '$lib/pages/tools/marketing-video/create/planDraft'
);
type PlanDraft = Parameters<typeof hasContent>[0];

function makeDraft(sceneBrief: string): PlanDraft {
  return {
    id: 'typing',
    updatedAt: 1,
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

describe('적는 동안 늘 저장하기', () => {
  it('입력마다 한 번씩만 돈다', () => {
    // 되돌기가 생기면 이 호출이 effect_update_depth_exceeded 로 터진다.
    const key = draftsKey('v1.5', 1);
    const edits = [makeDraft('첫'), makeDraft('첫 줄'), makeDraft('첫 줄을 적는다')];

    expect(runDraftAutosave(key, edits)).toBe(edits.length);
    expect(planDraftStore.list(key).map((d) => d.sceneBrief)).toEqual(['첫 줄을 적는다']);
  });

  it('폼을 비우면 그 자리에서 사라진다', () => {
    // 제거도 같은 경로를 지난다. 여기서 되돌면 지우는 순간 화면이 멈춘다.
    const key = draftsKey('v1.5', 2);
    const edits = [makeDraft('적었다'), makeDraft('   ')];

    expect(runDraftAutosave(key, edits)).toBe(edits.length);
    expect(planDraftStore.list(key)).toEqual([]);
  });
});

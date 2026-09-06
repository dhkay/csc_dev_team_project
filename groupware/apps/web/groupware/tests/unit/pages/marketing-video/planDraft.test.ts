/**
 * 생성 폼 초안의 보존 규칙
 *
 * 세 가지가 깨지면 조용히 손해가 난다. 빈 폼까지 초안으로 세면 열어 보기만 해도 탭이 생겨 본문이
 * 늘 좁아지고, 채널 칸이 갈리지 않으면 다른 채널에서 적던 것이 이 채널 폼에 뜨며, 하나가 깨졌다고
 * 목록째 버리면 여러 개를 적어 둔 사람이 그 전부를 잃는다.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

const store = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { draftsKey, draftSummary, hasContent, loadDrafts, newDraftId, saveDrafts } = await import(
  '$lib/pages/tools/marketing-video/create/planDraft'
);
type PlanDraft = Parameters<typeof hasContent>[0];

function makeDraft(overrides: Partial<PlanDraft> = {}): PlanDraft {
  return {
    id: 'd1',
    updatedAt: 1_700_000_000_000,
    mode: 'concept',
    brandName: null,
    concepts: [],
    purposeKeywords: [],
    proposalCount: 1,
    sceneCount: 3,
    excludeInfographic: false,
    sceneBrief: '',
    constraints: '',
    videoModel: '',
    segmentMode: 'sequential',
    ...overrides,
  } as PlanDraft;
}

const KEY = draftsKey('v1.5', 5);

beforeEach(() => store.clear());

describe('초안인가', () => {
  it('사람이 적거나 고른 것이 있어야 초안이다', () => {
    expect(hasContent(makeDraft({ sceneBrief: '동영상1: ...' }))).toBe(true);
    expect(hasContent(makeDraft({ constraints: '자막 없이' }))).toBe(true);
    expect(hasContent(makeDraft({ purposeKeywords: ['보습'] }))).toBe(true);
  });

  it('폼이 스스로 채우는 값은 초안으로 세지 않는다', () => {
    // 브랜드와 연출 조합과 영상 모델은 창이 열리면서 저장값으로 채워진다. 그것까지 세면
    // 열어 보기만 하고 닫아도 초안 탭이 생긴다.
    expect(hasContent(makeDraft({ brandName: '정관장', videoModel: 'gemini/veo-3.1' }))).toBe(false);
    expect(hasContent(makeDraft({ sceneBrief: '   \n ' }))).toBe(false);
  });
});

describe('탭에 적을 한 줄', () => {
  it('적은 지시의 첫 줄이 가장 먼저다', () => {
    const summary = draftSummary(
      makeDraft({ sceneBrief: '\n  겨울 신제품 소개  \n둘째 줄', purposeKeywords: ['보습'] }),
    );
    expect(summary).toBe('겨울 신제품 소개');
  });

  it('적은 것이 없으면 고른 키워드가 대신한다', () => {
    expect(draftSummary(makeDraft({ purposeKeywords: ['보습', '수분'] }))).toBe('보습');
  });

  it('초안이 아니면 null 이다(그때는 탭도 없다)', () => {
    expect(draftSummary(makeDraft())).toBeNull();
    expect(draftSummary(null)).toBeNull();
  });
});

describe('여러 개 저장과 복원', () => {
  it('초안을 여러 개 적어 두고 각자 되찾는다', () => {
    // 하나만 두면 새 영상을 만들려고 창을 여는 순간 앞서 적던 것이 지워진다.
    saveDrafts(KEY, [
      makeDraft({ id: 'a', sceneBrief: '첫째', updatedAt: 1 }),
      makeDraft({ id: 'b', sceneBrief: '둘째', updatedAt: 2 }),
    ]);

    const restored = loadDrafts(KEY);
    expect(restored.map((d) => d.id)).toEqual(['b', 'a']);
    expect(restored.map((d) => d.sceneBrief)).toEqual(['둘째', '첫째']);
  });

  it('최근 손댄 것이 앞이다(탭 순서가 그 순서다)', () => {
    saveDrafts(KEY, [
      makeDraft({ id: 'old', sceneBrief: '오래된', updatedAt: 10 }),
      makeDraft({ id: 'new', sceneBrief: '최근', updatedAt: 20 }),
    ]);
    expect(loadDrafts(KEY)[0].id).toBe('new');
  });

  it('내용 없는 초안은 저장하지 않고, 남을 것이 없으면 칸을 비운다', () => {
    // 따로 지우는 자리를 두지 않는다. 폼을 비우거나 제출하면 그 자체로 초안이 사라져야 한다.
    saveDrafts(KEY, [makeDraft({ id: 'a', sceneBrief: '적어 둔 것' }), makeDraft({ id: 'b' })]);
    expect(loadDrafts(KEY).map((d) => d.id)).toEqual(['a']);

    saveDrafts(KEY, [makeDraft({ id: 'a' })]);
    expect(loadDrafts(KEY)).toEqual([]);
    expect(store.has(KEY)).toBe(false);
  });

  it('깨진 항목만 버리고 나머지는 살린다', () => {
    store.set(
      KEY,
      JSON.stringify([
        { id: 'broken' },
        makeDraft({ id: 'ok', sceneBrief: '성한 것' }),
        '문자열',
      ]),
    );
    expect(loadDrafts(KEY).map((d) => d.id)).toEqual(['ok']);
  });

  it('목록이 아닌 값은 빈 목록으로 읽는다', () => {
    store.set(KEY, '{ 깨진 json');
    expect(loadDrafts(KEY)).toEqual([]);
    store.set(KEY, JSON.stringify({ id: 'a' }));
    expect(loadDrafts(KEY)).toEqual([]);
  });

  it('채널과 버전마다 칸이 갈린다', () => {
    // 두 워크스페이스는 별개 제품이다. 한 칸을 나눠 쓰면 다른 채널에서 적던 것이 이 폼에 뜬다.
    expect(draftsKey('v1.5', 5)).not.toBe(draftsKey('v1.5', 6));
    expect(draftsKey('v1.5', 5)).not.toBe(draftsKey('v1.0', 5));
  });
});

describe('초안 id', () => {
  it('부를 때마다 다른 값이다', () => {
    // 새로고침을 넘어 남으므로 세션 안에서만 유일한 카운터는 쓸 수 없다.
    expect(newDraftId()).not.toBe(newDraftId());
  });
});

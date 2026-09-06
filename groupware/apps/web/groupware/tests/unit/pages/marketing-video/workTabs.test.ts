/**
 * 끝내지 않은 작업 → 하단 탭 변환 규칙
 *
 * 이 탭이 생성 창으로 돌아가는 유일한 길이다. 라벨이 비거나 id 를 되읽지 못하면 눌러도 아무 일이
 * 일어나지 않고, 사용자는 만든 영상을 배치하지 못한 채 잃는다. 조용한 실패라 테스트로 잡는다.
 *
 * 종류별 생성기는 밖으로 내보내지 않는다. 조립 함수를 지나야 순서와 포함 규칙까지 함께 잠긴다.
 */
import { describe, expect, it } from 'vitest';
import {
  composeWorkTabs,
  tabIdOf,
  targetFromTabId,
  type WorkTabSources,
} from '$lib/pages/tools/marketing-video/shared/workTabs';
import type { GenerationProgress } from '$lib/pages/tools/marketing-video/generationProgress';
import type { GenerationBatch } from '$lib/shared/lib/stores/planGenerationStore/planGenerationStore.svelte';
import type { PlanDraft } from '$lib/pages/tools/marketing-video/create/planDraft';
import type {
  PlanGenerationRequest,
  VideoProject,
} from '$lib/features/marketing-channels/types';

const REQ: PlanGenerationRequest = {
  brandName: '',
  concepts: [],
  purposeKeywords: [],
  proposalCount: 1,
  sceneCount: 3,
  excludeInfographic: false,
};

function makeBatch(overrides: Partial<GenerationBatch> = {}): GenerationBatch {
  return {
    id: 1,
    channelId: 10,
    req: REQ,
    startedAt: 1_700_000_000_000,
    savedPlanIds: [],
    projectId: null,
    draftId: null,
    ...overrides,
  };
}

function makeProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return { id: 7, title: '겨울 신제품', createdAt: '2026-01-01T00:00:00Z', ...overrides } as VideoProject;
}

function makeDraft(overrides: Partial<PlanDraft> = {}): PlanDraft {
  return {
    id: 'd1',
    updatedAt: 1,
    mode: 'concept',
    brandName: null,
    concepts: [],
    purposeKeywords: [],
    proposalCount: 1,
    sceneCount: 3,
    excludeInfographic: false,
    sceneBrief: '적어 둔 것',
    constraints: '',
    videoModel: '',
    segmentMode: 'sequential',
    ...overrides,
  } as PlanDraft;
}

function progress(overrides: Partial<GenerationProgress> = {}): GenerationProgress {
  return { stage: 'SEGMENT_GENERATING', startedAt: 0, segments: [], ...overrides };
}

/** 재료 기본값: 아무것도 없는 상태. 각 테스트가 필요한 것만 채운다 */
function compose(overrides: Partial<WorkTabSources> = {}) {
  return composeWorkTabs({
    projects: [],
    batches: [],
    drafts: [],
    editingDraftId: null,
    submittedDraftIds: new Set<string>(),
    previewRunning: false,
    projectProgress: () => progress(),
    batchProgress: () => progress(),
    ...overrides,
  });
}

describe('탭 id', () => {
  it('작업을 되읽는다', () => {
    const targets = [
      { kind: 'draft', draftId: 'd1' },
      { kind: 'preview' },
      { kind: 'batch', batchId: 3 },
      { kind: 'project', projectId: 42 },
    ] as const;
    for (const target of targets) {
      expect(targetFromTabId(tabIdOf(target)), tabIdOf(target)).toEqual(target);
    }
  });

  it('종류가 다른 id 를 섞어 읽지 않는다', () => {
    // 이 줄이 여러 종류를 함께 담으므로, 남의 항목을 배치로 오인하면 있지도 않은 배치를 열려고 든다.
    expect(targetFromTabId('batch:abc')).toBeNull();
    expect(targetFromTabId('video:7')).toBeNull();
    expect(targetFromTabId('')).toBeNull();
  });
});

describe('목록과 순서', () => {
  it('돌고 있는 것 먼저, 적어 둔 것 나중이다', () => {
    // 급한 쪽이 손에 가깝다.
    const items = compose({
      projects: [makeProject({ id: 7 })],
      batches: [makeBatch({ id: 3 })],
      drafts: [makeDraft({ id: 'd1' })],
      previewRunning: true,
    });

    expect(items.map((i) => i.id)).toEqual(['project:7', 'batch:3', 'draft:d1', 'preview']);
  });

  it('담을 것이 없으면 빈 목록이다(그때는 바가 렌더되지 않는다)', () => {
    expect(compose()).toEqual([]);
  });
});

describe('작업 탭', () => {
  it('돌고 있으면 진행률을 배지로 보인다', () => {
    const [tab] = compose({
      batches: [makeBatch()],
      batchProgress: () =>
        progress({
          segments: [
            { order: 1, status: 'done' },
            { order: 2, status: 'waiting' },
          ],
        }),
    });

    expect(tab.busy).toBe(true);
    expect(tab.badge).toBe(`${tab.percent}%`);
    expect(tab.percent).toBeGreaterThan(0);
    expect(tab.percent).toBeLessThan(100);
  });

  it('완료된 작업은 남기고 눌러야 할 이유를 적는다', () => {
    // 배치를 확정하기 전에는 만든 영상이 어느 목록에도 없다. 여기서 걷으면 그 영상을 잃는다.
    const [tab] = compose({
      projects: [makeProject()],
      projectProgress: () => progress({ stage: 'COMPLETED' }),
    });

    expect(tab.busy).toBe(false);
    expect(tab.badge).toBe('결과 확인');
    expect(tab.percent).toBe(100);
  });

  it('프로젝트는 서버가 지은 제목을 쓴다', () => {
    // 새로고침 뒤에는 이 탭이 그 작업을 아는 유일한 근거가 서버 행이다.
    expect(compose({ projects: [makeProject()] })[0].label).toBe('겨울 신제품');
    expect(compose({ projects: [makeProject({ title: '  ' })] })[0].label).toBe('영상 생성');
  });

  it('배치는 고른 브랜드를, 없으면 적은 지시의 첫 줄을 쓴다', () => {
    const brand = compose({ batches: [makeBatch({ req: { ...REQ, brandName: '  정관장  ' } })] });
    expect(brand[0].label).toBe('정관장');

    const brief = compose({
      batches: [makeBatch({ req: { ...REQ, sceneBrief: '\n\n  겨울 신제품 소개  \n둘째 줄' } })],
    });
    expect(brief[0].label).toBe('겨울 신제품 소개');

    // 둘 다 없으면 무엇을 하는 중인지만 적는다(배치 번호는 화면 어디에도 없어 뜻이 없다)
    expect(compose({ batches: [makeBatch()] })[0].label).toBe('영상 생성');
  });

  it('라벨이 잘려도 원문과 지금 단계를 올려 둔다', () => {
    const [tab] = compose({
      batches: [makeBatch({ req: { ...REQ, brandName: '정관장' } })],
      batchProgress: () => progress({ stage: 'MERGING' }),
    });
    expect(tab.title).toBe('정관장 (영상 병합)');
  });
});

describe('초안 탭', () => {
  it('여러 초안이 각자 선다', () => {
    // 하나만 두면 새로 만들려고 창을 여는 순간 앞서 적던 것이 지워진다.
    const items = compose({
      drafts: [makeDraft({ id: 'a', sceneBrief: '첫째' }), makeDraft({ id: 'b', sceneBrief: '둘째' })],
    });
    expect(items.map((i) => i.label)).toEqual(['첫째', '둘째']);
  });

  it('편집 중인 초안만 뺀다', () => {
    // 열려 있는 창이 곧 그 초안이다. 나머지는 남겨 창을 여닫을 때 줄 높이가 요동치지 않게 한다.
    const items = compose({
      drafts: [makeDraft({ id: 'a', sceneBrief: '첫째' }), makeDraft({ id: 'b', sceneBrief: '둘째' })],
      editingDraftId: 'a',
    });
    expect(items.map((i) => i.id)).toEqual(['draft:b']);
  });

  it('제출한 초안은 그 작업의 탭이 대표한다', () => {
    // 제출한 입력을 지우지 않고 두는 이유는 새로고침으로 배치가 사라졌을 때 적은 것이 남아 폼이
    //   다시 서기 때문이다. 그렇다고 둘 다 세우면 한 작업이 탭 둘로 보인다.
    const items = compose({
      batches: [makeBatch({ id: 3, draftId: 'a' })],
      drafts: [makeDraft({ id: 'a', sceneBrief: '제출한 것' }), makeDraft({ id: 'b', sceneBrief: '적던 것' })],
      submittedDraftIds: new Set(['a']),
    });

    expect(items.map((i) => i.id)).toEqual(['batch:3', 'draft:b']);
  });

  it('적어 둔 것이 없는 초안은 세우지 않는다', () => {
    expect(compose({ drafts: [makeDraft({ sceneBrief: '   ' })] })).toEqual([]);
  });

  it('진행률을 갖지 않는다', () => {
    // 아직 아무것도 돌지 않는다. 퍼센트를 적으면 시작한 것처럼 읽힌다.
    const [tab] = compose({ drafts: [makeDraft()] });
    expect(tab.percent).toBeUndefined();
    expect(tab.busy).toBeUndefined();
    expect(tab.badge).toBe('작성 중');
  });

  it('그 자리에서 끝낼 수 있는 것은 초안뿐이다', () => {
    // 돌고 있는 유료 생성을 바에서 한 번에 끊게 하지 않는다. 되돌릴 수 없어 확인을 거쳐야 하고,
    // 그 자리는 창 안의 '생성 취소' 다.
    const items = compose({
      projects: [makeProject()],
      batches: [makeBatch()],
      drafts: [makeDraft()],
      previewRunning: true,
    });
    expect(items.filter((i) => i.closable).map((i) => i.id)).toEqual(['draft:d1']);
  });
});

/**
 * 끝내지 않은 영상 작업 → 하단 탭(BottomTabItem)
 *
 * 이 파일이 두 어휘 사이의 유일한 번역이다. 바는 라벨과 배지만 알고(도메인을 모른다), 작업은
 * 초안과 배치와 프로젝트로 말한다. 컴포넌트 안에서 옮기면 같은 규칙이 바와 진행 화면에 각각 생겨
 * 따로 낡는다. 순수 함수만 둬서 라벨과 배지 규칙을 테스트가 통째로 잠근다.
 *
 * 탭이 있는 이유: 창을 닫아도 하던 일은 계속되는데 돌아갈 길이 없었다. 이 버전은 완성본을 마지막에
 * 배치해야 워크스페이스에 서므로, 돌아가지 못한다는 것은 만든 영상을 잃는다는 뜻이다.
 *
 * 무엇이 하나의 작업인가는 아래 네 가지이고, 그 근거가 어디에 있느냐가 새로고침 생존을 가른다.
 *
 * | 종류      | 근거                          | 새로고침 |
 * |-----------|-------------------------------|----------|
 * | draft     | 세션 저장소의 초안(여럿)      | 남는다   |
 * | project   | 서버의 미배치 영상 프로젝트   | 남는다   |
 * | batch     | 라이브 배치(메모리)           | 사라진다 |
 * | preview   | dev 목 진행(메모리)           | 사라진다 |
 *
 * batch 는 프로젝트가 생기기 전의 짧은 구간만 대표한다. 프로젝트가 생기면 그쪽이 같은 작업의
 * 대표가 되므로(호출부가 그때 batch 를 뺀다) 한 작업이 탭 둘로 보이지 않는다.
 *
 * 같은 이유로 **제출된 초안도 탭을 갖지 않는다.** 그 입력을 지우지 않고 두는 이유는 배치가 새로고침을
 * 넘기지 못해서다. 배치가 사라지면 그 초안이 다시 탭으로 서고 폼도 적은 그대로 다시 선다.
 */
import type { PlanGenerationRequest, VideoProject } from '$lib/features/marketing-channels/types';
import { draftSummary, type PlanDraft } from '../create/planDraft';
import type { GenerationBatch } from '$lib/shared/lib/stores/planGenerationStore/planGenerationStore.svelte';
import type { BottomTabItem } from '$lib/shared/ui/navigation/bottomTab.types';
import { isComplete, overallPercent, stageLabel, type GenerationProgress } from '../generationProgress';

/**
 * 하단 탭이 가리키는 작업. 창은 이 값 하나로 무엇을 열지 정한다.
 *
 * 탭 id 문자열을 그대로 넘기지 않는 이유는 해석을 한 곳에 두기 위해서다. 문자열을 여기저기서
 * 쪼개기 시작하면 접두사를 하나 더할 때 그 조각들이 따로 낡는다.
 */
export type WorkTarget =
  | { kind: 'draft'; draftId: string }
  | { kind: 'batch'; batchId: number }
  | { kind: 'project'; projectId: number }
  | { kind: 'preview' };

const PREFIX = { draft: 'draft:', batch: 'batch:', project: 'project:' } as const;
const PREVIEW_ID = 'preview';

/**
 * 작업 → 탭 id
 *
 * switch 로 쓰는 이유는 종류가 늘 때다. if 사슬의 마지막을 미리보기로 두면 새 종류가 조용히
 * 미리보기 id 를 받아, 그 탭을 누른 사람이 남의 화면을 열게 된다. 여기서는 빠뜨리면 컴파일이 막는다.
 */
export function tabIdOf(target: WorkTarget): string {
  switch (target.kind) {
    case 'draft':
      return `${PREFIX.draft}${target.draftId}`;
    case 'batch':
      return `${PREFIX.batch}${target.batchId}`;
    case 'project':
      return `${PREFIX.project}${target.projectId}`;
    case 'preview':
      return PREVIEW_ID;
  }
}

/** 탭 id → 작업. 모르는 형식이면 null(호출부가 무시한다) */
export function targetFromTabId(tabId: string): WorkTarget | null {
  if (tabId === PREVIEW_ID) return { kind: 'preview' };
  if (tabId.startsWith(PREFIX.draft)) {
    // 초안 id 는 숫자가 아니다(새로고침을 넘으므로 세션 카운터를 쓰지 않는다)
    const draftId = tabId.slice(PREFIX.draft.length);
    return draftId.length > 0 ? { kind: 'draft', draftId } : null;
  }
  for (const [kind, prefix] of [
    ['batch', PREFIX.batch],
    ['project', PREFIX.project],
  ] as const) {
    if (!tabId.startsWith(prefix)) continue;
    const id = Number(tabId.slice(prefix.length));
    if (!Number.isInteger(id)) return null;
    return kind === 'batch' ? { kind, batchId: id } : { kind, projectId: id };
  }
  return null;
}

/**
 * 무엇을 만드는 중인지 한 줄로. 고른 브랜드가 있으면 그것이 주제이고, 없으면 적은 지시의 첫 줄이다.
 *
 * 둘 다 없을 수 있다. 그때 배치 번호를 적지 않는 이유는 그 번호가 화면 어디에도 없어 사용자에게
 * 아무 뜻이 없기 때문이다. 탭이 여럿이면 진행률로 구분된다.
 */
function workLabel(req: Pick<PlanGenerationRequest, 'brandName' | 'sceneBrief'>): string {
  const brand = req.brandName?.trim();
  if (brand) return brand;
  const firstLine = req.sceneBrief
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine || '영상 생성';
}

/**
 * 돌고 있는(또는 끝났지만 배치하지 않은) 작업 하나
 *
 * 완료된 것도 남긴다. 그 상태가 곧 "받아 갈 것이 있다" 이고, 배치를 확정하기 전에는 만든 영상이
 * 어느 목록에도 없다. 배지가 '결과 확인' 으로 바뀌어 눌러야 할 이유를 말한다.
 */
function workTab(target: WorkTarget, label: string, progress: GenerationProgress): BottomTabItem {
  const done = isComplete(progress);
  const percent = overallPercent(progress);
  return {
    id: tabIdOf(target),
    label,
    badge: done ? '결과 확인' : `${percent}%`,
    percent,
    busy: !done,
    // 라벨은 좁아 잘린다. 원문과 지금 단계를 함께 담아 두면 무엇이 어디쯤인지 바로 읽힌다.
    title: `${label} (${stageLabel(progress.stage)})`,
  };
}

/** 라이브 배치의 탭(아직 서버에 프로젝트가 없는 구간) */
function batchTab(batch: GenerationBatch, progress: GenerationProgress): BottomTabItem {
  return workTab({ kind: 'batch', batchId: batch.id }, workLabel(batch.req), progress);
}

/** 미배치 영상 프로젝트의 탭. 제목은 서버가 지은 것이라 그대로 쓴다 */
function projectTab(project: VideoProject, progress: GenerationProgress): BottomTabItem {
  return workTab(
    { kind: 'project', projectId: project.id },
    project.title.trim() || '영상 생성',
    progress,
  );
}

/**
 * 작성 중인 초안의 탭. 진행률이 없다(아직 아무것도 돌지 않는다)
 *
 * 초안마다 하나씩 선다. 영상 작업은 여러 개를 동시에 가져가는 일이고 그 시작점이 초안이라,
 * 새로 만들려고 창을 열어도 앞서 적던 것이 지워지지 않는다.
 *
 * 빈 폼은 초안이 아니다. 열어 보기만 하고 닫은 창까지 탭으로 남으면, 담긴 것 없는 줄이 늘 깔려
 * 본문만 좁아진다. 무엇을 적었는지는 호출부가 요약해 넘긴다.
 *
 * 닫기(×)를 갖는 유일한 탭이다. 여기서 끝낸다는 것은 적어 둔 것을 버린다는 뜻이고 그 판단은 이
 * 줄에서 끝난다. 돌고 있는 생성은 그렇지 않다: 끊는 것은 유료 작업을 되돌릴 수 없게 버리는 일이라
 * 확인을 거쳐야 하고, 그 자리는 창 안의 '생성 취소' 다.
 */
function draftTab(draftId: string, summary: string): BottomTabItem {
  return {
    id: tabIdOf({ kind: 'draft', draftId }),
    label: summary,
    badge: '작성 중',
    // 설명을 따로 두지 않는다. 바가 라벨을 그대로 올려 주고, 상태는 배지가 옆에서 이미 말한다.
    //   작업 탭이 설명을 갖는 이유는 그쪽 배지가 진행률이라 단계 이름이 화면 어디에도 없기 때문이다.
    closable: true,
  };
}

/**
 * dev 진행 화면 미리보기가 앉는 자리
 *
 * 그 흐름은 배치도 프로젝트도 만들지 않는다(끊을 생성이 없다). 그것만 탭 밖에 두면 dev 에서
 * '닫고 되돌아오기' 를 확인할 길이 사라지는데, 그 확인이 미리보기의 존재 이유다.
 */
function previewTab(): BottomTabItem {
  return { id: tabIdOf({ kind: 'preview' }), label: '진행 화면 미리보기', badge: 'dev' };
}

/**
 * 탭을 세우는 재료. 무엇이 하나의 작업인지는 셸이 정하고(어느 목록에서 오는가), 순서와 포함 규칙은
 * 여기서 정한다. 종류가 늘 때 고칠 자리를 한 곳으로 모으는 것이 이 경계의 목적이다.
 */
export interface WorkTabSources {
  // 아직 배치하지 않은 서버 작업(최신 순)
  projects: readonly VideoProject[];
  // 아직 서버에 프로젝트가 없는 배치(기획안을 만드는 구간)
  batches: readonly GenerationBatch[];
  // 적어 둔 초안(최근 순)
  drafts: readonly PlanDraft[];
  // 창이 지금 편집 중인 초안. 그 하나만 뺀다(창이 곧 그 초안이다). 창이 닫혀 있으면 null
  editingDraftId: string | null;
  // 이미 제출된 초안(살아 있는 배치가 가리키는 것). 그 작업의 탭이 이미 대표하므로 따로 세우지
  //   않는다. 제출한 입력을 지우지 않고 두는 이유는 새로고침으로 배치가 사라졌을 때 적은 것이
  //   남아 있어야 폼이 다시 서기 때문이다.
  submittedDraftIds: ReadonlySet<string>;
  // dev 진행 화면 미리보기가 도는 중인가(호출부가 dev 여부까지 판단해 넘긴다)
  previewRunning: boolean;
  // 그 작업의 진행 값. 창이 쓰는 것과 같은 번역(renderProgress)을 지나야 같은 수를 말한다
  projectProgress: (project: VideoProject) => GenerationProgress;
  batchProgress: (batch: GenerationBatch) => GenerationProgress;
}

/**
 * 재료 → 하단 탭 목록
 *
 * 순서는 돌고 있는 것 먼저, 적어 둔 것 나중이다. 급한 쪽이 손에 가깝다. 비어 있으면 빈 배열이고
 * 그때는 바 자체가 렌더되지 않는다.
 */
export function composeWorkTabs(sources: WorkTabSources): BottomTabItem[] {
  const items: BottomTabItem[] = [];
  for (const project of sources.projects) {
    items.push(projectTab(project, sources.projectProgress(project)));
  }
  for (const batch of sources.batches) {
    items.push(batchTab(batch, sources.batchProgress(batch)));
  }
  for (const draft of sources.drafts) {
    if (draft.id === sources.editingDraftId) continue;
    if (sources.submittedDraftIds.has(draft.id)) continue;
    const summary = draftSummary(draft);
    if (summary) items.push(draftTab(draft.id, summary));
  }
  if (sources.previewRunning) items.push(previewTab());
  return items;
}

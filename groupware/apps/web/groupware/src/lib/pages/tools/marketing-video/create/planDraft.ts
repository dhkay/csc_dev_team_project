/**
 * 생성 폼의 초안: 창을 닫거나 새로고침해도 적어 둔 것이 남는다.
 *
 * 창을 닫는 것과 취소하는 것을 이미 갈라 뒀다(취소해도 입력은 남는다). 그 약속이 새로고침에서
 * 깨지고 있었다. 폼 값이 컴포넌트 상태뿐이라 탭을 새로 그리는 순간 통째로 사라진다.
 *
 * **초안은 여럿이다.** 하나만 두면 새 영상을 만들려고 창을 여는 순간 앞서 적던 것이 지워진다.
 * 영상 작업은 여러 개를 동시에 가져가는 일이고(생성도 그렇다) 그 작업의 시작점이 초안이라,
 * 초안도 각자 id 를 갖고 각자 탭을 갖는다.
 *
 * 세션 저장소를 쓰는 이유는 수명이 그 약속과 같기 때문이다. 이 도구는 새 탭으로 열리고, 그 탭을
 * 닫는 것은 사람이 이 작업을 접은 것이다. 브라우저를 다시 켰을 때까지 남으면 언제 적었는지 모르는
 * 입력이 폼에 들어와 있다.
 *
 * 채널과 버전마다 따로 둔다. 두 워크스페이스는 별개 제품이라(주소가 갈린다) 한 칸을 나눠 쓰면
 * 다른 채널에서 적던 것이 이 채널 폼에 뜬다.
 */
import { browser } from '$app/environment';
import type { ConceptChoice } from '$lib/features/marketing-channels/types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { CreateMode } from '../versionProfile';
import type { SegmentMode } from '../planComposeOptions';

/** 초안 하나. 폼 값 전부 + 그것을 가리키는 id */
export interface PlanDraft {
  // 이 초안을 가리키는 값. 탭 id 와 창의 편집 대상이 이것으로 이어진다.
  id: string;
  // 마지막으로 손댄 시각(epoch ms). 탭 순서가 이 값을 따른다(최근 것이 손에 가깝게)
  updatedAt: number;
  mode: CreateMode;
  brandName: string | null;
  concepts: ConceptChoice[];
  purposeKeywords: string[];
  proposalCount: number;
  sceneCount: number;
  excludeInfographic: boolean;
  sceneBrief: string;
  constraints: string;
  videoModel: string;
  segmentMode: SegmentMode;
}

/** 저장 칸 이름. 채널과 버전으로 갈라 다른 워크스페이스의 입력이 섞이지 않게 한다 */
export function draftsKey(version: VersionMode, channelId: number | null): string {
  return `csc:marketing-video:drafts:${version}:${channelId ?? 'none'}`;
}

/** 새 초안 id. 새로고침을 넘어 남으므로 세션 안에서만 유일한 카운터는 쓰지 않는다 */
export function newDraftId(): string {
  return browser && typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `d${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 사람이 적거나 고른 것이 있는가. 없으면 초안이 아니다.
 *
 * 브랜드와 연출 조합과 영상 모델은 보지 않는다. 셋 다 폼이 열리면서 저장값으로 스스로 채워지므로,
 * 그것까지 세면 창을 열어 보기만 하고 닫아도 초안이 생긴다. 사람이 실제로 손댄 자리는 셋이다.
 */
export function hasContent(draft: PlanDraft): boolean {
  return (
    draft.sceneBrief.trim().length > 0 ||
    draft.constraints.trim().length > 0 ||
    draft.purposeKeywords.length > 0
  );
}

/**
 * 하단 탭에 적을 한 줄. 무엇을 적던 중이었는지 가장 잘 말하는 값을 고른다.
 * 내용이 없으면 null 이고, 그때는 저장도 탭도 없다.
 */
export function draftSummary(draft: PlanDraft | null | undefined): string | null {
  if (!draft || !hasContent(draft)) return null;
  const firstLine = draft.sceneBrief
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine || draft.purposeKeywords[0] || draft.brandName?.trim() || '작성 중인 입력';
}

/** 최근 손댄 것이 앞. 탭 순서가 이 순서다 */
function byRecent(drafts: readonly PlanDraft[]): PlanDraft[] {
  return [...drafts].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 저장. 내용 있는 초안만 남기고, 남을 것이 없으면 칸을 비운다.
 * 저장소를 쓸 수 없는 환경(시크릿 모드 등)에서는 조용히 넘어간다. 초안 보존은 편의이지 정확성이 아니다.
 */
export function saveDrafts(key: string, drafts: readonly PlanDraft[]): void {
  if (!browser) return;
  const kept = byRecent(drafts.filter(hasContent));
  try {
    if (kept.length === 0) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(kept));
  } catch {
    // 저장하지 못해도 폼은 그대로 동작한다. 잃는 것은 새로고침 뒤의 이어 쓰기뿐이다.
  }
}

/**
 * 복원. 없거나 깨졌으면 빈 목록.
 *
 * 항목 단위로 검사해 성한 것만 남긴다. 하나가 깨졌다고 나머지까지 버리면, 여러 개를 적어 둔 사람이
 * 그 전부를 잃는다.
 */
export function loadDrafts(key: string): PlanDraft[] {
  if (!browser) return [];
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return byRecent(parsed.filter(isDraft).filter(hasContent));
  } catch {
    return [];
  }
}

/** 모양이 바뀐 옛 초안을 그대로 폼에 밀어 넣지 않는다. 최소한의 형태만 확인한다 */
function isDraft(value: unknown): value is PlanDraft {
  const draft = value as PlanDraft | null;
  return (
    !!draft &&
    typeof draft.id === 'string' &&
    draft.id.length > 0 &&
    typeof draft.updatedAt === 'number' &&
    typeof draft.sceneBrief === 'string' &&
    typeof draft.constraints === 'string' &&
    Array.isArray(draft.purposeKeywords)
  );
}

// 포커스 키워드 선택 규칙(순수 함수): 키워드 검색 화면의 고르기/합치기를 화면 밖에서 정의한다.
// 컴포넌트에 두면 브라우저 없이는 검증할 수 없고, 상한/중복/순서 같은 규칙이 마크업 사이에 흩어진다.
// 백엔드 상한(FOCUS_KEYWORD_MAX)과 같은 값을 쓰며, 넘겨 보내면 서버가 400 으로 막는다(이중 방어)
import type { FocusKeywordCandidate } from '$lib/features/marketing-channels/types';

/** 한 채널에서 고를 수 있는 목적 키워드 수. 백엔드 FOCUS_KEYWORD_MAX 와 같은 값 */
export const FOCUS_KEYWORD_MAX = 5;

/** 상한에 닿았는가(더 고를 수 없는 상태: 나머지 후보의 선택 버튼을 잠근다) */
export function isSelectionFull(selected: readonly string[]): boolean {
  return selected.length >= FOCUS_KEYWORD_MAX;
}

/**
 * 선택 토글: 이미 고른 값이면 빼고, 아니면 뒤에 붙인다(고른 순서 = 표시 순서 = 프롬프트 순서)
 * 상한에 닿았으면 새로 고르는 것만 막는다. 해제는 언제나 된다(막으면 바꿀 방법이 없어진다)
 */
export function toggleFocusKeyword(selected: readonly string[], value: string): string[] {
  if (selected.includes(value)) return selected.filter((v) => v !== value);
  if (isSelectionFull(selected)) return [...selected];
  return [...selected, value];
}

/**
 * 후보 목록 합치기: 이미 고른 것을 위에 두고 새 후보를 뒤에 붙인다(중복 제거)
 *
 * 검색할 때마다 목록을 통째로 갈면 고른 것이 사라져 5개를 모으는 도중에 매번 처음으로 돌아간다.
 * 고른 것은 출처 라벨을 그대로 유지한 채 남는다(수집값이 재검색 후 생성값으로 둔갑하면 안 된다)
 */
export function mergeFocusCandidates(
  current: readonly FocusKeywordCandidate[],
  selected: readonly string[],
  incoming: readonly FocusKeywordCandidate[],
): FocusKeywordCandidate[] {
  const kept = selected.flatMap((keyword) => {
    const found = current.find((c) => c.keyword === keyword);
    return found ? [found] : [{ keyword, origin: 'edited' as const }];
  });
  const keptKeys = new Set(kept.map((c) => c.keyword));
  return [...kept, ...incoming.filter((c) => !keptKeys.has(c.keyword))];
}

/** 후보 목록과 선택 상태를 한 덩어리로 다룬다(편집은 둘을 동시에 바꾼다) */
export interface FocusKeywordList {
  candidates: FocusKeywordCandidate[];
  selected: string[];
}

/** 수정 실패 사유. 화면은 이 값으로 안내 문구를 고른다(문구를 규칙 안에 두지 않는다) */
export type RenameFailure = 'empty' | 'duplicate';

/** 직접 추가 실패 사유 */
export type AddFailure = 'empty' | 'selected' | 'full';

export type AddResult =
  | { ok: true; list: FocusKeywordList }
  | { ok: false; reason: AddFailure };

/**
 * 작업자가 직접 써 넣은 키워드를 목록에 넣고 바로 고른다.
 *
 * 손으로 친다는 것은 곧 그 말을 쓰겠다는 뜻이라, 넣기만 하고 고르지 않으면 한 번 더 눌러야 한다.
 * 그래서 추가와 선택을 한 동작으로 묶는다.
 *
 * - 이미 목록에 있으면 새 줄을 만들지 않고 그것을 고른다(같은 말이 두 줄이면 어느 쪽을 고른
 *   것인지 화면에서 구분되지 않는다). 이미 고른 말이면 할 일이 없으므로 알린다.
 * - 상한에 닿았으면 넣지 않는다. 직접 입력이라고 예외를 두면 상한이 상한이 아니게 되고, 서버가
 *   400 으로 막아 저장 직전에야 알게 된다.
 * - 출처는 `edited` 다. 수집된 말도 모델이 만든 말도 아니다.
 */
export function addManualKeyword(list: FocusKeywordList, value: string): AddResult {
  const keyword = value.trim();
  if (keyword.length === 0) return { ok: false, reason: 'empty' };
  if (list.selected.includes(keyword)) return { ok: false, reason: 'selected' };
  if (isSelectionFull(list.selected)) return { ok: false, reason: 'full' };

  const exists = list.candidates.some((c) => c.keyword === keyword);
  return {
    ok: true,
    list: {
      // 새 말이면 맨 위에 둔다(방금 넣은 것을 찾으러 스크롤하지 않게)
      candidates: exists
        ? list.candidates
        : [{ keyword, origin: 'edited' as const }, ...list.candidates],
      selected: [...list.selected, keyword],
    },
  };
}

export type RenameResult =
  | { ok: true; list: FocusKeywordList }
  | { ok: false; reason: RenameFailure };

/**
 * 후보 이름 수정. 목록에 이미 있는 말로는 바꾸지 못한다.
 *
 * 막는 이유: 같은 말이 두 줄이 되면 어느 쪽을 고른 것인지 화면에서 구분되지 않고, 보낼 때
 * 서버가 중복을 접어 개수가 조용히 줄어든다(고른 5개가 4개가 된다)
 * 자기 자신으로의 수정(공백만 바뀐 경우 포함)은 중복이 아니라 그대로 통과시킨다.
 *
 * 자리와 선택 상태는 유지한다. 고쳐 쓴다고 목록 끝으로 밀려나거나 선택이 풀리면 다시 찾아야 한다.
 *
 * 출처는 `edited` 로 바뀐다. 사람이 손댄 말은 더 이상 수집된 검색어도 모델이 만든 말도 아니다.
 * 라벨을 그대로 두면 "실제로 이렇게 검색된다"는 거짓을 화면이 계속 주장하게 된다.
 */
export function renameFocusCandidate(
  list: FocusKeywordList,
  from: string,
  to: string,
): RenameResult {
  const next = to.trim();
  if (next.length === 0) return { ok: false, reason: 'empty' };
  if (next !== from && list.candidates.some((c) => c.keyword === next)) {
    return { ok: false, reason: 'duplicate' };
  }
  return {
    ok: true,
    list: {
      candidates: list.candidates.map((c) =>
        c.keyword === from ? { keyword: next, origin: 'edited' as const } : c,
      ),
      selected: list.selected.map((v) => (v === from ? next : v)),
    },
  };
}

/** 후보 삭제: 목록에서 빼고, 골라 둔 것이면 선택도 함께 푼다(유령 선택 방지) */
export function removeFocusCandidate(
  list: FocusKeywordList,
  value: string,
): FocusKeywordList {
  return {
    candidates: list.candidates.filter((c) => c.keyword !== value),
    selected: list.selected.filter((v) => v !== value),
  };
}

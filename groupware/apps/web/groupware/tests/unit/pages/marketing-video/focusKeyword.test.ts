import { describe, it, expect } from 'vitest';
import {
  FOCUS_KEYWORD_MAX,
  isSelectionFull,
  toggleFocusKeyword,
  mergeFocusCandidates,
  renameFocusCandidate,
  removeFocusCandidate,
  addManualKeyword,
} from '$lib/pages/tools/marketing-video/focusKeyword';
import type { FocusKeywordCandidate } from '$lib/features/marketing-channels/types';

// 키워드 생성 화면의 고르기 규칙: 상한, 순서, 중복, "다시 검색해도 고른 것은 남는다",
// 그리고 출처 라벨이 거짓이 되지 않는다(수집값을 손대면 더 이상 수집값이 아니다)
// 화면 없이 검증할 수 있어야 규칙이 마크업 수정에 휩쓸리지 않는다.

const full = Array.from({ length: FOCUS_KEYWORD_MAX }, (_, i) => `키워드${i}`);

/** 수집 후보(실측). 소스와 검색량을 달고 온다. */
const collected = (keyword: string, monthlySearches?: number): FocusKeywordCandidate => ({
  keyword,
  origin: 'collected',
  source: { key: 'NAVER_AD_KEYWORD', label: '네이버 검색광고' },
  monthlySearches,
});
/** 보완 후보(모델이 지어낸 말) */
const generated = (keyword: string): FocusKeywordCandidate => ({ keyword, origin: 'generated' });

describe('포커스 키워드 선택', () => {
  it('고른 순서대로 뒤에 붙는다(저장 순서 = 표시 순서)', () => {
    const a = toggleFocusKeyword([], '수분크림');
    const b = toggleFocusKeyword(a, '보습');
    expect(b).toEqual(['수분크림', '보습']);
  });

  it('이미 고른 값은 해제된다', () => {
    expect(toggleFocusKeyword(['수분크림', '보습'], '수분크림')).toEqual(['보습']);
  });

  it(`${FOCUS_KEYWORD_MAX}개를 채우면 더 고르지 못한다`, () => {
    expect(isSelectionFull(full)).toBe(true);
    expect(toggleFocusKeyword(full, '하나 더')).toEqual(full);
  });

  it('상한에 닿아도 해제는 된다(막으면 바꿀 방법이 없어진다)', () => {
    expect(toggleFocusKeyword(full, full[0])).toEqual(full.slice(1));
  });
});

describe('후보 합치기', () => {
  it('고른 것을 위에 두고 새 후보를 뒤에 붙인다', () => {
    const current = [collected('수분크림', 5000)];
    const merged = mergeFocusCandidates(current, ['수분크림'], [
      generated('보습'),
      generated('진정크림'),
    ]);
    expect(merged.map((c) => c.keyword)).toEqual(['수분크림', '보습', '진정크림']);
  });

  it('이미 고른 값이 후보에 또 오면 한 번만 남는다', () => {
    const current = [collected('수분크림')];
    const merged = mergeFocusCandidates(current, ['수분크림'], [
      generated('수분크림'),
      generated('보습'),
    ]);
    expect(merged.map((c) => c.keyword)).toEqual(['수분크림', '보습']);
  });

  it('다시 검색해도 고른 것은 사라지지 않는다', () => {
    const current = [collected('수분크림'), collected('보습')];
    const merged = mergeFocusCandidates(current, ['수분크림', '보습'], [generated('전혀 다른 후보')]);
    expect(merged.map((c) => c.keyword)).toEqual(['수분크림', '보습', '전혀 다른 후보']);
  });

  it('고른 수집값은 다시 검색해도 출처와 검색량을 유지한다', () => {
    // 라벨이 재검색 때마다 뒤집히면 화면이 실측을 추정으로 둔갑시킨다.
    const current = [collected('수분크림', 5000)];
    const merged = mergeFocusCandidates(current, ['수분크림'], [generated('보습')]);
    expect(merged[0]).toEqual(current[0]);
  });
});

describe('직접 추가', () => {
  const list = () => ({
    candidates: [collected('수분크림 추천'), generated('겨울 보습')],
    selected: ['수분크림 추천'],
  });

  it('넣는 즉시 고른 것으로 친다(맨 위에 놓는다)', () => {
    const r = addManualKeyword(list(), '신제품 수분크림');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.list.candidates[0]).toEqual({ keyword: '신제품 수분크림', origin: 'edited' });
    expect(r.list.selected).toEqual(['수분크림 추천', '신제품 수분크림']);
  });

  it('앞뒤 공백은 정리한다', () => {
    const r = addManualKeyword(list(), '  신제품  ');
    expect(r.ok && r.list.candidates[0].keyword).toBe('신제품');
  });

  it('목록에 이미 있으면 새 줄을 만들지 않고 그것을 고른다', () => {
    // 같은 말이 두 줄이면 어느 쪽을 고른 것인지 화면에서 구분되지 않는다.
    const r = addManualKeyword(list(), '겨울 보습');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.list.candidates).toHaveLength(2);
    expect(r.list.selected).toEqual(['수분크림 추천', '겨울 보습']);
    // 출처 라벨도 그대로다(고르는 행위가 그 말의 출처를 바꾸지 않는다)
    expect(r.list.candidates[1].origin).toBe('generated');
  });

  it('이미 고른 말은 알린다', () => {
    expect(addManualKeyword(list(), '수분크림 추천')).toEqual({
      ok: false,
      reason: 'selected',
    });
  });

  it('빈 값은 넣지 못한다', () => {
    expect(addManualKeyword(list(), '   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it(`상한(${FOCUS_KEYWORD_MAX}개)에 닿으면 직접 입력도 막는다`, () => {
    // 직접 입력이라고 예외를 두면 상한이 상한이 아니게 되고, 서버가 400 으로 막아
    //   저장 직전에야 알게 된다.
    const full5 = { candidates: full.map((k) => generated(k)), selected: [...full] };
    expect(addManualKeyword(full5, '하나 더')).toEqual({ ok: false, reason: 'full' });
  });
});

describe('후보 수정', () => {
  const list = {
    candidates: [collected('수분크림', 5000), collected('보습'), generated('진정크림')],
    selected: ['수분크림'],
  };

  it('자리와 선택 상태를 유지한 채 이름만 바뀐다', () => {
    const r = renameFocusCandidate(list, '수분크림', '수분 크림');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.list.candidates.map((c) => c.keyword)).toEqual(['수분 크림', '보습', '진정크림']);
    expect(r.list.selected).toEqual(['수분 크림']);
  });

  it('수정한 후보는 출처가 직접 입력으로 바뀐다', () => {
    // 사람이 손댄 말은 더 이상 검색된 말이 아니다. 수집 라벨을 유지하면 화면이 거짓을 주장한다.
    const r = renameFocusCandidate(list, '수분크림', '수분 크림');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.list.candidates[0]).toEqual({ keyword: '수분 크림', origin: 'edited' });
  });

  it('앞뒤 공백은 정리해서 저장한다', () => {
    const r = renameFocusCandidate(list, '보습', '  보습 케어  ');
    expect(r.ok && r.list.candidates[1].keyword).toBe('보습 케어');
  });

  it('목록에 이미 있는 말로는 바꾸지 못한다', () => {
    expect(renameFocusCandidate(list, '보습', '진정크림')).toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });

  it('자기 자신으로의 수정은 중복이 아니다(공백만 다른 경우 포함)', () => {
    const r = renameFocusCandidate(list, '보습', ' 보습 ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.list.candidates.map((c) => c.keyword)).toEqual(
      list.candidates.map((c) => c.keyword),
    );
  });

  it('빈 값으로는 바꾸지 못한다', () => {
    expect(renameFocusCandidate(list, '보습', '   ')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('후보 삭제', () => {
  const list = () => ({
    candidates: [collected('수분크림'), generated('보습')],
    selected: ['수분크림'],
  });

  it('목록에서 빼고, 골라 둔 것이면 선택도 함께 풀린다', () => {
    const next = removeFocusCandidate(list(), '수분크림');
    expect(next.candidates.map((c) => c.keyword)).toEqual(['보습']);
    expect(next.selected).toEqual([]);
  });

  it('고르지 않은 것을 지워도 선택은 그대로다', () => {
    const next = removeFocusCandidate(list(), '보습');
    expect(next.candidates.map((c) => c.keyword)).toEqual(['수분크림']);
    expect(next.selected).toEqual(['수분크림']);
  });
});

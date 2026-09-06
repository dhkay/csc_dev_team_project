// 포커스 키워드의 형식 규칙: 입력 키워드를 품은 롱테일
// 지켜야 하는 곳이 둘(channel-settings 의 수집 검색어, plan-generation 의 모델 보완분)이라 여기 한 곳에 둠

/** 비교용 정규화(공백 제거 + 소문자). 검색어는 띄어쓰기가 흔들려도 같은 말 */
export function normalizeKeywordForm(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

/**
 * 입력 키워드의 롱테일 여부: 그 말을 통째로 품고 그 말보다 길다.
 * 띄어쓰기는 무시. 씨앗 자신과 씨앗보다 짧은 말은 롱테일이 아님
 */
export function isLongTailOf(candidate: string, seed: string): boolean {
  const a = normalizeKeywordForm(candidate);
  const b = normalizeKeywordForm(seed);
  if (!a || !b) return false;
  return a.includes(b) && a.length > b.length;
}

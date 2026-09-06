// 세트가 스스로 더한 카테고리(축)와 레퍼런스(옵션). 저장 자리는 세트 객체 안

// 커스텀 key 형식: `x:` + 소문자 hex 4~32
const CUSTOM_CONCEPT_KEY_PATTERN = /^x:[0-9a-f]{4,32}$/;

/** 커스텀 key 판정, 기본 축 key 사칭 방지 */
export function isCustomConceptKey(value: string): boolean {
  return CUSTOM_CONCEPT_KEY_PATTERN.test(value);
}

/** 세트가 더한 카테고리(축) 하나 */
export interface CustomConceptAxis {
  // 이름이 바뀌어도 유지되는 값이라 기존 선택 보존
  key: string;
  label: string;
}

/** 세트가 더한 레퍼런스(옵션) 하나 */
export interface CustomConceptOption {
  // 기본 축 key 또는 커스텀 축 key
  axis: string;
  key: string;
  // 칩 표시명, 그대로 프롬프트의 값으로 나감
  label: string;
  // 감독 노트. 설명 패널 표시 + 프롬프트의 note(생략 가능)
  description: string;
}

/** 커스텀 정의를 담는 세트의 최소 형태(구조적 타입) */
export interface CustomConceptSource {
  customAxes?: CustomConceptAxis[];
  customOptions?: CustomConceptOption[];
}

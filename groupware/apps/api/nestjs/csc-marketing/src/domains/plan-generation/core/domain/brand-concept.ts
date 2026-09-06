import { BRAND_CONCEPT_AXES, ConceptSelection } from '../../../channel-settings/core/domain';

export type { ConceptSelection };

/**
 * 컨셉 축의 프롬프트 렌더링. 축 이름과 선택지 문구는 카탈로그가 소유하고 문장 변환 규칙만 여기 있음
 * 표기 순서도 카탈로그 배열을 따름(목록을 따로 두면 화면과 프롬프트의 축 이름이 갈림)
 * 카탈로그에 없는 축은 axis key 를 이름으로 쓰고 뒤에 붙음
 */
function axisRank(axis: string): number {
  const i = BRAND_CONCEPT_AXES.findIndex((a) => a.key === axis);
  return i === -1 ? BRAND_CONCEPT_AXES.length : i;
}

/** 축의 화면 이름. 카탈로그에 없으면 key 그대로. 프롬프트가 축을 부를 때도 이 이름을 쓴다 */
export function axisLabel(axis: string): string {
  return BRAND_CONCEPT_AXES.find((a) => a.key === axis)?.label ?? axis;
}

/**
 * 컨셉 축 한 줄("라벨: 값, 감독 노트"). 빈 컨셉은 빈 문자열
 * 축 이름은 선택에 실려 온 axisLabel 을 먼저 씀(커스텀 축은 카탈로그로 이름을 알 수 없어 key 가 나감)
 * 기본 축은 이 값이 비어 있어 카탈로그 이름을 그대로 사용
 */
export function conceptLine(c: ConceptSelection | undefined): string {
  if (!c || !c.label) return '';
  const name = c.axisLabel || axisLabel(c.axis);
  return `${name}: ${c.label}${c.note ? `, ${c.note}` : ''}`;
}

/** 축별 컨셉 줄 목록: 카탈로그 축 순서로 정렬(미지 축은 원래 순서대로 뒤에), 라벨 없는 축은 제외 */
export function conceptLines(concepts: ConceptSelection[]): string[] {
  return [...concepts]
    .sort((a, b) => axisRank(a.axis) - axisRank(b.axis))
    .map((c) => conceptLine(c))
    .filter((line) => line.length > 0);
}

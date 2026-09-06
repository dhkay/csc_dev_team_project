// 세트 스코프 컨셉 해석기: 선택(axis/option) → 화면과 프롬프트에 나갈 문구
// 카탈로그만 보는 resolveConceptText 로는 세트가 스스로 더한 축과 옵션을 풀 수 없음
import { BRAND_CONCEPT_AXES, resolveConceptText } from './brand-concept-catalog.types';
import type { CustomConceptSource } from './custom-concept.types';

// (축, 옵션) 쌍의 조회 키. key 에 슬래시가 들어올 수 없어 경계가 모호해지지 않음
function conceptMapKey(axis: string, option: string): string {
  return `${axis}/${option}`;
}

/** 해석된 컨셉 문구 */
export interface ResolvedConceptText {
  label: string;
  note: string;
  // 커스텀 축일 때만 채움(기본 축은 카탈로그가 앎)
  axisLabel?: string;
}

/** 선택 하나를 문구로 바꾸는 함수. 카탈로그에도 세트에도 없으면 null */
export type ConceptResolver = (axis: string, option: string) => ResolvedConceptText | null;

/**
 * 그 세트의 커스텀 정의까지 아는 해석기 생성
 * 세트가 없거나 커스텀이 없으면 카탈로그만 보는 해석기와 동일 동작
 */
export function createConceptResolver(source: CustomConceptSource | null | undefined): ConceptResolver {
  const customAxisLabels = new Map((source?.customAxes ?? []).map((a) => [a.key, a.label]));
  const customOptions = new Map(
    (source?.customOptions ?? []).map((o) => [conceptMapKey(o.axis, o.key), o]),
  );

  return (axis, option) => {
    if (!axis || !option) return null;

    // 카탈로그 먼저. 기본 제공은 커스텀이 덮을 수 없음
    const fromCatalog = resolveConceptText(axis, option);
    if (fromCatalog) return fromCatalog;

    const custom = customOptions.get(conceptMapKey(axis, option));
    if (!custom) return null;

    // 축이 커스텀이면 이름을 함께 실음. 기본 축이면 축 이름은 카탈로그가 앎
    const axisLabel = customAxisLabels.get(axis);
    return {
      label: custom.label,
      note: custom.description,
      ...(axisLabel ? { axisLabel } : {}),
    };
  };
}

/** 축 key 의 카탈로그 기본 축 여부. 커스텀 정의의 기본 축 사칭 방지 판정용 */
export function isCatalogAxis(axis: string): boolean {
  return BRAND_CONCEPT_AXES.some((a) => a.key === axis);
}

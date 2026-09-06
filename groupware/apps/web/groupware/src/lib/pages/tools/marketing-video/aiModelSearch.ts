// 모델 선택 목록의 표현 규칙: 선택지가 몇 개일 때 어떻게 그리고, 검색이 무엇을 찾는가
//
// 화면(.svelte) 밖에 두는 이유는 테스트가 닿게 하려는 것이다. 검색이 조용히 어긋나면 "분명히
// 카탈로그에 있는데 검색으로는 안 나오는 모델" 이 되고, 그건 목록이 길어진 뒤에야 드러난다.
// api-credentials 의 features/api-credentials/lib/providerSearch.ts 와 같은 형태다.

import type { AiModelOption } from './aiModelOptions';

/**
 * 이보다 많으면 격자 위에 검색과 요약 한 줄을 얹는다.
 *
 * 격자 자체는 바뀌지 않는다. 제공자 → 회사 → 타일이라는 모양을 버전마다 다르게 하면 같은 도구가
 * 두 개처럼 보인다. 갈리는 것은 찾는 수단이 필요한가뿐이다.
 *
 * 버전이 아니라 개수로 가른다. 버전으로 짜면 다른 버전의 선택지가 늘어나는 날 같은 문제를 다시
 * 겪고 버전 분기를 하나 더 넣게 된다. 화면이 감당해야 하는 것은 개수다.
 *
 * 지금 카탈로그는 어느 역량도 이 값을 넘지 않는다(`aiModelSearch.test.ts` 가 고정한다).
 */
export const DENSE_LIST_THRESHOLD = 6;

/** 이 역량에 검색을 붙일 것인가 */
export function usesDenseList(options: readonly AiModelOption[]): boolean {
  return options.length > DENSE_LIST_THRESHOLD;
}

/**
 * 표시명, 회사, 설명, 카탈로그 key 로 찾는다. 빈 검색어는 전부 통과
 *
 * 회사를 넣는 이유: 여러 회사가 섞인 목록에서 사람이 먼저 떠올리는 것이 "Kling" 처럼 만든 회사인
 * 경우가 많다. key 를 넣는 이유는 그것이 곧 엔드포인트 경로라, 벤더 문서를 보고 온 사람이
 * 경로 조각('seedance', 'text-to-video')으로 찾을 수 있어서다.
 */
export function matchesModelQuery(option: AiModelOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    option.label.toLowerCase().includes(q) ||
    option.vendor.toLowerCase().includes(q) ||
    option.description.toLowerCase().includes(q) ||
    option.key.toLowerCase().includes(q)
  );
}

/**
 * 검색에 걸린 모델만 남긴다. 카탈로그 순서는 그대로 유지된다.
 *
 * 묶기(제공자, 회사)는 하지 않는다. 화면이 이미 그 두 축으로 그리고 있고, 여기서 또 묶으면 같은
 * 규칙이 두 곳에 생긴다. 이 모듈이 아는 것은 "무엇이 검색에 걸리는가" 하나다.
 * 결과가 비면 일치 항목이 없는 것이다(화면이 그때 안내를 띄운다)
 */
export function filterModels(
  options: readonly AiModelOption[],
  query: string,
): AiModelOption[] {
  return options.filter((o) => matchesModelQuery(o, query));
}

/**
 * 이 목록의 모델이 전부 같은 경로로 닿으면 그 표기, 아니면 null.
 *
 * 같은 사실을 타일마다 반복하지 않기 위한 판정이다. 섞여 있으면 null 을 주고 타일마다 적는다.
 * 그때는 어느 것이 어느 경로인지가 실제 정보다.
 *
 * 호출부는 요약 줄을 실제로 그릴 때만 이 판정을 쓴다. 그리지 않는데 타일에서 빼면 그 사실을
 * 어디에서도 말하지 않는 화면이 된다.
 *
 * 표기 해석은 호출부가 넘긴다. 이 모듈은 자격증명 카탈로그를 알 필요가 없다.
 */
export function sharedRouteLabel(
  options: readonly AiModelOption[],
  viaOf: (option: AiModelOption) => string | null,
): string | null {
  if (options.length === 0) return null;
  const first = viaOf(options[0]);
  if (first === null) return null;
  return options.every((o) => viaOf(o) === first) ? first : null;
}

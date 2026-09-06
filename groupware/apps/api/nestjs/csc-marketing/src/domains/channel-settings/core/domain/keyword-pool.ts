// 키워드 후보 풀 규칙: 수집한 검색어 중 입력 키워드를 품은 롱테일만 남김
// 인기 검색어 소스는 씨앗과 무관한 말을 주므로(`아기 발진` 검색에 `탄핵`) 이 필터가 없으면
// '수집' 라벨을 단 목록의 계약이 깨짐. 형식 판정은 보완분과 같은 잣대를 쓰도록 공유 커널에 둠
import {
  isLongTailOf,
  normalizeKeywordForm as normalize,
} from '../../../../shared/domain/keyword-form';

/** 후보 한 건 */
export interface CollectedKeyword {
  keyword: string;
  // 화면 라벨에 쓰는 출처
  sourceKey: string;
  sourceLabel: string;
  // 그 값을 주는 소스에서만. 고를 근거로 화면에 표시
  monthlySearches?: number;
}

/**
 * 여러 소스의 수집 결과를 하나의 후보 목록으로 병합
 * 입력 키워드를 품지 않는 것은 버리고, 같은 말은 먼저 온 소스가 이기며,
 * 검색량을 아는 것을 앞에 두고 그 안에서는 많은 순으로 정렬
 */
export function mergeCollectedKeywords(
  seed: string,
  collected: CollectedKeyword[],
): CollectedKeyword[] {
  const seen = new Set<string>();
  const merged: CollectedKeyword[] = [];
  for (const item of collected) {
    const key = normalize(item.keyword);
    if (!key || seen.has(key)) continue;
    if (!isLongTailOf(item.keyword, seed)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.sort((a, b) => (b.monthlySearches ?? -1) - (a.monthlySearches ?? -1));
}

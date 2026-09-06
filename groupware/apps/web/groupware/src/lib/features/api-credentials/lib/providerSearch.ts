// 프로바이더 검색 규칙: 등록 화면 목록이 무엇을 걸러 보여주는가
//
// 화면(.svelte) 밖에 두는 이유는 테스트가 닿게 하려는 것이다. 검색이 조용히 어긋나면
// "분명히 있는데 검색으로는 안 나오는 프로바이더" 가 되고, 그건 목록이 길어진 뒤에야 드러난다.

import {
  API_PROVIDER_KIND_META,
  API_PROVIDER_KINDS,
  apiProvidersByKind,
  type ApiProviderKind,
  type ApiProviderMeta
} from '../types';

/** 구분 하나와 그 구분에서 검색에 걸린 프로바이더 */
export interface ProviderGroup {
  kind: ApiProviderKind;
  items: ApiProviderMeta[];
}

/**
 * 표시명, 카탈로그 key, 설명, 구분 이름으로 찾는다. 빈 검색어는 전부 통과
 *
 * 설명까지 보는 이유: 회사 이름이 표시명에 없는 경우가 있다('Grok API' 로는 'xAI' 가 안 잡히고
 * 'Claude API' 로는 'Anthropic' 이 안 잡힌다). 그 이름은 설명에 있으므로 별칭 목록을 따로 만들지
 * 않아도 된다(만들면 카탈로그 옆에 손으로 맞출 표가 하나 더 생긴다)
 */
export function matchesProviderQuery(meta: ApiProviderMeta, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    meta.label.toLowerCase().includes(q) ||
    meta.key.toLowerCase().includes(q) ||
    meta.description.toLowerCase().includes(q) ||
    API_PROVIDER_KIND_META[meta.kind].label.toLowerCase().includes(q)
  );
}

/**
 * 검색어에 걸린 프로바이더를 구분별로 묶는다. 카탈로그 순서를 유지하고, 일치 항목이 없는
 * 구분은 머리글째 빠진다(빈 머리글만 남으면 그 구분에 뭔가 있는 것처럼 보인다)
 * 결과가 빈 배열이면 일치 항목이 없는 것이다.
 */
export function searchProviderGroups(query: string): ProviderGroup[] {
  return API_PROVIDER_KINDS.map((kind) => ({
    kind,
    items: apiProvidersByKind(kind).filter((meta) => matchesProviderQuery(meta, query))
  })).filter((group) => group.items.length > 0);
}

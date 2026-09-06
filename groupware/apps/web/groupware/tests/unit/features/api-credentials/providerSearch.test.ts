// 등록 화면 검색 규칙. 여기가 깨지면 카탈로그에 있는 프로바이더가 검색으로는 나오지 않고,
// 그 사실은 목록이 길어진 뒤에야 드러난다.
import { describe, it, expect } from 'vitest';
import {
  matchesProviderQuery,
  searchProviderGroups
} from '$lib/features/api-credentials/lib/providerSearch';
import { API_PROVIDER_CATALOG, findApiProvider } from '$lib/features/api-credentials/types';

const anthropic = findApiProvider('ANTHROPIC')!;
const higgsfield = findApiProvider('HIGGSFIELD')!;

describe('matchesProviderQuery', () => {
  it('빈 검색어는 전부 통과한다', () => {
    expect(matchesProviderQuery(anthropic, '')).toBe(true);
    expect(matchesProviderQuery(anthropic, '   ')).toBe(true);
  });

  it('표시명으로 찾는다', () => {
    expect(matchesProviderQuery(anthropic, 'claude')).toBe(true);
  });

  it('카탈로그 key 로 찾는다(대소문자 무관)', () => {
    expect(matchesProviderQuery(anthropic, 'anthropic')).toBe(true);
    expect(matchesProviderQuery(higgsfield, 'HIGGS')).toBe(true);
  });

  it('표시명에 없는 회사 이름을 설명에서 찾는다', () => {
    // 'Grok API' 라는 표시명만 보면 'xAI' 로는 못 찾는다. 별칭 표를 따로 두지 않는 근거다.
    expect(matchesProviderQuery(findApiProvider('XAI')!, 'xai')).toBe(true);
  });

  it('구분 이름으로 그 갈래 전체를 찾는다', () => {
    expect(matchesProviderQuery(higgsfield, '플랫폼')).toBe(true);
    expect(matchesProviderQuery(anthropic, '플랫폼')).toBe(false);
  });

  it('어디에도 없는 말은 걸리지 않는다', () => {
    expect(matchesProviderQuery(anthropic, 'zzz-없는말')).toBe(false);
  });
});

describe('searchProviderGroups', () => {
  it('빈 검색어면 카탈로그 전부를 구분별로 묶는다', () => {
    const groups = searchProviderGroups('');
    expect(groups.flatMap((g) => g.items).length).toBe(API_PROVIDER_CATALOG.length);
    expect(groups.map((g) => g.kind)).toEqual(['VENDOR', 'PLATFORM']);
  });

  it('일치 항목이 없는 구분은 머리글째 빠진다', () => {
    // 빈 머리글만 남으면 그 구분에 뭔가 있는 것처럼 보인다.
    const groups = searchProviderGroups('claude');
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('VENDOR');
    expect(groups[0].items.map((m) => m.key)).toEqual(['ANTHROPIC']);
  });

  it('구분 이름으로 검색하면 그 갈래만 남는다', () => {
    const groups = searchProviderGroups('플랫폼');
    expect(groups.map((g) => g.kind)).toEqual(['PLATFORM']);
  });

  it('일치가 없으면 빈 배열이다(화면은 이때 안내를 띄운다)', () => {
    expect(searchProviderGroups('zzz-없는말')).toEqual([]);
  });
});

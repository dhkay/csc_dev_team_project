import { describe, it, expect, vi } from 'vitest';

// 워크스페이스 상단의 '기획안 텍스트 생성중…' 은 페이지가 useIsFetching({ queryKey: ['marketing-plans'] })
// 로 쿼리 캐시에 직접 물어 띄운다. 즉 이 키 접두사가 표시의 유일한 연결고리라, 접두사가 바뀌면
// 표시가 조용히 사라진다(에러 없이). 그 연결을 고정한다.
// 버전이 index 1 인 것도 같은 이유다: 버전을 맨 앞에 두면 접두사가 깨진다.
vi.mock('$lib/infrastructure/http/clientInstances', () => ({ frontClient: vi.fn() }));

import { generatePlansQueryOptions } from '$lib/features/marketing-channels/queries/plans.query';

/** 페이지가 useIsFetching 에 넘기는 필터 접두사(MarketingVideoPage 와 동일해야 한다) */
const STATUS_FILTER_PREFIX = ['marketing-plans'] as const;

describe('기획서 생성 쿼리 키', () => {
  const req = {
    brandName: 'csc',
    // 연출 조합도 요청의 일부다: 조합만 바꿔 다시 뽑으면 별개 생성이어야 한다(아래 회귀)
    concepts: [{ axis: 'mood' as const, option: 'warm-cozy' }],
    purposeKeywords: ['수분크림'],
    proposalCount: 2,
    sceneCount: 4,
    excludeInfographic: false,
  };

  it('상단 진행 표시가 쓰는 접두사로 시작한다', () => {
    const key = generatePlansQueryOptions('v1.5', 5, req, 0).queryKey;
    expect(key.slice(0, STATUS_FILTER_PREFIX.length)).toEqual([...STATUS_FILTER_PREFIX]);
  });

  it('요청과 runId 가 키에 들어가 배치마다 별개 생성이 된다', () => {
    const a = generatePlansQueryOptions('v1.5', 5, req, 0).queryKey;
    const b = generatePlansQueryOptions('v1.5', 5, req, 1).queryKey; // 다음 '기획서 생성'
    const c = generatePlansQueryOptions('v1.5', 5, { ...req, proposalCount: 3 }, 0).queryKey;
    // 연출 조합만 바꿔 다시 뽑는 것이 이 화면의 주 용도다. 조합이 키에 없으면 같은 결과가 재사용된다.
    const d = generatePlansQueryOptions(
      'v1.5',
      5,
      { ...req, concepts: [{ axis: 'mood' as const, option: 'bright-vivid' }] },
      0,
    ).queryKey;

    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).not.toEqual(d);
    expect(a).toEqual(generatePlansQueryOptions('v1.5', 5, req, 0).queryKey); // 같은 배치는 같은 키
  });

  it('버전이 다르면 별개 생성이다', () => {
    // 이 쿼리는 staleTime/gcTime 이 Infinity 다. 버전이 키에 없으면 한 버전에서 만든 배치가 다른
    //   버전에서 영원히 재사용된다(프롬프트 조립 규칙이 갈리는데도)
    const v15 = generatePlansQueryOptions('v1.5', 5, req, 0).queryKey;
    const v10 = generatePlansQueryOptions('v1.0', 5, req, 0).queryKey;
    expect(v15).not.toEqual(v10);
  });
});

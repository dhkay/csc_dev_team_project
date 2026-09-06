import { describe, it, expect, vi } from 'vitest';

// 버전을 바꿀 때 화면의 브랜드/컨셉이 새 버전 것으로 갈리는 유일한 연결고리가 이 쿼리 키다.
// 버전이 키의 축이라 전환이 곧 다른 키 공간이고 무효화가 아예 필요 없다.
// 축이 빠지면 전환할 때마다 손으로 무효화해야 하고 그 목록에서 자원이 빠진다.
vi.mock('$lib/infrastructure/http/clientInstances', () => ({ frontClient: vi.fn() }));

import {
  brandConceptKeys,
  myBrandConceptQueryOptions,
} from '$lib/features/marketing-channels/queries/brandConcept.query';

describe('브랜드/컨셉 쿼리 키', () => {
  it('조회 옵션이 키 팩토리와 같은 키를 쓴다', () => {
    expect(myBrandConceptQueryOptions('v1.5').queryKey).toEqual(brandConceptKeys.mine('v1.5'));
  });

  it('키에 버전이 있고 채널은 없다', () => {
    // 채널이 들어가면 채널마다 캐시가 갈려 개인 스코프로 옮긴 의미가 사라진다.
    // 버전은 들어가야 한다: 두 버전은 연출 방향을 공유하지 않는 별개 슬롯이다.
    expect(brandConceptKeys.mine('v1.5')).toEqual(['marketing-my-brand-concept', 'v1.5']);
    expect(brandConceptKeys.mine('v1.0')).not.toEqual(brandConceptKeys.mine('v1.5'));
  });
});

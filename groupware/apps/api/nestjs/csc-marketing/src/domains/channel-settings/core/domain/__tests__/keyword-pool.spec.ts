import { CollectedKeyword, mergeCollectedKeywords } from '../keyword-pool';

/**
 * 키워드 후보 풀 규칙. 후보 목록의 계약은 "입력 키워드 + 단어" 형태
 * 무너지면 인기어가 '수집' 라벨을 달고 나가고 그 목록으로 뽑은 키워드가 롱테일이 아니게 됨
 */

const from = (
  keyword: string,
  sourceKey = 'NAVER_AD_KEYWORD',
  monthlySearches?: number,
): CollectedKeyword => ({
  keyword,
  sourceKey,
  sourceLabel: sourceKey,
  monthlySearches,
});

describe('mergeCollectedKeywords', () => {
  it('입력 키워드를 품은 것만 남긴다', () => {
    const merged = mergeCollectedKeywords('수분크림', [
      from('수분크림 추천'),
      from('올리브영수분크림'),
      from('속건조'),
      from('수딩젤'),
    ]);

    expect(merged.map((c) => c.keyword)).toEqual(['수분크림 추천', '올리브영수분크림']);
  });

  it('씨앗과 무관한 인기어를 버린다', () => {
    const merged = mergeCollectedKeywords('아기 발진', [
      from('아기 발진 연고'),
      from('탄핵', 'GOOGLE_TRENDS'),
      from('프로골퍼', 'NATE_REALTIME'),
    ]);

    expect(merged.map((c) => c.keyword)).toEqual(['아기 발진 연고']);
  });

  it('관련은 있어도 입력 키워드를 품지 않으면 버린다', () => {
    // 롱테일이 아님. 목록 형식이 갈리면 화면이 보장하는 것을 말할 수 없음
    expect(mergeCollectedKeywords('아기 발진', [from('기저귀 발진')])).toEqual([]);
  });

  it('띄어쓰기가 달라도 같은 말로 본다', () => {
    // 검색어는 띄어쓰기가 흔들린다. 여기서 갈리면 실제 검색어의 상당수가 이유 없이 버려진다.
    const merged = mergeCollectedKeywords('수분크림', [from('수분 크림 추천')]);

    expect(merged.map((c) => c.keyword)).toEqual(['수분 크림 추천']);
  });

  it('씨앗 자신과 씨앗보다 짧은 말은 후보가 아니다', () => {
    // 앞은 작업자가 이미 들고 있는 말이고, 뒤는 롱테일의 반대 방향이다.
    const merged = mergeCollectedKeywords('겨울 수분크림', [
      from('겨울 수분 크림'),
      from('수분크림'),
      from('겨울 수분크림 추천'),
    ]);

    expect(merged.map((c) => c.keyword)).toEqual(['겨울 수분크림 추천']);
  });

  it('같은 말이 여러 소스에서 오면 먼저 온 소스가 이긴다', () => {
    // 호출부가 신뢰도 순으로 넘긴다(연관 검색어 → 분야 인기 → 전체 실시간)
    const merged = mergeCollectedKeywords('수분크림', [
      from('수분크림 추천', 'NAVER_AD_KEYWORD', 500),
      from('수분크림 추천', 'GOOGLE_TRENDS'),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].sourceKey).toBe('NAVER_AD_KEYWORD');
  });

  it('검색량을 아는 것을 앞에, 그 안에서는 많은 순으로 둔다', () => {
    const merged = mergeCollectedKeywords('수분크림', [
      from('수분크림 순위', 'GOOGLE_TRENDS'),
      from('수분크림 추천', 'NAVER_AD_KEYWORD', 500),
      from('수분크림 후기', 'NAVER_AD_KEYWORD', 900),
    ]);

    expect(merged.map((c) => c.keyword)).toEqual([
      '수분크림 후기',
      '수분크림 추천',
      '수분크림 순위',
    ]);
  });

  it('씨앗이 비면 아무것도 남기지 않는다', () => {
    expect(mergeCollectedKeywords('', [from('수분크림 추천')])).toEqual([]);
  });
});

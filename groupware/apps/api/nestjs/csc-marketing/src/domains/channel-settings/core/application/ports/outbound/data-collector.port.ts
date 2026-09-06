import { CollectionStatus, DataSourceOptions } from '../inbound';

/** 키워드 원천 소스 한 곳의 조회 결과. 검색어를 직접 주는 소스만 이 형태 */
export interface KeywordPoolSnapshot {
  // 수집 서버가 첫 조회에 collecting 을 줌. 호출부가 대기/포기를 정하는 근거
  status: CollectionStatus;
  keywords: KeywordPoolItem[];
}

/** 키워드 후보 한 건 */
export interface KeywordPoolItem {
  keyword: string;
  // 그 값을 주는 소스에서만 채워짐
  monthlySearches?: number;
}

/**
 * 수집 서버 위임 포트. 이 서버는 수집하지 않고 물어본 것을 그대로 전달
 * 그래서 벤더 분류 코드나 보관 수가 이 서버 코드에 상수로 없음
 */
export interface DataCollectorPort {
  /** 씨앗 키워드의 연관 검색어와 월간 검색량(네이버 검색광고) */
  fetchAdKeywords(seed: string): Promise<KeywordPoolSnapshot>;

  /**
   * 분야 하나의 인기 검색어(네이버 쇼핑인사이트)
   * cid/period 는 opaque 문자열, 유효한 값은 getSourceOptions 가 준 목록뿐
   */
  fetchShoppingInsight(cid: string, period: string): Promise<KeywordPoolSnapshot>;

  /** 지역 인기 검색어(구글 트렌드) */
  fetchGoogleTrends(geo: string): Promise<KeywordPoolSnapshot>;

  /** 실시간 검색어(네이트). 고를 파라미터가 없는 소스 */
  fetchNateRealtime(): Promise<KeywordPoolSnapshot>;

  /** 소스별 수집 선택지(분야/기간) 중계. 도구는 이 응답 안에서만 값을 고름 */
  getSourceOptions(sourceId: string): Promise<DataSourceOptions>;
}

export const DATA_COLLECTOR_PORT = Symbol('DATA_COLLECTOR_PORT');

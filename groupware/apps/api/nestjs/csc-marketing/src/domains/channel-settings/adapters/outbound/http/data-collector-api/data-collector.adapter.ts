import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataCollectorApiClientService } from '../../../../../../shared/adapters/outbound/data-collector-api';
import {
  DataCollectorPort,
  KeywordPoolSnapshot,
} from '../../../../core/application/ports/outbound';
import {
  DataSourceOptions,
} from '../../../../core/application/ports/inbound';

/** 키워드 원천 소스의 공통 wire 형태(소스마다 목록 필드 이름만 다름) */
interface KeywordPoolResponse {
  status: 'ok' | 'collecting' | 'failed';
  keywords?: { keyword?: unknown; monthlySearches?: unknown }[];
}

/**
 * 쇼핑인사이트 wire 형태: 날짜별 버킷 안에 순위와 검색어
 * 최상위 `keywords` 가 없어 공통 헬퍼 사용 불가
 */
interface ShoppingInsightResponse {
  status: 'ok' | 'collecting' | 'failed';
  buckets?: { keywords?: { keyword?: unknown }[] }[];
}

/**
 * DataCollectorPort 구현: 수집 서버 위임(서비스토큰)
 * 이 서버에서 수집 서버 어휘를 아는 유일한 지점
 */
@Injectable()
export class DataCollectorAdapter implements DataCollectorPort {
  private readonly logger = new Logger(DataCollectorAdapter.name);

  constructor(private readonly client: DataCollectorApiClientService) {}

  fetchAdKeywords(seed: string): Promise<KeywordPoolSnapshot> {
    return this.keywordPool(
      `/searchad/keywords/latest?keyword=${encodeURIComponent(seed)}`,
      `연관 키워드(${seed})`,
    );
  }

  /**
   * 분야 하나의 인기 검색어. 날짜 버킷을 평탄화해 검색어 목록으로 반환
   * 버킷과 순위는 위로 올리지 않음(후보 병합이 쓰는 것은 검색어와 검색량뿐). 실패는 비파괴 degrade
   */
  async fetchShoppingInsight(cid: string, period: string): Promise<KeywordPoolSnapshot> {
    const what = `쇼핑인사이트 인기 검색어(${cid}/${period})`;
    try {
      const res = await this.client.get<ShoppingInsightResponse>(
        `/datalab/shopping-keywords/latest?cid=${encodeURIComponent(cid)}` +
          `&period=${encodeURIComponent(period)}`,
      );
      const buckets = Array.isArray(res?.buckets) ? res.buckets : [];
      return {
        status: res?.status ?? 'failed',
        keywords: buckets.flatMap((bucket) => {
          const rows = Array.isArray(bucket?.keywords) ? bucket.keywords : [];
          return rows.flatMap((row) => {
            const keyword = typeof row?.keyword === 'string' ? row.keyword.trim() : '';
            return keyword ? [{ keyword }] : [];
          });
        }),
      };
    } catch (err) {
      this.logger.warn(
        `data-collector ${what} 조회 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: 'failed', keywords: [] };
    }
  }

  fetchGoogleTrends(geo: string): Promise<KeywordPoolSnapshot> {
    return this.keywordPool(
      `/google/trends/latest?geo=${encodeURIComponent(geo)}`,
      `구글 트렌드(${geo})`,
    );
  }

  fetchNateRealtime(): Promise<KeywordPoolSnapshot> {
    return this.keywordPool('/nate/realtime-keywords/latest', '네이트 실시간 검색어');
  }

  /**
   * 키워드 원천 소스 공통 조회
   * 실패는 비파괴 degrade(status='failed', 빈 목록). 401 을 위로 올리면 BFF 가 세션 만료로 오인
   */
  private async keywordPool(path: string, what: string): Promise<KeywordPoolSnapshot> {
    try {
      const res = await this.client.get<KeywordPoolResponse>(path);
      const rows = Array.isArray(res?.keywords) ? res.keywords : [];
      return {
        status: res?.status ?? 'failed',
        keywords: rows.flatMap((row) => {
          const keyword = typeof row?.keyword === 'string' ? row.keyword.trim() : '';
          if (!keyword) return [];
          const searches =
            typeof row?.monthlySearches === 'number' ? row.monthlySearches : undefined;
          return [{ keyword, monthlySearches: searches }];
        }),
      };
    } catch (err) {
      this.logger.warn(
        `data-collector ${what} 조회 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: 'failed', keywords: [] };
    }
  }

  async getSourceOptions(sourceId: string): Promise<DataSourceOptions> {
    // 선택지도 카탈로그. 빈 목록 degrade 는 "분야가 없다"가 되어 그 소스가 조용히 누락됨
    return this.relay(
      () =>
        this.client.get<DataSourceOptions>(
          `/sources/${encodeURIComponent(sourceId)}/options`,
        ),
      '수집 선택지',
    );
  }

  private async relay<T>(call: () => Promise<T>, what: string): Promise<T> {
    try {
      return await call();
    } catch (err) {
      this.logger.warn(
        `data-collector ${what} 조회 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(`${what}을(를) 불러오지 못했습니다.`);
    }
  }
}

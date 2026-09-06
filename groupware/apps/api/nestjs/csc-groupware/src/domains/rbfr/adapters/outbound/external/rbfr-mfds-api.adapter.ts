/**
 * RbfrMfdsApiPort의 실제 구현. 식약처 화장품 원료성분정보 공공데이터포털을 직접 호출한다.
 * rbfr/개발지침/04 식약청API연동.md가 원본 스펙(엔드포인트/파라미터/응답 구조/함정).
 *
 * 인증키는 절대 코드/로그에 찍지 않는다 — ConfigService로만 읽고, 에러 메시지에도 URL 전체가
 * 아니라 상태코드만 남긴다(04번 문서 "인증키 취급" 절).
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MfdsIngredientRecord } from '../../../core/domain/types';
import type { RbfrMfdsApiPort } from '../../../core/application/ports/outbound';

const BASE_URL =
  'https://apis.data.go.kr/1471000/CsmtcsIngdCpntInfoService01/getCsmtcsIngdCpntInfoService01';

interface MfdsRawItem {
  INGR_KOR_NAME: string;
  INGR_ENG_NAME: string | null;
  CAS_NO: string | null;
  ORIGIN_MAJOR_KOR_NAME: string | null;
  INGR_SYNONYM: string | null;
}

interface MfdsRawResponse {
  header?: { resultCode?: string; resultMsg?: string };
  body?: { items?: MfdsRawItem[]; totalCount?: number };
}

function mapItem(raw: MfdsRawItem): MfdsIngredientRecord {
  return {
    nameKo: raw.INGR_KOR_NAME,
    nameEn: raw.INGR_ENG_NAME ?? undefined,
    casNo: raw.CAS_NO ?? undefined,
    originDesc: raw.ORIGIN_MAJOR_KOR_NAME ?? undefined,
    synonym: raw.INGR_SYNONYM ?? undefined,
  };
}

@Injectable()
export class RbfrMfdsApiAdapter implements RbfrMfdsApiPort {
  constructor(private readonly config: ConfigService) {}

  private get serviceKey(): string {
    const key = this.config.get<string>('RBFR_MFDS_API_KEY');
    if (!key) {
      throw new Error('RBFR_MFDS_API_KEY가 설정되지 않았습니다. 서버 .env를 확인하세요.');
    }
    return key;
  }

  private async call(params: Record<string, string | number>): Promise<MfdsRawResponse> {
    // serviceKey는 발급 시점에 이미 URL 인코딩돼 있다 — 다시 encodeURIComponent 하면 실패한다(04번 문서).
    const query = Object.entries({ ...params, serviceKey: this.serviceKey })
      .map(([k, v]) => (k === 'serviceKey' ? `${k}=${v}` : `${k}=${encodeURIComponent(String(v))}`))
      .join('&');

    const res = await fetch(`${BASE_URL}?${query}`);
    if (!res.ok) {
      throw new Error(`MFDS API 호출 실패(status ${res.status})`);
    }
    const body = (await res.json()) as MfdsRawResponse;
    if (body.header?.resultCode !== '00') {
      throw new Error(`MFDS API 오류: ${body.header?.resultMsg ?? '알 수 없는 오류'}`);
    }
    return body;
  }

  async searchByKoreanName(nameKo: string, numOfRows = 20): Promise<MfdsIngredientRecord[]> {
    const body = await this.call({ pageNo: 1, numOfRows, type: 'json', INGR_KOR_NAME: nameKo });
    return (body.body?.items ?? []).map(mapItem);
  }

  async fetchPage(
    pageNo: number,
    numOfRows: number,
  ): Promise<{ items: MfdsIngredientRecord[]; totalCount: number }> {
    const body = await this.call({ pageNo, numOfRows, type: 'json' });
    return { items: (body.body?.items ?? []).map(mapItem), totalCount: body.body?.totalCount ?? 0 };
  }
}

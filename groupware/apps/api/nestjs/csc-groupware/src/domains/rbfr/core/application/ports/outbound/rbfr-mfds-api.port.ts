import type { MfdsIngredientRecord } from '../../../domain/types';

/** 식약처 화장품 원료성분정보 API 호출 Outbound Port. DB를 모른다(순수 외부 API 어댑터). */
export interface RbfrMfdsApiPort {
  /** F-90: 한글명 부분 일치 검색(자동 채움용). */
  searchByKoreanName(nameKo: string, numOfRows?: number): Promise<MfdsIngredientRecord[]>;
  /** F-92: 전체 사전 동기화용 페이지 조회. */
  fetchPage(pageNo: number, numOfRows: number): Promise<{ items: MfdsIngredientRecord[]; totalCount: number }>;
}

export const RBFR_MFDS_API_PORT = Symbol('RBFR_MFDS_API_PORT');

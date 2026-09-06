import type { MfdsIngredientRecord, MfdsSyncResult } from '../../../domain/types';

/** 02_화면구성.md 탭3 "성분사전 조회" 버튼(F-90) + 관리 배치(F-92)가 호출하는 진입점. */
export interface RbfrMfdsSyncPort {
  /** F-90: 한글명으로 실시간 조회(자동 채움용, 캐시 안 함). */
  searchIngredientDictionary(nameKo: string): Promise<MfdsIngredientRecord[]>;
  /** F-92: 전체 사전을 내려받아 rbfr_ingredient_dictionary에 동기화. */
  syncFullDictionary(): Promise<MfdsSyncResult>;
}

export const RBFR_MFDS_SYNC_PORT = Symbol('RBFR_MFDS_SYNC_PORT');

/** 식약처 화장품 원료성분정보 API 응답 1건. rbfr/개발지침/04 식약청API연동.md 참고. */
export interface MfdsIngredientRecord {
	nameKo: string;
	nameEn?: string;
	casNo?: string;
	originDesc?: string;
	synonym?: string;
}

export interface MfdsSyncResult {
	synced: number;
	pages: number;
}

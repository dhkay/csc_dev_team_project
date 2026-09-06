/**
 * 8단계(관리자/검증 워크플로우) — 02_화면구성.md 사용자 권한표 "REVIEWER: 검수 요청 처리
 * (승인·수정요청·반려). 자기 처방은 자기가 못 함". 확정(FIXED) 시 버전 스냅샷
 * (rbfr_formula_versions)을 만드는 것은 이 조각에 포함하지 않는다(확인 필요, 05번 문서
 * "확정 후 불변" 원칙과 맞물린 별도 기능).
 */
export interface FormulaReviewSummary {
	id: number;
	formulaId: number;
	requestedBy: number;
	reviewerId?: number;
	status: 'PENDING' | 'REVIEWING' | 'APPROVED' | 'CHANGES' | 'REJECTED';
	comment?: string;
	requestedAt: string;
	decidedAt?: string;
}

/** rbfr_formulas의 소유자/상태만 필요한 만큼만 조회한 결과. */
export interface FormulaOwnerStatus {
	ownerId: number;
	status: 'DRAFT' | 'CALC' | 'REVIEW' | 'FIXED' | 'ARCHIVED';
}

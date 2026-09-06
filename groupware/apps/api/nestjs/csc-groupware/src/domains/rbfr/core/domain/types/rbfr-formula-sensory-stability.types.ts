/**
 * 02_화면구성.md "처방 사용감·안정성 기록"(탭1 부속) 대상 타입. 계산이 아니라 실험/관능평가
 * 기록이며, lab_test가 아니면 예측값 배지를 단다(05번 문서). 척도(0~100 vs 1~5 등)는 실제
 * 스펙도 확정하지 않은 부분이라 0~100으로 잠정 채택했다(확인 필요).
 */
export interface FormulaSensoryStabilityInput {
	stickinessScore?: number;
	freshnessScore?: number;
	absorptionScore?: number;
	spreadabilityScore?: number;
	afterfeelScore?: number;
	viscosityScore?: number;
	separationRisk?: '상' | '중' | '하';
	precipitationRisk?: '상' | '중' | '하';
	colorChangeRisk?: '상' | '중' | '하';
	odorChangeRisk?: '상' | '중' | '하';
	phStabilityScore?: number;
	heatStabilityScore?: number;
	lowTempStabilityScore?: number;
	overallStabilityScore?: number;
	testCondition?: string;
	dataSource?: 'manual_estimate' | 'lab_test' | 'literature' | 'expert_review' | 'unknown';
	confidenceLevel?: 'low' | 'medium' | 'high';
	notes?: string;
}

export interface FormulaSensoryStabilityRecord extends FormulaSensoryStabilityInput {
	id: number;
	formulaId: number;
	dataSource: 'manual_estimate' | 'lab_test' | 'literature' | 'expert_review' | 'unknown';
	createdAt: string;
}

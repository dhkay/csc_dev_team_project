/** 02_화면구성.md "설정(Profile 관리)" 화면(ADMIN 권한 전용) 대상 타입. */
export interface ProfileSummary {
	profileCode: string;
	nameKo: string;
	nameEn?: string;
	profileType: 'PRIMARY' | 'CROSS';
	sortOrder: number;
	description?: string;
	isActive: boolean;
}

export interface RoleDomainSummary {
	domainCode: string;
	profileCode: string;
	nameKo: string;
	nameEn?: string;
	domainType: 'DIRECT' | 'INTEGRATED';
	sortOrder: number;
	description?: string;
	isActive: boolean;
}

/** 새 Profile의 역할 도메인 한 행 입력. domainCode는 특허 구조와 무관한 신규 Profile에 한해 관리자가 직접 정한다. */
export interface CreateProfileRoleInput {
	domainCode: string;
	nameKo: string;
	nameEn?: string;
	domainType: 'DIRECT' | 'INTEGRATED';
}

export interface CreateProfileInput {
	profileCode: string;
	nameKo: string;
	nameEn?: string;
	profileType: 'PRIMARY' | 'CROSS';
	description?: string;
	roles: CreateProfileRoleInput[];
}

/**
 * anglePerDomain(360/역할수)은 오각형 프리뷰용 계산값이라 DB에 저장하지 않고 이 결과에만
 * 실어 돌려준다(02번 문서 "설정" 2번 항목).
 */
export interface CreateProfileResult {
	profileCode: string;
	ruleVersion: string;
	anglePerDomain: number;
}

/**
 * 비중(%)→Cell 변환 총량 제약. 승인된 판(isApproved=true)은 다시 못 고치고 새 rule_version을
 * 만들어야 한다(05번 문서 "Cell·오각형").
 */
export interface CellRuleLimitSummary {
	ruleVersion: string;
	profileCode: string;
	totalMin: number;
	totalMax: number;
	fillDirection: 'CCW' | 'CW';
	startCell: number;
	isApproved: boolean;
	approvedBy?: string;
	approvedAt?: Date;
	note?: string;
}

/** 비중(%)→Cell 수 변환표 한 구간("이상~미만"). */
export interface CellMappingEntry {
	ratioFrom: number;
	ratioTo: number;
	cellCount: number;
}

export interface CellMappingRow extends CellMappingEntry {
	ruleVersion: string;
}

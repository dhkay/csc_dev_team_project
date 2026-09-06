// RBFR(역할 기반 배합 비율) 도메인 전용 pgEnum. 값 집합이 사실상 고정된 것만 enum으로 두고
// (rbfr/개발지침/03 DB스키마.md "pgEnum 매핑" 참고), 아직 유동적인 값 집합(code_items류)은
// 테이블로 관리한다(05_스코어링엔진.md 원칙2: 규칙 숫자를 코드에 박지 않는다).
import { pgEnum } from 'drizzle-orm/pg-core';

/** 역할 도메인 종류. DIRECT(직접역할)는 원료 기여도로 계산, INTEGRATED(통합역할)는 독립 근거로만 채워진다. */
export const rbfrDomainTypeEnum = pgEnum('rbfr_domain_type_enum', ['DIRECT', 'INTEGRATED']);

/** Profile 종류. PRIMARY 는 단독 적용, CROSS 는 Primary 위에 겹쳐 쓰는 선택형. */
export const rbfrProfileTypeEnum = pgEnum('rbfr_profile_type_enum', ['PRIMARY', 'CROSS']);

/** 국가별 규제 판정. NODATA(미확인)를 ALLOW(사용가능)와 절대 같은 것으로 취급하지 않는다. */
export const rbfrRegTypeEnum = pgEnum('rbfr_reg_type_enum', ['ALLOW', 'BAN', 'LIMIT', 'COND', 'NODATA']);

/** 확정 상태. CONFIRMED 만 산출·검증에 쓰고, PROPOSED(AI 제안)는 표시만 한다. */
export const rbfrConfirmStatusEnum = pgEnum('rbfr_confirm_status_enum', [
  'CONFIRMED',
  'PROPOSED',
  'REJECTED',
]);

/** 병용 금기 등급. BLOCK 은 처방 확정 자체를 막고, WARN 은 경고만 한다. */
export const rbfrIncompatSeverityEnum = pgEnum('rbfr_incompat_severity_enum', ['BLOCK', 'WARN']);

/** 처방 상태 5단계. */
export const rbfrFormulaStatusEnum = pgEnum('rbfr_formula_status_enum', [
  'DRAFT',
  'CALC',
  'REVIEW',
  'FIXED',
  'ARCHIVED',
]);

/** 검수 상태 5단계. */
export const rbfrReviewStatusEnum = pgEnum('rbfr_review_status_enum', [
  'PENDING',
  'REVIEWING',
  'APPROVED',
  'CHANGES',
  'REJECTED',
]);

/** RBFR 내부 역할. ADMIN은 여기 포함하지 않는다 — 그룹웨어 조직 관리 권한자로 대체(03번 문서 참고). */
export const rbfrUserRoleEnum = pgEnum('rbfr_user_role_enum', [
  'REVIEWER',
  'DESIGNER',
  'DATA',
  'VIEWER',
]);

/** Cell(칸) 채우는 방향. */
export const rbfrFillDirectionEnum = pgEnum('rbfr_fill_direction_enum', ['CCW', 'CW']);

/** 독성/우려물질 지표 상태(Prop 65 등). */
export const rbfrToxStatusEnum = pgEnum('rbfr_tox_status_enum', ['NONE', 'LISTED', 'UNKNOWN']);

/** 원료쌍 조합 성격. */
export const rbfrInteractionTypeEnum = pgEnum('rbfr_interaction_type_enum', [
  'synergy',
  'conflict',
  'neutral',
  'unknown',
]);

/** 값의 근거 출처. lab_test 가 아니면 실측값과 다른 배지로 구분 표시한다(05번 문서). */
export const rbfrDataSourceEnum = pgEnum('rbfr_data_source_enum', [
  'manual_estimate',
  'lab_test',
  'literature',
  'expert_review',
  'unknown',
]);

export const rbfrConfidenceLevelEnum = pgEnum('rbfr_confidence_level_enum', [
  'low',
  'medium',
  'high',
]);

// 그룹웨어 기존 관례(users_type_enum 등)를 따라 한글 값을 그대로 쓴다(database-migration-workflow.md).
export const rbfrRiskLevelEnum = pgEnum('rbfr_risk_level_enum', ['상', '중', '하']);

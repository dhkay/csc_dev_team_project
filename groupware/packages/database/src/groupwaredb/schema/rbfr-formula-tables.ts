// RBFR: 처방(Formula) + 검수/확정(버전 잠금) 테이블. rbfr/개발지침/03 DB스키마.md
// "처방(Formula) 테이블", "검수·확정(버전 잠금) 테이블"과 1:1 대응(실제 스키마 schema.sql을
// 그대로 옮기되 rbfr_ 접두어만 추가). formula_sensory_stability_records만 실제 스펙에 없는
// 확장 테이블(2026-09-06 사용자 확인 후 채택 확정).
import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  smallint,
  numeric,
  date,
  timestamp,
  unique,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { rbfrRoleDomains } from './rbfr-profile-tables';
import { rbfrIngredients } from './rbfr-ingredient-tables';
import {
  rbfrFormulaStatusEnum,
  rbfrReviewStatusEnum,
  rbfrRiskLevelEnum,
  rbfrDataSourceEnum,
  rbfrConfidenceLevelEnum,
} from './rbfr-enums';

/** 프로젝트는 처방을 묶는 그룹(제품 개발 단위). 설계 내용은 rbfr_formulas에 있다. */
export const rbfrProjects = pgTable(
  'rbfr_projects',
  {
    id: serial('project_id').primaryKey(),
    projectName: varchar('project_name', { length: 255 }).notNull(),
    descr: varchar('descr', { length: 500 }),
    ownerId: integer('owner_id').notNull(),
    isClosed: boolean('is_closed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('rbfr_projects_owner_idx').on(t.ownerId, t.isClosed),
  }),
);

/** 처방(시안 1건). 상태 5단계. 랩 넘버는 FIXED 전환 시 부여(채번 규칙 확인 필요). */
export const rbfrFormulas = pgTable(
  'rbfr_formulas',
  {
    id: serial('formula_id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => rbfrProjects.id),
    labNo: varchar('lab_no', { length: 48 }).unique(),
    formulaName: varchar('formula_name', { length: 255 }).notNull(),
    formCode: varchar('form_code', { length: 32 }),
    status: rbfrFormulaStatusEnum('status').notNull().default('DRAFT'),
    ownerId: integer('owner_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectStatusIdx: index('rbfr_formulas_project_status_idx').on(t.projectId, t.status),
    ownerStatusIdx: index('rbfr_formulas_owner_status_idx').on(t.ownerId, t.status),
    nameIdx: index('rbfr_formulas_name_idx').on(t.formulaName),
  }),
);

/** 설계 조건 본체(1:1, formula_id가 PK). */
export const rbfrFormulaConditions = pgTable('rbfr_formula_conditions', {
  formulaId: integer('formula_id')
    .primaryKey()
    .references(() => rbfrFormulas.id, { onDelete: 'cascade' }),
  targetCode: varchar('target_code', { length: 32 }),
  batchSize: numeric('batch_size', { precision: 12, scale: 2 }).notNull().default('100'),
  targetPrice: numeric('target_price', { precision: 14, scale: 2 }),
  targetPhMin: numeric('target_ph_min', { precision: 4, scale: 2 }),
  targetPhMax: numeric('target_ph_max', { precision: 4, scale: 2 }),
  extraNote: text('extra_note'),
});

/** 복수 선택 조건(FUNC/TEXTURE/CERT/NOADD, rbfr_code_items 참고). */
export const rbfrFormulaConditionCodes = pgTable(
  'rbfr_formula_condition_codes',
  {
    formulaId: integer('formula_id')
      .notNull()
      .references(() => rbfrFormulas.id, { onDelete: 'cascade' }),
    codeType: varchar('code_type', { length: 24 }).notNull(),
    code: varchar('code', { length: 32 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.formulaId, t.codeType, t.code] }),
  }),
);

/** 이 처방이 점검할 수출 대상국(규제 점검 범위). */
export const rbfrFormulaCountries = pgTable(
  'rbfr_formula_countries',
  {
    formulaId: integer('formula_id')
      .notNull()
      .references(() => rbfrFormulas.id, { onDelete: 'cascade' }),
    countryCode: varchar('country_code', { length: 8 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.formulaId, t.countryCode] }),
  }),
);

/**
 * 역할별 목표 비중(%)과 Cell 수. 통합역할은 evidence 없이 남는 값으로 채우지 않는다
 * (05_스코어링엔진.md 원칙5).
 */
export const rbfrFormulaRatios = pgTable(
  'rbfr_formula_ratios',
  {
    formulaId: integer('formula_id')
      .notNull()
      .references(() => rbfrFormulas.id, { onDelete: 'cascade' }),
    domainCode: varchar('domain_code', { length: 24 })
      .notNull()
      .references(() => rbfrRoleDomains.domainCode),
    targetRatio: numeric('target_ratio', { precision: 5, scale: 2 }).notNull(),
    isMain: boolean('is_main').notNull().default(false),
    cellCount: smallint('cell_count'),
    evidence: text('evidence'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.formulaId, t.domainCode] }),
  }),
);

/**
 * 선정 성분. is_pinned/pinned_pct로 고가 원료 배합량을 고정한다(05번 원칙9).
 *
 * actual_pct는 실제 스키마(schema.sql)에 없는 컬럼이다(2026-09-06 구현 중 발견한 실제 격차 —
 * "확인 필요"). formula_ingredients에 실제 배합비를 담을 자리가 원본 스키마에 없어서, DRAFT/
 * CALC 단계의 작업 중인 배합비를 저장할 방법이 없다(FIXED 시점에만 rbfr_version_recipe.pct로
 * 굳어진다). 화면에서 배합비를 조정하다 저장 없이 새로고침하면 작업 내용이 사라지는 문제를
 * 막기 위해 nullable로 추가했다. 원본 설계팀 확인 전까지 잠정 컬럼으로 취급한다.
 */
export const rbfrFormulaIngredients = pgTable(
  'rbfr_formula_ingredients',
  {
    formulaId: integer('formula_id')
      .notNull()
      .references(() => rbfrFormulas.id, { onDelete: 'cascade' }),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id),
    phase: varchar('phase', { length: 16 }),
    actualPct: numeric('actual_pct', { precision: 7, scale: 4 }),
    isRecommended: boolean('is_recommended').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    pinnedPct: numeric('pinned_pct', { precision: 7, scale: 4 }),
    sortOrder: smallint('sort_order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.formulaId, t.ingredientId] }),
  }),
);

/** 검수 요청/결과. */
export const rbfrFormulaReviews = pgTable(
  'rbfr_formula_reviews',
  {
    id: serial('review_id').primaryKey(),
    formulaId: integer('formula_id')
      .notNull()
      .references(() => rbfrFormulas.id, { onDelete: 'cascade' }),
    requestedBy: integer('requested_by').notNull(),
    reviewerId: integer('reviewer_id'),
    status: rbfrReviewStatusEnum('status').notNull().default('PENDING'),
    comment: text('comment'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => ({
    formulaStatusIdx: index('rbfr_formula_reviews_formula_status_idx').on(t.formulaId, t.status),
    reviewerStatusIdx: index('rbfr_formula_reviews_reviewer_status_idx').on(t.reviewerId, t.status),
  }),
);

/** 확정본. 덮어쓰지 않고 version_no를 올려 새 행을 추가하는 append-only 테이블(05번 원칙7). */
export const rbfrFormulaVersions = pgTable(
  'rbfr_formula_versions',
  {
    id: serial('version_id').primaryKey(),
    formulaId: integer('formula_id')
      .notNull()
      .references(() => rbfrFormulas.id, { onDelete: 'cascade' }),
    versionNo: smallint('version_no').notNull(),
    fixedAt: timestamp('fixed_at', { withTimezone: true }).notNull(),
    fixedBy: integer('fixed_by').notNull(),
    appVersion: varchar('app_version', { length: 32 }).notNull(),
    ruleVersion: varchar('rule_version', { length: 16 }),
    batchSize: numeric('batch_size', { precision: 12, scale: 2 }).notNull(),
    totalCells: smallint('total_cells'),
    totalCost: numeric('total_cost', { precision: 14, scale: 2 }),
    snapshotJson: text('snapshot_json').notNull(),
    note: text('note'),
  },
  (t) => ({
    formulaVersionUq: unique('rbfr_formula_versions_formula_version_uq').on(t.formulaId, t.versionNo),
  }),
);

/** 확정 배합표. 확정 당시 명칭(inci_name)을 별도 보존 — 원료가 나중에 개명돼도 확정본은 안 바뀐다. */
export const rbfrVersionRecipe = pgTable(
  'rbfr_version_recipe',
  {
    versionId: integer('version_id')
      .notNull()
      .references(() => rbfrFormulaVersions.id, { onDelete: 'cascade' }),
    lineNo: smallint('line_no').notNull(),
    ingredientId: integer('ingredient_id').references(() => rbfrIngredients.id),
    inciName: varchar('inci_name', { length: 255 }).notNull(),
    nameKo: varchar('name_ko', { length: 255 }),
    phase: varchar('phase', { length: 16 }),
    pct: numeric('pct', { precision: 7, scale: 4 }).notNull(),
    grams: numeric('grams', { precision: 12, scale: 4 }),
    mainDomain: varchar('main_domain', { length: 24 }),
    reason: text('reason'),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.versionId, t.lineNo] }),
  }),
);

/** 확정 역할비율과 Cell 수. RBDR로 넘기는 원본값(00_개요.md RBFR/RBDR 정의 참고). */
export const rbfrVersionRatios = pgTable(
  'rbfr_version_ratios',
  {
    versionId: integer('version_id')
      .notNull()
      .references(() => rbfrFormulaVersions.id, { onDelete: 'cascade' }),
    domainCode: varchar('domain_code', { length: 24 }).notNull(),
    targetRatio: numeric('target_ratio', { precision: 5, scale: 2 }).notNull(),
    resultRatio: numeric('result_ratio', { precision: 5, scale: 2 }),
    cellCount: smallint('cell_count'),
    isMain: boolean('is_main').notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.versionId, t.domainCode] }),
  }),
);

/**
 * 처방 사용감·안정성 실측 기록(실제 스펙에 없는 확장 테이블, 2026-09-06 채택 확정). 계산
 * 결과가 아니라 실험/관능평가 기록이며, data_source가 lab_test가 아니면 예측값 배지로
 * 구분 표시한다.
 */
export const rbfrFormulaSensoryStabilityRecords = pgTable('rbfr_formula_sensory_stability_records', {
  id: serial('id').primaryKey(),
  formulaId: integer('formula_id')
    .notNull()
    .references(() => rbfrFormulas.id, { onDelete: 'cascade' }),
  stickinessScore: smallint('stickiness_score'),
  freshnessScore: smallint('freshness_score'),
  absorptionScore: smallint('absorption_score'),
  spreadabilityScore: smallint('spreadability_score'),
  afterfeelScore: smallint('afterfeel_score'),
  viscosityScore: smallint('viscosity_score'),
  separationRisk: rbfrRiskLevelEnum('separation_risk'),
  precipitationRisk: rbfrRiskLevelEnum('precipitation_risk'),
  colorChangeRisk: rbfrRiskLevelEnum('color_change_risk'),
  odorChangeRisk: rbfrRiskLevelEnum('odor_change_risk'),
  phStabilityScore: smallint('ph_stability_score'),
  heatStabilityScore: smallint('heat_stability_score'),
  lowTempStabilityScore: smallint('low_temp_stability_score'),
  overallStabilityScore: smallint('overall_stability_score'),
  testCondition: text('test_condition'),
  dataSource: rbfrDataSourceEnum('data_source').notNull().default('unknown'),
  confidenceLevel: rbfrConfidenceLevelEnum('confidence_level'),
  notes: text('notes'),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

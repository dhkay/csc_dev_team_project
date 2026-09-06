// RBFR: 성분 테이블. rbfr/개발지침/03 DB스키마.md "성분 테이블"과 1:1 대응(실제 스키마
// schema.sql을 그대로 옮기되 rbfr_ 접두어만 추가). ingredient_interactions만 실제 스펙에
// 없는 확장 테이블(2026-09-06 사용자 확인 후 채택 확정).
import {
  pgTable,
  serial,
  bigserial,
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
import {
  rbfrToxStatusEnum,
  rbfrConfirmStatusEnum,
  rbfrRegTypeEnum,
  rbfrIncompatSeverityEnum,
  rbfrInteractionTypeEnum,
  rbfrDataSourceEnum,
  rbfrConfidenceLevelEnum,
} from './rbfr-enums';

/**
 * 원료 마스터. 영문 표시명칭(INCI)·CAS·기원은 식약처 사전(rbfr_ingredient_dictionary)에서
 * 자동 채운다(04_식약청API연동.md F-90). conc_min/max가 05번 "유효농도계수" 산출 근거다.
 */
export const rbfrIngredients = pgTable('rbfr_ingredients', {
  id: serial('id').primaryKey(),
  inciName: varchar('inci_name', { length: 255 }).notNull().unique(),
  nameKo: varchar('name_ko', { length: 255 }).notNull(),
  ecNo: varchar('ec_no', { length: 32 }),
  funcDesc: text('func_desc'),
  originDesc: text('origin_desc'),
  synonym: varchar('synonym', { length: 255 }),
  category: varchar('category', { length: 48 }),
  ewgGrade: smallint('ewg_grade'),
  concMin: numeric('conc_min', { precision: 7, scale: 4 }),
  concMax: numeric('conc_max', { precision: 7, scale: 4 }),
  solubility: varchar('solubility', { length: 16 }),
  phMin: numeric('ph_min', { precision: 4, scale: 2 }),
  phMax: numeric('ph_max', { precision: 4, scale: 2 }),
  hlb: numeric('hlb', { precision: 5, scale: 2 }),
  sgMin: numeric('sg_min', { precision: 6, scale: 4 }),
  sgMax: numeric('sg_max', { precision: 6, scale: 4 }),
  viscType: varchar('visc_type', { length: 32 }),
  viscCoef: numeric('visc_coef', { precision: 8, scale: 4 }),
  emulsionRole: varchar('emulsion_role', { length: 32 }),
  stabilityNote: text('stability_note'),
  blendCond: text('blend_cond'),
  caution: text('caution'),
  isBase: boolean('is_base').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 원료 1개가 CAS 여러 개를 가질 수 있다(예: Dimethicone 5개). */
export const rbfrIngredientCas = pgTable(
  'rbfr_ingredient_cas',
  {
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    casNo: varchar('cas_no', { length: 64 }).notNull(),
    note: varchar('note', { length: 64 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ingredientId, t.casNo] }),
    casIdx: index('rbfr_ingredient_cas_cas_idx').on(t.casNo),
  }),
);

/** 배합목적(업계 표준 기능 분류, code_items PURPOSE). 역할 도메인과 별개 개념, 역할 기여도 추정 근거로 쓴다. */
export const rbfrIngredientPurposes = pgTable(
  'rbfr_ingredient_purposes',
  {
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    purposeCode: varchar('purpose_code', { length: 48 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ingredientId, t.purposeCode] }),
  }),
);

/** 병용 금기. 양방향으로 두 행을 넣거나 조회 시 양방향 검색. BLOCK은 확정을 막고 WARN은 경고만. */
export const rbfrIngredientIncompat = pgTable(
  'rbfr_ingredient_incompat',
  {
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    otherId: integer('other_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    severity: rbfrIncompatSeverityEnum('severity').notNull().default('WARN'),
    reason: varchar('reason', { length: 255 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ingredientId, t.otherId] }),
  }),
);

/** 성분별 텍스처 기여 수치(0.000~1.000). 사용감 조건을 산출에 반영하려면 필요하다. */
export const rbfrIngredientTextures = pgTable(
  'rbfr_ingredient_textures',
  {
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    textureCode: varchar('texture_code', { length: 32 }).notNull(),
    score: numeric('score', { precision: 4, scale: 3 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ingredientId, t.textureCode] }),
  }),
);

/** 독성/우려물질 지표(캘리포니아 Prop 65(OEHHA) 등). */
export const rbfrIngredientTox = pgTable(
  'rbfr_ingredient_tox',
  {
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    indicator: varchar('indicator', { length: 48 }).notNull(),
    status: rbfrToxStatusEnum('status').notNull(),
    checkedAt: date('checked_at'),
    source: varchar('source', { length: 255 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ingredientId, t.indicator] }),
  }),
);

/**
 * 성분 × 역할 기여도. 하나의 성분이 복수 역할에 귀속될 수 있다. contribution은 0~100
 * (05_스코어링엔진.md 계산식의 입력값), 통합역할 대상이면 evidence가 필수(원칙5).
 * 0~100 범위 제약은 애플리케이션(engine/src/scoringEngine.ts)에서 강제한다.
 */
export const rbfrIngredientRoles = pgTable(
  'rbfr_ingredient_roles',
  {
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    domainCode: varchar('domain_code', { length: 24 })
      .notNull()
      .references(() => rbfrRoleDomains.domainCode),
    contribution: smallint('contribution').notNull(),
    evidence: text('evidence'),
    updatedBy: integer('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ingredientId, t.domainCode] }),
  }),
);

/**
 * ingredient_roles의 근거자료 첨부(신규, 실제 스키마에는 없는 보완 — evidence가 TEXT 한 칸이라
 * 파일 첨부 자리가 없어 추가). 실제 바이트는 그룹웨어 file-upload 서버가 소유한다
 * (file-upload-limits.md 참고), 여기는 uploadId만 연결한다.
 */
export const rbfrIngredientRoleEvidenceFiles = pgTable('rbfr_ingredient_role_evidence_files', {
  id: serial('id').primaryKey(),
  ingredientId: integer('ingredient_id').notNull(),
  domainCode: varchar('domain_code', { length: 24 }).notNull(),
  uploadId: varchar('upload_id', { length: 64 }).notNull(),
  fileName: varchar('file_name', { length: 255 }),
  uploadedBy: integer('uploaded_by'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 인증 해당 여부(비건·유기농·NMPA·저자극). 인증은 성분 자체 성질이 아니라 누군가 발급한
 * 증명이라, 발급처·유효기간이 없으면 근거로 인정하지 않는다.
 */
export const rbfrIngredientCerts = pgTable(
  'rbfr_ingredient_certs',
  {
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    certCode: varchar('cert_code', { length: 32 }).notNull(),
    isEligible: boolean('is_eligible').notNull(),
    issuer: varchar('issuer', { length: 128 }),
    certNo: varchar('cert_no', { length: 64 }),
    docUrl: varchar('doc_url', { length: 500 }),
    validUntil: date('valid_until'),
    checkedAt: date('checked_at'),
    note: varchar('note', { length: 255 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ingredientId, t.certCode] }),
    validIdx: index('rbfr_ingredient_certs_valid_idx').on(t.validUntil),
  }),
);

/** 무첨가 분류 해당(파라벤류/페녹시에탄올/PEG류/BHT_BHA/실리콘류). 법적 규제와 별개 축. */
export const rbfrIngredientFlags = pgTable(
  'rbfr_ingredient_flags',
  {
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    noaddCode: varchar('noadd_code', { length: 32 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ingredientId, t.noaddCode] }),
  }),
);

/**
 * 국가별 규제. ALLOW(사용가능)와 NODATA(정보없음)를 반드시 구분한다. 확정된 것(status=
 * CONFIRMED)만 산출·검증에 쓴다. checked_at(사람 확인일)과 ai_checked_at(AI 확인일)을 분리.
 */
export const rbfrIngredientRegulations = pgTable(
  'rbfr_ingredient_regulations',
  {
    regId: serial('reg_id').primaryKey(),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    countryCode: varchar('country_code', { length: 8 }).notNull(),
    regType: rbfrRegTypeEnum('reg_type').notNull(),
    limitPct: numeric('limit_pct', { precision: 7, scale: 4 }),
    conditionTxt: text('condition_txt'),
    source: varchar('source', { length: 255 }),
    sourceUrl: varchar('source_url', { length: 500 }),
    checkedAt: date('checked_at'),
    aiCheckedAt: date('ai_checked_at'),
    status: rbfrConfirmStatusEnum('status').notNull().default('CONFIRMED'),
    foundBy: varchar('found_by', { length: 32 }),
    reviewedBy: integer('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    note: varchar('note', { length: 500 }),
  },
  (t) => ({
    // 한 성분·한 나라에 확정본 하나, 검토 대기 하나까지.
    regUq: unique('rbfr_ingredient_regulations_uq').on(t.ingredientId, t.countryCode, t.status),
    statusIdx: index('rbfr_ingredient_regulations_status_idx').on(t.status, t.checkedAt),
  }),
);

/** 단가 이력(append). 최신 기준일 행을 현재 단가로 본다. 고가 판정 기준은 미확정. */
export const rbfrIngredientPrices = pgTable(
  'rbfr_ingredient_prices',
  {
    priceId: serial('price_id').primaryKey(),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull().default('KRW'),
    priceUnit: varchar('price_unit', { length: 16 }).notNull().default('KG'),
    tradeName: varchar('trade_name', { length: 255 }),
    isHighCost: boolean('is_high_cost').notNull().default(false),
    baseDate: date('base_date').notNull(),
    supplier: varchar('supplier', { length: 128 }),
  },
  (t) => ({
    ingBaseDateIdx: index('rbfr_ingredient_prices_ing_base_date_idx').on(t.ingredientId, t.baseDate),
  }),
);

/** 식약처 화장품 원료성분정보 사본(약 21,897건). 조회마다 외부 호출하지 않는다(04번 문서). */
export const rbfrIngredientDictionary = pgTable(
  'rbfr_ingredient_dictionary',
  {
    dictId: serial('dict_id').primaryKey(),
    nameKo: varchar('name_ko', { length: 255 }).notNull().unique(),
    nameEn: varchar('name_en', { length: 255 }),
    casNo: varchar('cas_no', { length: 64 }),
    originDesc: text('origin_desc'),
    synonym: varchar('synonym', { length: 255 }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameEnIdx: index('rbfr_ingredient_dictionary_name_en_idx').on(t.nameEn),
  }),
);

/** 성분 변경 이력(범용 append-only). ingredient_roles의 별도 감사로그를 대체하는 실제 스펙 설계. */
export const rbfrIngredientHistory = pgTable(
  'rbfr_ingredient_history',
  {
    historyId: bigserial('history_id', { mode: 'number' }).primaryKey(),
    ingredientId: integer('ingredient_id').notNull(),
    fieldName: varchar('field_name', { length: 64 }).notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedBy: integer('changed_by'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ingChangedIdx: index('rbfr_ingredient_history_ing_changed_idx').on(t.ingredientId, t.changedAt),
  }),
);

/**
 * 원료쌍 시너지/충돌 계수(실제 스펙에 없는 확장 테이블, 2026-09-06 채택 확정). BLOCK/WARN
 * 이분법인 rbfr_ingredient_incompat과 달리 "같이 쓰면 10% 상승/감소" 같은 정도차를 담는다.
 * 이론 계산이 아니라 실측/평가로 채워진다.
 */
export const rbfrIngredientInteractions = pgTable(
  'rbfr_ingredient_interactions',
  {
    id: serial('id').primaryKey(),
    // 정규화 규칙: 항상 ingredientAId < ingredientBId로 저장해 (A,B)/(B,A) 중복을 막는다(애플리케이션에서 강제).
    ingredientAId: integer('ingredient_a_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    ingredientBId: integer('ingredient_b_id')
      .notNull()
      .references(() => rbfrIngredients.id, { onDelete: 'cascade' }),
    domainCode: varchar('domain_code', { length: 24 })
      .notNull()
      .references(() => rbfrRoleDomains.domainCode),
    interactionType: rbfrInteractionTypeEnum('interaction_type').notNull(),
    coefficient: numeric('coefficient', { precision: 5, scale: 2 }).notNull().default('1.00'),
    confidenceLevel: rbfrConfidenceLevelEnum('confidence_level'),
    dataSource: rbfrDataSourceEnum('data_source').notNull().default('unknown'),
    measuredAt: timestamp('measured_at', { withTimezone: true }),
    notes: text('notes'),
  },
  (t) => ({
    pairDomainUq: unique('rbfr_ingredient_interactions_pair_domain_uq').on(
      t.ingredientAId,
      t.ingredientBId,
      t.domainCode,
    ),
  }),
);

// RBFR: Profile/역할 도메인/공통 코드 테이블. rbfr/개발지침/03 DB스키마.md "Profile/역할
// 도메인/코드 테이블"과 1:1 대응(실제 스키마 schema.sql을 그대로 옮기되 rbfr_ 접두어만 추가).
import {
  pgTable,
  varchar,
  smallint,
  boolean,
  integer,
  timestamp,
  numeric,
  unique,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { rbfrProfileTypeEnum, rbfrDomainTypeEnum, rbfrUserRoleEnum, rbfrFillDirectionEnum } from './rbfr-enums';

/**
 * Profile. 지금은 스킨(Skin) 하나만 is_active=true. 역할이 확정된 것만 활성화한다
 * (02_화면구성.md "설정(Profile 관리)" 화면이 이 테이블을 다룬다).
 */
export const rbfrProfiles = pgTable('rbfr_profiles', {
  profileCode: varchar('profile_code', { length: 24 }).primaryKey(),
  nameKo: varchar('name_ko', { length: 32 }).notNull(),
  nameEn: varchar('name_en', { length: 48 }),
  profileType: rbfrProfileTypeEnum('profile_type').notNull(),
  sortOrder: smallint('sort_order').notNull().default(0),
  description: varchar('description', { length: 255 }),
  isActive: boolean('is_active').notNull().default(false),
});

/**
 * 역할 도메인. 이름·순서·개수는 미확정(잠정값: 보습/진정/보호/정돈/균형). 4개 직접역할+1개
 * 통합역할 구조 자체는 특허 청구항에 나오는 확정 사항이라 개수는 임의로 바뀌지 않는다.
 */
export const rbfrRoleDomains = pgTable(
  'rbfr_role_domains',
  {
    domainCode: varchar('domain_code', { length: 24 }).primaryKey(),
    profileCode: varchar('profile_code', { length: 24 })
      .notNull()
      .references(() => rbfrProfiles.profileCode),
    nameKo: varchar('name_ko', { length: 32 }).notNull(),
    nameEn: varchar('name_en', { length: 32 }),
    domainType: rbfrDomainTypeEnum('domain_type').notNull(),
    sortOrder: smallint('sort_order').notNull(),
    description: varchar('description', { length: 255 }),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({
    // 순서는 Profile 안에서만 겹치지 않으면 된다.
    profileSortUq: unique('rbfr_role_domains_profile_sort_uq').on(t.profileCode, t.sortOrder),
  }),
);

/**
 * 선택 항목 공통 코드. FORM/TARGET/FUNC/TEXTURE/CERT/NOADD/PURPOSE. 기능성·사용감 구성은
 * 미확정(develop_status.md "확인 필요" 참고) — 값 집합 자체를 이 테이블에서 관리한다.
 */
export const rbfrCodeItems = pgTable(
  'rbfr_code_items',
  {
    codeType: varchar('code_type', { length: 24 }).notNull(),
    code: varchar('code', { length: 32 }).notNull(),
    nameKo: varchar('name_ko', { length: 64 }).notNull(),
    nameEn: varchar('name_en', { length: 64 }),
    descr: varchar('descr', { length: 255 }),
    sortOrder: smallint('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.codeType, t.code] }),
  }),
);

/** 수출 대상국 코드(KR/JP/CN/US/EU/CA/TW/GB/RU/ASEAN 등). */
export const rbfrCountries = pgTable('rbfr_countries', {
  countryCode: varchar('country_code', { length: 8 }).primaryKey(),
  nameKo: varchar('name_ko', { length: 48 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

/**
 * RBFR 내부 역할 부여. userId는 userdb organization_users.id 값을 그대로 저장하되, DB가
 * 달라 FK는 걸지 않는다(크로스 DB 금지 원칙). ADMIN은 여기 없다 — 그룹웨어 조직 관리
 * 권한자(루트 권한자 ∨ system-management)로 대체(01_연동구조.md 참고).
 */
export const rbfrUserRoles = pgTable(
  'rbfr_user_roles',
  {
    userId: integer('user_id').notNull(),
    roleCode: rbfrUserRoleEnum('role_code').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedBy: integer('granted_by'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleCode] }),
  }),
);

/**
 * 비중(%) → Cell(칸) 수 변환표. 구간은 "이상~미만". 승인된 rule_version만 실제 계산에
 * 쓴다(05_스코어링엔진.md "Cell·오각형" 참고, 규칙 숫자를 코드에 박지 않는다).
 */
export const rbfrCellMapping = pgTable(
  'rbfr_cell_mapping',
  {
    ruleVersion: varchar('rule_version', { length: 16 }).notNull(),
    ratioFrom: numeric('ratio_from', { precision: 5, scale: 2 }).notNull(),
    ratioTo: numeric('ratio_to', { precision: 5, scale: 2 }).notNull(),
    cellCount: smallint('cell_count').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ruleVersion, t.ratioFrom] }),
  }),
);

/**
 * Cell 규칙 제약. Profile마다 총 Cell 허용범위(기본 15~18), 채우는 방향, 시작 위치, 승인자를
 * 담는다. 승인된 판은 다시 고칠 수 없고, 바꾸려면 새 rule_version을 만든다.
 */
export const rbfrCellRuleLimits = pgTable('rbfr_cell_rule_limits', {
  ruleVersion: varchar('rule_version', { length: 16 }).primaryKey(),
  profileCode: varchar('profile_code', { length: 24 })
    .notNull()
    .references(() => rbfrProfiles.profileCode),
  totalMin: smallint('total_min').notNull().default(15),
  totalMax: smallint('total_max').notNull().default(18),
  fillDirection: rbfrFillDirectionEnum('fill_direction').notNull().default('CCW'),
  startCell: smallint('start_cell').notNull().default(1),
  isApproved: boolean('is_approved').notNull().default(false),
  approvedBy: varchar('approved_by', { length: 64 }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  note: varchar('note', { length: 255 }),
});

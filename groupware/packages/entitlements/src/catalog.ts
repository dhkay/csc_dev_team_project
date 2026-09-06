/**
 * 엔타이틀먼트 카탈로그 SSOT: 기능(features)/AI도구(ai_tools) key 의 "닫힌 집합".
 *
 * 각 AI도구, 기능은 서비스 급(라우팅/BFF/백엔드 통합이 따라오는 코드 강결합)이라 key 집합은
 * 배포로만 바뀐다. 따라서 코드가 진실원(enum) 이고, user 서버의 DB 테이블(ai_tools/features)은
 * 그 정의의 런타임 투영이다(표시명/slug/활성/정렬만 편집, key 는 고정)
 *
 * 이 패키지는 토큰을 발급하는 user(NestJS)와 소비하는 web(groupware/control-tower) 양쪽이
 * 같은 key, 라벨을 공유하도록 추출된 zero-dep 공유 도메인 커널이다(프레임워크/ORM import 없음)
 * 동기화/시드 정책은 user 서버 CatalogSeederService 가 담당. 설계: .claude/rules/multi-tenancy.md
 */

/**
 * AI 도구 key: 안정 식별자(코드/시드/토큰이 참조). 표시명/slug 변경과 무관
 * 여기 있는 것은 조직에 부여/제공하는 AI 도구(카탈로그 관리 대상)뿐이다. AI 어시스턴트(챗봇)는
 * AI 도구가 아니라 전역 기본 제공 기능이라 카탈로그에 두지 않는다(접근 정책 SSOT = web canUseAiAssistant)
 */
export enum AiToolKey {
  MarketingVideo = 'marketing-video',
}

/**
 * AI 도구 프로비저닝 모드: 조직에 어떻게 제공되는가
 *  - PER_ORG: 조직마다 개별 부여(organization_ai_tools grant 필요)
 *  - COMMON: 전 조직에 공통 제공(부여 불요): 모든 조직 유저 토큰에 자동 포함
 * SSOT 는 `ai_tools.provisioning` DB 컬럼(플랫폼 관리자가 런타임 토글). 카탈로그 값은 신규 도구 insert 기본값
 * (AI 어시스턴트는 AI 도구가 아니므로 이 모드와 무관: 별개의 전역 기본 기능.)
 */
export enum ProvisioningMode {
  PerOrg = 'PER_ORG',
  Common = 'COMMON',
}

/**
 * 권한(permission) key: features/aiTools 와 분리된 별도 카탈로그
 * 부서(조직도 노드)/멤버에 부여하며 부서 부여는 하위 소속 조직원이 상속한다. 토큰 클레임 permissions[]
 * 일부 권한은 개인(멤버) 전용: 부서(조직) 단위로는 부여 불가(INDIVIDUAL_ONLY_PERMISSION_KEYS 참고)
 */
export enum PermissionKey {
  SystemManagement = 'system-management',
}

/**
 * 직책(position): 권한/AI도구와 분리된 별도 차원. organization_users.position 단일 컬럼(유저당 하나)
 * 한 컬럼이라 대표↔팀장 상호배제가 구조적으로 보장된다. 토큰 클레임 position.
 *  - 대표(REPRESENTATIVE): 사실상 루트관리자(ROOT)와 동등한 권한(조직 관리 전권 + 조직 보유 AI도구 전부)
 *    임명/해임은 ROOT(개발관리자)만(ROOT_ROLE_ONLY_POSITION). hasRootAuthority 의 근거
 *  - 팀장(TEAM_LEADER): 순수 조직상 직책(권한 변화 없음). 소속 부서(department_id)의 리더이며 부서당 1명
 */
export enum OrgPosition {
  Representative = 'REPRESENTATIVE',
  TeamLeader = 'TEAM_LEADER',
}

/** 기능 key: 조직/구성원에 부여하는 권한의 단일 출처 */
export enum FeatureKey {
  Notice = 'notice',
  UserManagement = 'user-management',
  Roles = 'roles',
  Content = 'content',
  Stats = 'stats',
  Settings = 'settings',
  AuditLog = 'audit-log',
  Billing = 'billing',
}

/** 카탈로그 시드 메타: 신규 key 최초 삽입 시 기본값(이후 표시명/slug 는 플랫폼 편집이 우선) */
export interface CatalogSeed<K extends string = string> {
  key: K;
  name: string;
  description: string;
  sortOrder: number;
}

/** AI 도구 시드: 카탈로그 공통 메타 + 프로비저닝 모드(신규 도구 insert 기본값) */
export interface AiToolCatalogSeed extends CatalogSeed<AiToolKey> {
  provisioning: ProvisioningMode;
}

/** AI 도구 카탈로그: 추가 시 enum + 여기 한 줄(provisioning 포함) */
export const AI_TOOL_CATALOG: AiToolCatalogSeed[] = [
  {
    key: AiToolKey.MarketingVideo,
    name: '마케팅 영상 제작',
    description: 'AI 영상 제작 자동화(트랜스코딩/렌더링)',
    sortOrder: 10,
    provisioning: ProvisioningMode.PerOrg,
  },
];

/** 권한 카탈로그: permissions 테이블 시드 진실원. 추가 시 enum + 여기 한 줄 */
export const PERMISSION_CATALOG: CatalogSeed<PermissionKey>[] = [
  {
    key: PermissionKey.SystemManagement,
    name: '시스템관리',
    description: '시스템 관리 권한',
    sortOrder: 10,
  },
];

/** 직책 카탈로그: 직책 선택 UI 순회/정렬용(권한 카탈로그와 별개, DB 테이블 없음. 유저 컬럼) */
export const ORG_POSITION_CATALOG: CatalogSeed<OrgPosition>[] = [
  {
    key: OrgPosition.Representative,
    name: '대표',
    description: '대표: 루트관리자(ROOT) 동등 권한. ROOT(개발관리자)만 임명 가능',
    sortOrder: 10,
  },
  {
    key: OrgPosition.TeamLeader,
    name: '팀장',
    description: '팀장: 소속 부서의 리더(부서당 1명). 순수 직책(권한 변화 없음)',
    sortOrder: 20,
  },
];

/** 기능 카탈로그: features 테이블 시드 진실원 */
export const FEATURE_CATALOG: CatalogSeed<FeatureKey>[] = [
  { key: FeatureKey.Notice, name: '공지사항', description: '조직 공지 작성/열람', sortOrder: 10 },
  { key: FeatureKey.UserManagement, name: '사용자 관리', description: '조직유저 관리', sortOrder: 20 },
  { key: FeatureKey.Roles, name: '권한/역할', description: '역할 및 접근권한 관리', sortOrder: 30 },
  { key: FeatureKey.Content, name: '콘텐츠', description: '콘텐츠 관리', sortOrder: 40 },
  { key: FeatureKey.Stats, name: '통계', description: '리포트/통계 대시보드', sortOrder: 50 },
  { key: FeatureKey.Settings, name: '설정', description: '조직 설정', sortOrder: 60 },
  { key: FeatureKey.AuditLog, name: '감사 로그', description: '활동 감사 로그', sortOrder: 70 },
  { key: FeatureKey.Billing, name: '결제', description: '구독/결제 관리', sortOrder: 80 },
];

/** 전체 key 목록: DTO 검증(@IsIn), UI 순회 등에서 사용 */
export const ALL_AI_TOOL_KEYS: AiToolKey[] = Object.values(AiToolKey);
export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FeatureKey);
export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PermissionKey);
export const ALL_ORG_POSITIONS: OrgPosition[] = Object.values(OrgPosition);
export const ALL_PROVISIONING_MODES: ProvisioningMode[] = Object.values(ProvisioningMode);

const AI_TOOL_KEY_SET = new Set<string>(ALL_AI_TOOL_KEYS);
const FEATURE_KEY_SET = new Set<string>(ALL_FEATURE_KEYS);
const PERMISSION_KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);
const ORG_POSITION_SET = new Set<string>(ALL_ORG_POSITIONS);

const PROVISIONING_MODE_SET = new Set<string>(ALL_PROVISIONING_MODES);

export const isAiToolKey = (v: string): v is AiToolKey => AI_TOOL_KEY_SET.has(v);
export const isFeatureKey = (v: string): v is FeatureKey => FEATURE_KEY_SET.has(v);
export const isPermissionKey = (v: string): v is PermissionKey => PERMISSION_KEY_SET.has(v);
export const isOrgPosition = (v: string): v is OrgPosition => ORG_POSITION_SET.has(v);
export const isProvisioningMode = (v: string): v is ProvisioningMode =>
  PROVISIONING_MODE_SET.has(v);

/** 코드에 없는(알 수 없는) key 를 버리고 닫힌 집합으로 좁힌다. DB/토큰 경계 방어 */
export const toAiToolKeys = (vals: readonly string[]): AiToolKey[] => vals.filter(isAiToolKey);
export const toFeatureKeys = (vals: readonly string[]): FeatureKey[] => vals.filter(isFeatureKey);
export const toPermissionKeys = (vals: readonly string[]): PermissionKey[] =>
  vals.filter(isPermissionKey);
/** DB/토큰 경계에서 알 수 없는 직책값을 null 로 좁힌다. */
export const toOrgPosition = (v: string | null | undefined): OrgPosition | null =>
  v != null && isOrgPosition(v) ? v : null;

/**
 * 개인(멤버) 전용 권한: 부서(조직) 단위로는 부여할 수 없고 개인에게만 직접 부여 가능한 key 집합
 * 부서 부여 UI(제외)와 백엔드 부서 부여 검증(거부) 양쪽에서 사용한다.
 * (대표는 권한이 아닌 직책(OrgPosition)으로 이전되어 현재는 비어 있음. 메커니즘은 유지.)
 */
export const INDIVIDUAL_ONLY_PERMISSION_KEYS: PermissionKey[] = [];
const INDIVIDUAL_ONLY_PERMISSION_SET = new Set<string>(INDIVIDUAL_ONLY_PERMISSION_KEYS);
export const isIndividualOnlyPermission = (v: string): boolean =>
  INDIVIDUAL_ONLY_PERMISSION_SET.has(v);

/**
 * ROOT 전용 부여 권한: 일반 조직 관리자(시스템관리 보유자)는 부여할 수 없는 민감 권한(권한 상승 차단)
 * 시스템관리(system-management)는 루트 권한자(ROOT/대표) 만 부여 가능: 조직 관리 권한이라 확산을 제한
 * 프론트 부여 UI(비활성)와 백엔드 부여 검증(거부) 양쪽에서 사용한다.
 */
export const ROOT_ONLY_GRANT_PERMISSION_KEYS: PermissionKey[] = [PermissionKey.SystemManagement];
const ROOT_ONLY_GRANT_PERMISSION_SET = new Set<string>(ROOT_ONLY_GRANT_PERMISSION_KEYS);
export const isRootOnlyGrantPermission = (v: string): boolean =>
  ROOT_ONLY_GRANT_PERMISSION_SET.has(v);

/**
 * ROOT 역할 전용 부여 권한: 루트 권한자 중에서도 ROOT(개발관리자) 역할만 부여 가능한 권한
 * (대표 임명이 여기 있었으나 직책(OrgPosition)으로 이전 → ROOT_ROLE_ONLY_POSITION_KEYS 참고. 현재 비어 있음.)
 */
export const ROOT_ROLE_ONLY_GRANT_PERMISSION_KEYS: PermissionKey[] = [];
const ROOT_ROLE_ONLY_GRANT_PERMISSION_SET = new Set<string>(ROOT_ROLE_ONLY_GRANT_PERMISSION_KEYS);
export const isRootRoleOnlyGrantPermission = (v: string): boolean =>
  ROOT_ROLE_ONLY_GRANT_PERMISSION_SET.has(v);

/** 부서(조직)에 부여 가능한 권한 key: 개인 전용 권한을 제외한 나머지. 부서 부여 UI 순회용 */
export const DEPARTMENT_ASSIGNABLE_PERMISSION_KEYS: PermissionKey[] = ALL_PERMISSION_KEYS.filter(
  (k) => !INDIVIDUAL_ONLY_PERMISSION_SET.has(k),
);

/**
 * ROOT 역할 전용 임명 직책: ROOT(개발관리자) 역할만 임명/해임 가능한 직책
 * 대표(REPRESENTATIVE)가 여기 속한다. 대표=ROOT 동등이라 대표가 대표를 만드는 확산을 막는다.
 * 여기 없는 직책(팀장)은 조직관리 권한자(hasRootAuthority ∨ system-management)가 임명한다.
 * 프론트 직책 UI(비활성)와 백엔드 임명 검증(거부) 양쪽에서 사용한다.
 */
export const ROOT_ROLE_ONLY_POSITION_KEYS: OrgPosition[] = [OrgPosition.Representative];
const ROOT_ROLE_ONLY_POSITION_SET = new Set<string>(ROOT_ROLE_ONLY_POSITION_KEYS);
export const isRootRoleOnlyPosition = (v: string): boolean => ROOT_ROLE_ONLY_POSITION_SET.has(v);

/** 소속 부서(department_id)가 반드시 있어야 임명 가능한 직책: 팀장(부서 리더) */
export const DEPARTMENT_REQUIRED_POSITION_KEYS: OrgPosition[] = [OrgPosition.TeamLeader];
const DEPARTMENT_REQUIRED_POSITION_SET = new Set<string>(DEPARTMENT_REQUIRED_POSITION_KEYS);
export const isDepartmentRequiredPosition = (v: string): boolean =>
  DEPARTMENT_REQUIRED_POSITION_SET.has(v);

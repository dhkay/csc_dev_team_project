import type {
  CellMappingEntry,
  CellMappingRow,
  CellRuleLimitSummary,
  CreateProfileInput,
  CreateProfileResult,
  ProfileSummary,
  RoleDomainSummary,
} from '../../../domain/types';

/** 02_화면구성.md "설정(Profile 관리)" 화면(ADMIN 권한 전용)이 호출하는 진입점. */
export interface RbfrSettingsPort {
  listProfiles(): Promise<ProfileSummary[]>;
  listRoleDomains(profileCode: string): Promise<RoleDomainSummary[]>;
  createProfile(input: CreateProfileInput): Promise<CreateProfileResult>;
  /** 활성화하려면 그 Profile에 승인된 Cell 규칙 판이 최소 1개 있어야 한다. */
  setProfileActive(profileCode: string, isActive: boolean): Promise<void>;
  listCellRuleLimits(profileCode: string): Promise<CellRuleLimitSummary[]>;
  /** 이미 승인된 rule_version은 다시 승인할 수 없다(새 rule_version을 만들어야 한다). */
  approveCellRuleLimit(ruleVersion: string, approvedBy: string): Promise<void>;
  listCellMapping(ruleVersion: string): Promise<CellMappingRow[]>;
  /** 승인된 rule_version의 변환표는 고칠 수 없다(새 rule_version을 만들어야 한다). */
  setCellMapping(ruleVersion: string, entries: CellMappingEntry[]): Promise<void>;
}

export const RBFR_SETTINGS_PORT = Symbol('RBFR_SETTINGS_PORT');

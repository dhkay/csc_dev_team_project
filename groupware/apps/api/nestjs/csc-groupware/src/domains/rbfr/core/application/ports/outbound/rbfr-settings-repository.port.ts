import type {
  CellMappingEntry,
  CellMappingRow,
  CellRuleLimitSummary,
  CreateProfileInput,
  ProfileSummary,
  RoleDomainSummary,
} from '../../../domain/types';

/** 설정(Profile 관리) 화면의 읽기/쓰기 Outbound Port. */
export interface RbfrSettingsRepositoryPort {
  listProfiles(): Promise<ProfileSummary[]>;
  listRoleDomains(profileCode: string): Promise<RoleDomainSummary[]>;
  /** Profile + 역할 도메인 + 미승인 Cell 규칙 판 1건을 한 트랜잭션으로 만든다. */
  createProfileWithRoles(
    input: CreateProfileInput,
    cellRuleLimit: { ruleVersion: string; totalMin: number; totalMax: number },
  ): Promise<void>;
  setProfileActive(profileCode: string, isActive: boolean): Promise<void>;
  listCellRuleLimits(profileCode: string): Promise<CellRuleLimitSummary[]>;
  findCellRuleLimit(ruleVersion: string): Promise<CellRuleLimitSummary | undefined>;
  approveCellRuleLimit(ruleVersion: string, approvedBy: string): Promise<void>;
  listCellMapping(ruleVersion: string): Promise<CellMappingRow[]>;
  /** 기존 구간을 전부 지우고 새 구간으로 교체한다(트랜잭션). */
  replaceCellMapping(ruleVersion: string, entries: CellMappingEntry[]): Promise<void>;
}

export const RBFR_SETTINGS_REPOSITORY_PORT = Symbol('RBFR_SETTINGS_REPOSITORY_PORT');

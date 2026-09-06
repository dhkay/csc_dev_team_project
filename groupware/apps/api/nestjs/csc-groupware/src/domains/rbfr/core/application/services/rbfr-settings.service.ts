/**
 * 설정(Profile 관리) — 02_화면구성.md "설정" 절. 새 Profile을 등록하면 Cell 판정 기준선
 * (역할수×3칸, +3칸 여유)을 자동 계산해 미승인 Cell 규칙 판 1건을 함께 만든다(각도·기준선
 * 재계산은 코드가 하지만, 그 결과 판은 반드시 별도 승인이 필요하다 — 05번 "Cell·오각형").
 * 비중(%)→Cell 변환표(`rbfr_cell_mapping`)는 승인 전까지만 자유롭게 고칠 수 있고, Profile은
 * 승인된 Cell 규칙 판이 있어야 활성화할 수 있다(둘 다 이 서비스가 강제하는 불변식).
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  CellMappingEntry,
  CellMappingRow,
  CellRuleLimitSummary,
  CreateProfileInput,
  CreateProfileResult,
  ProfileSummary,
  RoleDomainSummary,
} from '../../domain/types';
import type { RbfrSettingsPort } from '../ports/inbound';
import { RBFR_SETTINGS_REPOSITORY_PORT, type RbfrSettingsRepositoryPort } from '../ports/outbound';

/** 05번 문서 예시(5개 역할 → 총 15~18칸)와 일치하는 기준선 공식. */
const CELLS_PER_DOMAIN = 3;
const TOTAL_MAX_MARGIN = 3;

@Injectable()
export class RbfrSettingsService implements RbfrSettingsPort {
  constructor(
    @Inject(RBFR_SETTINGS_REPOSITORY_PORT)
    private readonly settingsRepository: RbfrSettingsRepositoryPort,
  ) {}

  async listProfiles(): Promise<ProfileSummary[]> {
    return await this.settingsRepository.listProfiles();
  }

  async listRoleDomains(profileCode: string): Promise<RoleDomainSummary[]> {
    return await this.settingsRepository.listRoleDomains(profileCode);
  }

  async createProfile(input: CreateProfileInput): Promise<CreateProfileResult> {
    const domainCount = input.roles.length;
    const totalMin = domainCount * CELLS_PER_DOMAIN;
    const totalMax = totalMin + TOTAL_MAX_MARGIN;
    const ruleVersion = `${input.profileCode}-v1`;

    await this.settingsRepository.createProfileWithRoles(input, { ruleVersion, totalMin, totalMax });

    return {
      profileCode: input.profileCode,
      ruleVersion,
      anglePerDomain: domainCount > 0 ? 360 / domainCount : 0,
    };
  }

  async setProfileActive(profileCode: string, isActive: boolean): Promise<void> {
    if (isActive) {
      const limits = await this.settingsRepository.listCellRuleLimits(profileCode);
      const hasApproved = limits.some((l) => l.isApproved);
      if (!hasApproved) {
        throw new Error('승인된 Cell 규칙 판이 있어야 Profile을 활성화할 수 있습니다.');
      }
    }
    await this.settingsRepository.setProfileActive(profileCode, isActive);
  }

  async listCellRuleLimits(profileCode: string): Promise<CellRuleLimitSummary[]> {
    return await this.settingsRepository.listCellRuleLimits(profileCode);
  }

  async approveCellRuleLimit(ruleVersion: string, approvedBy: string): Promise<void> {
    const limit = await this.findCellRuleLimitOrThrow(ruleVersion);
    if (limit.isApproved) throw new Error('이미 승인된 Cell 규칙 판입니다. 새 rule_version을 만드세요.');

    await this.settingsRepository.approveCellRuleLimit(ruleVersion, approvedBy);
  }

  async listCellMapping(ruleVersion: string): Promise<CellMappingRow[]> {
    return await this.settingsRepository.listCellMapping(ruleVersion);
  }

  async setCellMapping(ruleVersion: string, entries: CellMappingEntry[]): Promise<void> {
    const limit = await this.findCellRuleLimitOrThrow(ruleVersion);
    if (limit.isApproved) {
      throw new Error('이미 승인된 Cell 규칙 판의 변환표는 고칠 수 없습니다. 새 rule_version을 만드세요.');
    }

    await this.settingsRepository.replaceCellMapping(ruleVersion, entries);
  }

  private async findCellRuleLimitOrThrow(ruleVersion: string): Promise<CellRuleLimitSummary> {
    const limit = await this.settingsRepository.findCellRuleLimit(ruleVersion);
    if (!limit) throw new Error(`존재하지 않는 rule_version입니다: ${ruleVersion}`);
    return limit;
  }
}

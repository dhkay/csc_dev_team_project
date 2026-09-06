import { Test, TestingModule } from '@nestjs/testing';
import { RbfrSettingsService } from '../rbfr-settings.service';
import { RBFR_SETTINGS_REPOSITORY_PORT } from '../../ports/outbound';
import type { RbfrSettingsRepositoryPort } from '../../ports/outbound';
import type { CellRuleLimitSummary } from '../../../domain/types';

describe('RbfrSettingsService', () => {
  let service: RbfrSettingsService;
  let settingsRepository: jest.Mocked<RbfrSettingsRepositoryPort>;

  beforeEach(async () => {
    settingsRepository = {
      listProfiles: jest.fn(),
      listRoleDomains: jest.fn(),
      createProfileWithRoles: jest.fn(),
      setProfileActive: jest.fn(),
      listCellRuleLimits: jest.fn(),
      findCellRuleLimit: jest.fn(),
      approveCellRuleLimit: jest.fn(),
      listCellMapping: jest.fn(),
      replaceCellMapping: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbfrSettingsService,
        { provide: RBFR_SETTINGS_REPOSITORY_PORT, useValue: settingsRepository },
      ],
    }).compile();

    service = module.get(RbfrSettingsService);
  });

  describe('createProfile', () => {
    it('역할수×3을 기준선(totalMin)으로, +3을 totalMax로 계산해 Cell 규칙 판을 함께 만든다', async () => {
      const result = await service.createProfile({
        profileCode: 'CLEANSE',
        nameKo: '클렌즈',
        profileType: 'PRIMARY',
        roles: [
          { domainCode: 'A', nameKo: '역할A', domainType: 'DIRECT' },
          { domainCode: 'B', nameKo: '역할B', domainType: 'DIRECT' },
          { domainCode: 'C', nameKo: '역할C', domainType: 'DIRECT' },
          { domainCode: 'D', nameKo: '역할D', domainType: 'DIRECT' },
          { domainCode: 'E', nameKo: '균형', domainType: 'INTEGRATED' },
        ],
      });

      expect(result).toEqual({ profileCode: 'CLEANSE', ruleVersion: 'CLEANSE-v1', anglePerDomain: 72 });
      expect(settingsRepository.createProfileWithRoles).toHaveBeenCalledWith(
        expect.objectContaining({ profileCode: 'CLEANSE' }),
        { ruleVersion: 'CLEANSE-v1', totalMin: 15, totalMax: 18 },
      );
    });
  });

  describe('approveCellRuleLimit', () => {
    const makeLimit = (overrides: Partial<CellRuleLimitSummary> = {}): CellRuleLimitSummary => ({
      ruleVersion: 'SKIN-v1',
      profileCode: 'SKIN',
      totalMin: 15,
      totalMax: 18,
      fillDirection: 'CCW',
      startCell: 1,
      isApproved: false,
      ...overrides,
    });

    it('존재하지 않는 rule_version이면 에러를 던진다', async () => {
      settingsRepository.findCellRuleLimit.mockResolvedValueOnce(undefined);
      await expect(service.approveCellRuleLimit('NONE-v1', '관리자')).rejects.toThrow();
      expect(settingsRepository.approveCellRuleLimit).not.toHaveBeenCalled();
    });

    it('이미 승인된 rule_version이면 에러를 던지고 다시 승인하지 않는다', async () => {
      settingsRepository.findCellRuleLimit.mockResolvedValueOnce(makeLimit({ isApproved: true }));
      await expect(service.approveCellRuleLimit('SKIN-v1', '관리자')).rejects.toThrow();
      expect(settingsRepository.approveCellRuleLimit).not.toHaveBeenCalled();
    });

    it('미승인 상태면 approvedBy와 함께 승인 처리를 위임한다', async () => {
      settingsRepository.findCellRuleLimit.mockResolvedValueOnce(makeLimit());
      await service.approveCellRuleLimit('SKIN-v1', '관리자');
      expect(settingsRepository.approveCellRuleLimit).toHaveBeenCalledWith('SKIN-v1', '관리자');
    });
  });

  describe('setCellMapping', () => {
    const makeLimit = (overrides: Partial<CellRuleLimitSummary> = {}): CellRuleLimitSummary => ({
      ruleVersion: 'SKIN-v1',
      profileCode: 'SKIN',
      totalMin: 15,
      totalMax: 18,
      fillDirection: 'CCW',
      startCell: 1,
      isApproved: false,
      ...overrides,
    });
    const entries = [{ ratioFrom: 0, ratioTo: 20, cellCount: 1 }];

    it('존재하지 않는 rule_version이면 에러를 던진다', async () => {
      settingsRepository.findCellRuleLimit.mockResolvedValueOnce(undefined);
      await expect(service.setCellMapping('NONE-v1', entries)).rejects.toThrow();
      expect(settingsRepository.replaceCellMapping).not.toHaveBeenCalled();
    });

    it('이미 승인된 rule_version이면 변환표를 고칠 수 없다', async () => {
      settingsRepository.findCellRuleLimit.mockResolvedValueOnce(makeLimit({ isApproved: true }));
      await expect(service.setCellMapping('SKIN-v1', entries)).rejects.toThrow();
      expect(settingsRepository.replaceCellMapping).not.toHaveBeenCalled();
    });

    it('미승인 상태면 변환표 교체를 위임한다', async () => {
      settingsRepository.findCellRuleLimit.mockResolvedValueOnce(makeLimit());
      await service.setCellMapping('SKIN-v1', entries);
      expect(settingsRepository.replaceCellMapping).toHaveBeenCalledWith('SKIN-v1', entries);
    });
  });

  describe('setProfileActive', () => {
    it('승인된 Cell 규칙 판이 하나도 없으면 활성화할 수 없다', async () => {
      settingsRepository.listCellRuleLimits.mockResolvedValueOnce([
        {
          ruleVersion: 'SKIN-v1',
          profileCode: 'SKIN',
          totalMin: 15,
          totalMax: 18,
          fillDirection: 'CCW',
          startCell: 1,
          isApproved: false,
        },
      ]);
      await expect(service.setProfileActive('SKIN', true)).rejects.toThrow();
      expect(settingsRepository.setProfileActive).not.toHaveBeenCalled();
    });

    it('승인된 Cell 규칙 판이 있으면 활성화를 위임한다', async () => {
      settingsRepository.listCellRuleLimits.mockResolvedValueOnce([
        {
          ruleVersion: 'SKIN-v1',
          profileCode: 'SKIN',
          totalMin: 15,
          totalMax: 18,
          fillDirection: 'CCW',
          startCell: 1,
          isApproved: true,
        },
      ]);
      await service.setProfileActive('SKIN', true);
      expect(settingsRepository.setProfileActive).toHaveBeenCalledWith('SKIN', true);
    });

    it('비활성화는 승인 여부와 무관하게 항상 위임한다', async () => {
      await service.setProfileActive('SKIN', false);
      expect(settingsRepository.listCellRuleLimits).not.toHaveBeenCalled();
      expect(settingsRepository.setProfileActive).toHaveBeenCalledWith('SKIN', false);
    });
  });
});

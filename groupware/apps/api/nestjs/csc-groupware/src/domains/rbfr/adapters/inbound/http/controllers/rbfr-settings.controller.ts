import { Body, Controller, Get, Inject, Param, Patch, Post, Put } from '@nestjs/common';
import { RBFR_SETTINGS_PORT, type RbfrSettingsPort } from '../../../../core/application/ports/inbound';
import { ApproveCellRuleDto, CreateProfileDto, SetCellMappingDto, SetProfileActiveDto } from '../dto';

/** 02_화면구성.md "설정(Profile 관리)" 화면(ADMIN 권한 전용)이 호출하는 진입점. */
@Controller('rbfr-api')
export class RbfrSettingsController {
  constructor(
    @Inject(RBFR_SETTINGS_PORT)
    private readonly settings: RbfrSettingsPort,
  ) {}

  @Get('profiles')
  async listProfiles() {
    return await this.settings.listProfiles();
  }

  @Get('profiles/:profileCode/role-domains')
  async listRoleDomains(@Param('profileCode') profileCode: string) {
    return await this.settings.listRoleDomains(profileCode);
  }

  @Post('profiles')
  async createProfile(@Body() dto: CreateProfileDto) {
    return await this.settings.createProfile(dto);
  }

  @Patch('profiles/:profileCode/active')
  async setProfileActive(@Param('profileCode') profileCode: string, @Body() dto: SetProfileActiveDto) {
    await this.settings.setProfileActive(profileCode, dto.isActive);
    return { profileCode, isActive: dto.isActive };
  }

  @Get('profiles/:profileCode/cell-rule-limits')
  async listCellRuleLimits(@Param('profileCode') profileCode: string) {
    return await this.settings.listCellRuleLimits(profileCode);
  }

  @Post('cell-rule-limits/:ruleVersion/approve')
  async approveCellRuleLimit(@Param('ruleVersion') ruleVersion: string, @Body() dto: ApproveCellRuleDto) {
    await this.settings.approveCellRuleLimit(ruleVersion, dto.approvedBy);
    return { ruleVersion, approved: true };
  }

  @Get('cell-rule-limits/:ruleVersion/mapping')
  async listCellMapping(@Param('ruleVersion') ruleVersion: string) {
    return await this.settings.listCellMapping(ruleVersion);
  }

  @Put('cell-rule-limits/:ruleVersion/mapping')
  async setCellMapping(@Param('ruleVersion') ruleVersion: string, @Body() dto: SetCellMappingDto) {
    await this.settings.setCellMapping(ruleVersion, dto.entries);
    return { ruleVersion, count: dto.entries.length };
  }
}

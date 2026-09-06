import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ORGANIZATION_PORT,
  OrganizationPort,
} from '../../../../core/application/ports/inbound/organization.port';
import {
  ADMIN_MANAGEMENT_PORT,
  AdminManagementPort,
} from '../../../../core/application/ports/inbound/admin-management.port';
import {
  AI_TOOL_CATALOG_PORT,
  AiToolCatalogPort,
} from '../../../../core/application/ports/inbound/ai-tool-catalog.port';
import {
  PLATFORM_ASSISTANT_SETTINGS_PORT,
  PlatformAssistantSettingsPort,
} from '../../../../core/application/ports/inbound/platform-assistant-settings.port';
import { CreateOrganizationDto } from '../dto/create-organization.dto';
import { UpdateOrganizationDto } from '../dto/update-organization.dto';
import { ResetRootPasswordDto } from '../dto/reset-root-password.dto';
import { UpdateRootAdminDto } from '../dto/update-root-admin.dto';
import { TransferRootAdminDto } from '../dto/transfer-root-admin.dto';
import { ReplaceRootAdminDto } from '../dto/replace-root-admin.dto';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { SetAdminFeaturesDto } from '../dto/set-admin-features.dto';
import { UpdateAdminDto } from '../dto/update-admin.dto';
import { UpdateAiToolDto } from '../dto/update-ai-tool.dto';
import { UpdatePlatformAssistantSettingsDto } from '../dto/update-platform-assistant-settings.dto';
import { PlatformAdminEntity } from '../../../../core/domain/entities/user.entity';

/**
 * 내부(서비스 간) 전용 Inbound Adapter: 전역 ServiceTokenGuard 로 보호된다.
 * 플랫폼 운영사(csc-control-tower)가 X-Service-Token 으로 호출한다.
 */
@ApiTags('internal')
@Controller('internal')
export class InternalController {
  constructor(
    @Inject(ORGANIZATION_PORT)
    private readonly organizationService: OrganizationPort,
    @Inject(ADMIN_MANAGEMENT_PORT)
    private readonly adminService: AdminManagementPort,
    @Inject(AI_TOOL_CATALOG_PORT)
    private readonly aiToolCatalog: AiToolCatalogPort,
    @Inject(PLATFORM_ASSISTANT_SETTINGS_PORT)
    private readonly platformAssistantSettings: PlatformAssistantSettingsPort,
  ) {}

  /** 플랫폼 관리자 요약(비밀번호 해시 제외) */
  private toAdminSummary(a: PlatformAdminEntity) {
    return {
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      status: a.status,
      lastLoginAt: a.lastLoginAt,
      createdAt: a.createdAt,
    };
  }

  /** 플랫폼 관리자 목록 */
  @ApiOperation({
    summary: '[INTERNAL-001] 플랫폼 관리자 목록',
    description: '플랫폼 관리자 목록을 조회한다(비밀번호 해시 제외).',
  })
  @Get('admins')
  async listAdmins() {
    const admins = await this.adminService.listAdmins();
    return admins.map((a) => this.toAdminSummary(a));
  }

  /** 이메일 사용 가능 여부(저장 전 사전 확인) */
  @ApiOperation({
    summary: '[INTERNAL-022] 관리자 이메일 사용 가능 여부',
    description:
      '해당 이메일로 플랫폼 관리자를 만들거나 수정할 수 있는지 확인한다. 이미 같은 이메일의 관리자가 있으면 available=false 를 반환한다. 확인과 저장 사이에 다른 요청이 같은 이메일을 선점할 수 있으므로 생성/수정 시점의 검증을 대체하지 않는다.',
  })
  @ApiQuery({ name: 'email', description: '확인할 이메일', example: 'admin@csc.kr' })
  @ApiQuery({
    name: 'excludeId',
    required: false,
    description: '검사에서 제외할 관리자 id(수정 대상 자신). 생략 시 전체 검사',
    example: 2,
  })
  @Get('admins/email-available')
  async isAdminEmailAvailable(
    @Query('email') email: string,
    @Query('excludeId') excludeId?: string,
  ) {
    const parsed = Number(excludeId);
    const available = await this.adminService.isAdminEmailAvailable(
      email,
      Number.isInteger(parsed) ? parsed : undefined,
    );
    return { available };
  }

  /** 플랫폼 관리자(ADMIN) 추가 (+초기 옵션) */
  @ApiOperation({
    summary: '[INTERNAL-002] 플랫폼 관리자 추가',
    description: '플랫폼 관리자(ADMIN)를 생성하고 초기 옵션을 부여한다.',
  })
  @ApiResponse({ status: 409, description: '이미 사용 중인 이메일' })
  @Post('admins')
  async createAdmin(@Body() dto: CreateAdminDto) {
    const admin = await this.adminService.createAdmin(dto);
    return this.toAdminSummary(admin);
  }

  /** 플랫폼 관리자 프로필 수정(name, email) */
  @ApiOperation({
    summary: '[INTERNAL-003] 플랫폼 관리자 수정',
    description:
      '플랫폼 관리자 프로필(표시 이름, 로그인 이메일)을 수정한다. 이메일은 전역 유일이라 중복이면 409 를 반환하고, 루트 관리자의 이메일 변경은 400 으로 거부한다.',
  })
  @ApiResponse({ status: 409, description: '이미 사용 중인 이메일' })
  @ApiResponse({ status: 404, description: '관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '루트 관리자의 이메일 변경 시도' })
  @ApiParam({ name: 'id', description: '플랫폼 관리자 id', example: 2 })
  @Patch('admins/:id')
  async updateAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminDto,
  ) {
    const admin = await this.adminService.updateAdmin(id, dto);
    return this.toAdminSummary(admin);
  }

  /** 플랫폼 관리자 삭제(ROOT 불가) */
  @ApiOperation({
    summary: '[INTERNAL-004] 플랫폼 관리자 삭제',
    description: '플랫폼 관리자를 삭제한다(ROOT 는 삭제 불가).',
  })
  @ApiResponse({ status: 404, description: '관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '루트 관리자 삭제 시도' })
  @ApiParam({ name: 'id', description: '플랫폼 관리자 id', example: 2 })
  @Delete('admins/:id')
  async deleteAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.adminService.deleteAdmin(id);
    return { success: true };
  }

  /** 관리자에게 부여된 옵션 key */
  @ApiOperation({
    summary: '[INTERNAL-005] 관리자 옵션 조회',
    description: '플랫폼 관리자에게 부여된 옵션 key 목록을 조회한다.',
  })
  @ApiResponse({ status: 404, description: '관리자를 찾을 수 없음' })
  @ApiParam({ name: 'id', description: '플랫폼 관리자 id', example: 2 })
  @Get('admins/:id/features')
  async getAdminFeatures(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getAdminFeatures(id);
  }

  /** 관리자 옵션 일괄 설정 */
  @ApiOperation({
    summary: '[INTERNAL-006] 관리자 옵션 설정',
    description: '플랫폼 관리자 옵션 key 집합을 일괄 설정한다(그대로 동기화).',
  })
  @ApiResponse({ status: 404, description: '관리자를 찾을 수 없음' })
  @ApiParam({ name: 'id', description: '플랫폼 관리자 id', example: 2 })
  @Patch('admins/:id/features')
  async setAdminFeatures(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAdminFeaturesDto,
  ) {
    await this.adminService.setAdminFeatures(id, dto.features);
    return { success: true };
  }

  /** 플랫폼 관리자 옵션 카탈로그 */
  @ApiOperation({
    summary: '[INTERNAL-007] 관리자 옵션 카탈로그',
    description: '플랫폼 관리자 옵션 카탈로그(부여 가능한 옵션 목록)를 조회한다.',
  })
  @Get('admin-features')
  async listAdminFeatureCatalog() {
    return this.adminService.listAdminFeatureCatalog();
  }

  /** 신규 회사(조직) + 그 회사 ROOT 관리자 생성 */
  @ApiOperation({
    summary: '[INTERNAL-008] 조직 생성',
    description: '신규 회사(조직)와 그 회사의 ROOT 관리자를 함께 생성한다.',
  })
  @ApiResponse({ status: 409, description: '이미 사용 중인 slug 또는 이메일' })
  @Post('organizations')
  async createOrganization(@Body() dto: CreateOrganizationDto) {
    const { organization, rootAdmin } = await this.organizationService.createOrganization({
      slug: dto.slug,
      name: dto.name,
      profileImageUrl: dto.profileImageUrl,
      rootAdmin: dto.rootAdmin,
    });
    return {
      organization,
      rootAdmin: { id: rootAdmin.id, email: rootAdmin.email, name: rootAdmin.name },
    };
  }

  /** 전체 조직 목록 (플랫폼 운영사 조직 관리용) */
  @ApiOperation({
    summary: '[INTERNAL-009] 조직 목록',
    description: '전체 조직 목록을 조회한다(플랫폼 운영사 조직 관리용: TENANT 만).',
  })
  @Get('organizations')
  async listOrganizations() {
    return this.organizationService.listOrganizations();
  }

  /** 조직 수정: 이름/slug/상태 */
  @ApiOperation({
    summary: '[INTERNAL-010] 조직 수정',
    description: '조직 이름/slug/상태/로고/AI도구 부여를 수정한다(제공된 필드만).',
  })
  @ApiResponse({ status: 409, description: '이미 사용 중인 slug' })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Patch('organizations/:id')
  async updateOrganization(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationService.updateOrganization(id, dto);
  }

  /** 소프트 삭제: 조직 WITHDRAWN + 세션 무효화 */
  @ApiOperation({
    summary: '[INTERNAL-011] 조직 소프트 삭제',
    description: '조직을 WITHDRAWN 으로 전환하고 세션을 무효화한다.',
  })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Delete('organizations/:id')
  async withdrawOrganization(@Param('id', ParseIntPipe) id: number) {
    await this.organizationService.withdrawOrganization(id);
    return { success: true };
  }

  /** 복구: WITHDRAWN → ACTIVE (소프트 삭제 되돌리기) */
  @ApiOperation({
    summary: '[INTERNAL-011a] 조직 복구',
    description: 'WITHDRAWN 조직을 ACTIVE 로 되돌린다(소프트 삭제 되돌리기: 데이터/스토리지 보존).',
  })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Post('organizations/:id/recover')
  async recoverOrganization(@Param('id', ParseIntPipe) id: number) {
    return this.organizationService.recoverOrganization(id);
  }

  /** 하드 삭제: 조직 유저+조직 영구 제거 */
  @ApiOperation({
    summary: '[INTERNAL-012] 조직 하드 삭제',
    description: '조직 유저와 조직을 영구 제거한다.',
  })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Delete('organizations/:id/purge')
  async purgeOrganization(@Param('id', ParseIntPipe) id: number) {
    await this.organizationService.purgeOrganization(id);
    return { success: true };
  }

  /** 조직 ROOT 관리자 조회 */
  @ApiOperation({
    summary: '[INTERNAL-013] 조직 ROOT 관리자 조회',
    description: '조직의 ROOT 관리자 정보를 조회한다.',
  })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Get('organizations/:id/root-admin')
  async getRootAdmin(@Param('id', ParseIntPipe) id: number) {
    const root = await this.organizationService.getRootAdmin(id);
    return {
      id: root.id,
      email: root.email,
      name: root.name,
      status: root.status,
      lastLoginAt: root.lastLoginAt,
    };
  }

  /** 조직 멤버 목록 (플랫폼이 루트 이양 대상을 고르는 데 사용) */
  @ApiOperation({
    summary: '[INTERNAL-024] 조직 멤버 목록',
    description:
      '조직의 활성 멤버(루트관리자와 일반관리자)를 조회한다. 삭제된 멤버는 제외한다. 루트 관리자를 다른 조직원에게 넘길 때 대상을 고르는 데 사용한다.',
  })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Get('organizations/:id/members')
  async listOrganizationMembers(@Param('id', ParseIntPipe) id: number) {
    const members = await this.organizationService.listMembers(id);
    return members.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.role,
      status: m.status,
      lastLoginAt: m.lastLoginAt,
    }));
  }

  /** 조직 ROOT 이양(기존 조직원 승격) */
  @ApiOperation({
    summary: '[INTERNAL-025] 조직 루트 관리자 이양',
    description:
      '조직의 활성 일반관리자 한 명을 루트 관리자로 올리고, 기존 루트 관리자를 일반관리자로 내린다. 계정을 새로 만들지 않으므로 대상의 부서와 권한, 활동 이력이 그대로 유지된다. 기존 루트 관리자가 대표 직책을 갖고 있으면 함께 해임한다(대표는 루트와 동등한 권한자라 역할만 내리면 권한이 남는다). 두 사람의 기존 로그인은 무효가 되어 다시 로그인해야 한다. 대상이 그 조직의 활성 일반관리자가 아니면 400 을 반환한다.',
  })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '대상이 그 조직의 활성 일반관리자가 아님' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Post('organizations/:id/root-admin/transfer')
  async transferRootAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferRootAdminDto,
  ) {
    const root = await this.organizationService.transferRootAdmin(id, dto.userId);
    return {
      id: root.id,
      email: root.email,
      name: root.name,
      status: root.status,
      lastLoginAt: root.lastLoginAt,
    };
  }

  /** 조직 ROOT 교체(신규 계정 생성) */
  @ApiOperation({
    summary: '[INTERNAL-026] 조직 루트 관리자 교체(신규 계정)',
    description:
      '조직에 계정이 없는 사람을 루트 관리자로 세운다. 계정을 새로 만들어 루트로 두고 기존 루트 관리자는 일반관리자로 내린다(계정은 남고, 대표 직책은 함께 해임된다). 이메일은 로그인 ID 이며 이미 쓰는 조직유저가 있으면 409 를 반환한다. 플랫폼 운영자 계정과는 테이블이 달라 같은 이메일을 쓸 수 있다.',
  })
  @ApiResponse({ status: 409, description: '이미 사용 중인 이메일' })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '입력값 검증 실패' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Post('organizations/:id/root-admin/replace')
  async replaceRootAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceRootAdminDto,
  ) {
    const root = await this.organizationService.replaceRootAdmin(id, dto);
    return {
      id: root.id,
      email: root.email,
      name: root.name,
      status: root.status,
      lastLoginAt: root.lastLoginAt,
    };
  }

  /** 조직 ROOT 관리자 이메일 사용 가능 여부(저장 전 사전 확인) */
  @ApiOperation({
    summary: '[INTERNAL-023] 조직 ROOT 관리자 이메일 사용 가능 여부',
    description:
      '조직 ROOT 관리자가 해당 이메일을 쓸 수 있는지 확인한다. 조직유저의 이메일은 로그인 ID 이며 전체에서 유일해야 하므로, 다른 조직이 쓰는 이메일도 사용할 수 없다. 확인과 저장 사이에 같은 이메일이 선점될 수 있어 저장 시점의 검증을 대체하지 않는다.',
  })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @ApiQuery({ name: 'email', description: '확인할 이메일', example: 'root@example.com' })
  @Get('organizations/:id/root-admin/email-available')
  async isRootAdminEmailAvailable(
    @Param('id', ParseIntPipe) id: number,
    @Query('email') email: string,
  ) {
    const available = await this.organizationService.isRootAdminEmailAvailable(id, email);
    return { available };
  }

  /** 조직 ROOT 관리자 프로필 수정 (플랫폼이 생성 시 넣은 값을 사후 정정) */
  @ApiOperation({
    summary: '[INTERNAL-021] 조직 ROOT 관리자 수정',
    description:
      '조직 ROOT 관리자의 이름과 이메일을 수정한다(제공된 필드만). 이름은 표시 이름이라 중복을 허용한다. 이메일은 로그인 ID 이며 이미 쓰는 계정이 있으면 409 를 반환한다. 어느 쪽을 바꾸어도 세션은 유지된다.',
  })
  @ApiResponse({ status: 409, description: '이미 사용 중인 이메일' })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: 'PLATFORM 조직' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Patch('organizations/:id/root-admin')
  async updateRootAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRootAdminDto,
  ) {
    const root = await this.organizationService.updateRootAdmin(id, dto);
    return {
      id: root.id,
      email: root.email,
      name: root.name,
      status: root.status,
      lastLoginAt: root.lastLoginAt,
    };
  }

  /** 조직에 부여된 AI도구 key 목록 (control-tower 부여 토글 상태용) */
  @ApiOperation({
    summary: '[INTERNAL-014] 조직 AI도구 key 조회',
    description: '조직에 부여된 AI도구 key 목록을 조회한다(control-tower 부여 토글 상태용).',
  })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Get('organizations/:id/ai-tools')
  async getOrganizationAiTools(@Param('id', ParseIntPipe) id: number) {
    return this.organizationService.getOrganizationAiTools(id);
  }

  /** 조직에 부여된 AI도구(표시명+slug 포함): 그룹웨어 노출/라우팅용 */
  @ApiOperation({
    summary: '[INTERNAL-015] 조직 AI도구 상세 조회',
    description: '조직에 부여된 AI도구를 표시명+slug 포함해 조회한다(그룹웨어 노출/라우팅용).',
  })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Get('organizations/:id/ai-tools/resolved')
  async getOrganizationAiToolsResolved(@Param('id', ParseIntPipe) id: number) {
    return this.organizationService.getOrganizationAiToolsResolved(id);
  }

  /** AI 도구 카탈로그 목록 (플랫폼 관리: 표시명/slug) */
  @ApiOperation({
    summary: '[INTERNAL-016] AI 도구 카탈로그 목록',
    description: 'AI 도구 카탈로그(표시명/slug)를 조회한다(플랫폼 관리용).',
  })
  @Get('ai-tools')
  async listAiToolCatalog() {
    return this.aiToolCatalog.listAiToolCatalog();
  }

  /** AI 도구 표시명/slug 수정 (key/enum 고정) */
  @ApiOperation({
    summary: '[INTERNAL-017] AI 도구 수정',
    description: 'AI 도구의 표시명/slug 를 수정한다(key/enum 고정).',
  })
  @ApiResponse({ status: 409, description: '이미 사용 중인 slug' })
  @ApiResponse({ status: 404, description: 'AI 도구를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: 'slug 형식 또는 예약어 위반' })
  @ApiParam({ name: 'key', description: 'AI 도구 카탈로그 key', example: 'marketing-video' })
  @Patch('ai-tools/:key')
  async updateAiTool(@Param('key') key: string, @Body() dto: UpdateAiToolDto) {
    return this.aiToolCatalog.updateAiTool(key, dto);
  }

  /** 플랫폼 AI 어시스턴트 전역 설정 조회 (싱글톤) */
  @ApiOperation({
    summary: '[INTERNAL-019] 플랫폼 AI 어시스턴트 전역 설정 조회',
    description: 'AI 어시스턴트 전역 설정(활성 킬스위치/공통 프롬프트)을 조회한다.',
  })
  @Get('platform-assistant-settings')
  async getPlatformAssistantSettings() {
    return this.platformAssistantSettings.getSettings();
  }

  /** 플랫폼 AI 어시스턴트 전역 설정 수정 (제공된 필드만) */
  @ApiOperation({
    summary: '[INTERNAL-020] 플랫폼 AI 어시스턴트 전역 설정 수정',
    description: 'AI 어시스턴트 전역 설정을 수정한다(제공된 필드만).',
  })
  @Patch('platform-assistant-settings')
  async updatePlatformAssistantSettings(@Body() dto: UpdatePlatformAssistantSettingsDto) {
    return this.platformAssistantSettings.updateSettings(dto);
  }

  /** 조직 ROOT 관리자 비밀번호 재설정: 잠금 해제 + 세션 무효화 동반 */
  @ApiOperation({
    summary: '[INTERNAL-018] 조직 ROOT 비밀번호 재설정',
    description: '조직 ROOT 관리자 비밀번호를 재설정한다(잠금 해제 + 세션 무효화 동반).',
  })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 id', example: 1 })
  @Post('organizations/:id/root-admin/reset-password')
  async resetRootPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetRootPasswordDto,
  ) {
    await this.organizationService.resetRootPassword(id, dto.password);
    return { success: true };
  }
}

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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../../../../../shared/guards';
import {
  ORGANIZATION_PORT,
  OrganizationPort,
} from '../../../../core/application/ports/inbound/organization.port';
import {
  CreatedCompanyResponseDto,
  OrganizationSummaryResponseDto,
} from '../dto/organization-summary.response.dto';
import {
  OrgMemberSummaryResponseDto,
  RootAdminSummaryResponseDto,
} from '../dto/root-admin-summary.response.dto';
import { EmailAvailabilityResponseDto, SuccessResponseDto } from '../dto/common.response.dto';
import { CreateOrganizationDto } from '../dto/create-organization.dto';
import { UpdateOrganizationDto } from '../dto/update-organization.dto';
import { ResetRootPasswordDto } from '../dto/reset-root-password.dto';
import { UpdateRootAdminDto } from '../dto/update-root-admin.dto';
import { TransferRootAdminDto } from '../dto/transfer-root-admin.dto';
import { ReplaceRootAdminDto } from '../dto/replace-root-admin.dto';

/**
 * 플랫폼 조직 관리 Inbound Adapter.
 * 전역 ServiceTokenGuard(서버 간) + PlatformAdminGuard(플랫폼 관리자 JWT)로 이중 보호
 * 내부망 전용(외부 nginx 노출 없음)
 */
@ApiTags('organization')
@ApiBearerAuth()
@Controller('platform')
export class OrganizationController {
  constructor(
    @Inject(ORGANIZATION_PORT)
    private readonly organizationService: OrganizationPort,
  ) {}

  /** 신규 회사(조직) + 그 회사 ROOT 관리자 생성 */
  @ApiOperation({
    summary: '[ORG-001] 조직 생성',
    description: '신규 회사(조직)와 해당 조직의 ROOT 관리자를 함께 생성합니다.',
  })
  @ApiCreatedResponse({ type: CreatedCompanyResponseDto })
  @ApiResponse({ status: 409, description: '이미 사용 중인 slug 또는 이메일' })
  @UseGuards(PlatformAdminGuard)
  @Post('organizations')
  async createOrganization(@Body() dto: CreateOrganizationDto) {
    return this.organizationService.createCompany({
      companyName: dto.companyName,
      slug: dto.slug,
      profileImageUrl: dto.profileImageUrl,
      admin: { email: dto.adminEmail, password: dto.adminPassword, name: dto.adminName },
    });
  }

  /** 조직 목록 조회 */
  @ApiOperation({
    summary: '[ORG-002] 조직 목록',
    description: '플랫폼에 등록된 조직(TENANT) 목록을 조회합니다.',
  })
  @ApiOkResponse({ type: OrganizationSummaryResponseDto, isArray: true })
  @UseGuards(PlatformAdminGuard)
  @Get('organizations')
  async listOrganizations() {
    return this.organizationService.listOrganizations();
  }

  /** 회사 수정: 이름/slug/상태 */
  @ApiOperation({
    summary: '[ORG-003] 조직 수정',
    description: '조직의 이름/slug/상태/로고/AI도구 등 제공된 필드를 갱신합니다.',
  })
  @ApiOkResponse({ type: OrganizationSummaryResponseDto })
  @ApiResponse({ status: 409, description: '이미 사용 중인 slug' })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Patch('organizations/:id')
  async updateOrganization(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationService.updateCompany(id, dto);
  }

  /** 소프트 삭제: 조직 WITHDRAWN + 세션 무효화 */
  @ApiOperation({
    summary: '[ORG-004] 조직 소프트 삭제',
    description: '조직을 WITHDRAWN 상태로 전환하고 해당 조직 세션을 무효화합니다.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Delete('organizations/:id')
  async withdrawOrganization(@Param('id', ParseIntPipe) id: number) {
    await this.organizationService.withdrawCompany(id);
    return { success: true };
  }

  /** 복구: WITHDRAWN → ACTIVE */
  @ApiOperation({
    summary: '[ORG-004a] 조직 복구',
    description: 'WITHDRAWN 조직을 ACTIVE 로 되돌립니다(소프트 삭제 되돌리기: 데이터/스토리지 보존).',
  })
  @ApiCreatedResponse({ type: OrganizationSummaryResponseDto })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Post('organizations/:id/recover')
  async recoverOrganization(@Param('id', ParseIntPipe) id: number) {
    return this.organizationService.recoverCompany(id);
  }

  /** 하드 삭제: 조직 영구 제거 */
  @ApiOperation({
    summary: '[ORG-005] 조직 하드 삭제',
    description: '조직을 영구 제거합니다(복구 불가).',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Delete('organizations/:id/purge')
  async purgeOrganization(@Param('id', ParseIntPipe) id: number) {
    await this.organizationService.purgeCompany(id);
    return { success: true };
  }

  /** 조직 ROOT 관리자 조회 */
  @ApiOperation({
    summary: '[ORG-006] 조직 ROOT 관리자 조회',
    description: '특정 조직의 ROOT 관리자 정보를 조회합니다.',
  })
  @ApiOkResponse({ type: RootAdminSummaryResponseDto })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Get('organizations/:id/root-admin')
  async getRootAdmin(@Param('id', ParseIntPipe) id: number) {
    return this.organizationService.getRootAdmin(id);
  }

  /** 조직 멤버 목록 (루트 이양 대상 선택용) */
  @ApiOperation({
    summary: '[ORG-011] 조직 멤버 목록',
    description:
      '조직의 활성 멤버(루트관리자와 일반관리자)를 조회합니다. 삭제된 멤버는 제외합니다. 루트 관리자를 다른 조직원에게 넘길 때 대상을 고르는 데 사용합니다.',
  })
  @ApiOkResponse({ type: OrgMemberSummaryResponseDto, isArray: true })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Get('organizations/:id/members')
  async listOrganizationMembers(@Param('id', ParseIntPipe) id: number) {
    return this.organizationService.listOrganizationMembers(id);
  }

  /** 조직 루트 관리자 이양(기존 조직원 승격) */
  @ApiOperation({
    summary: '[ORG-012] 조직 루트 관리자 이양',
    description:
      '조직의 활성 일반관리자 한 명을 루트 관리자로 올리고 기존 루트 관리자를 일반관리자로 내립니다. 계정을 새로 만들지 않으므로 대상의 부서와 권한, 활동 이력이 유지됩니다. 기존 루트 관리자가 대표 직책을 갖고 있으면 함께 해임합니다(대표는 루트와 동등한 권한자입니다). 두 사람의 기존 로그인은 무효가 되어 다시 로그인해야 합니다. 대상이 그 조직의 활성 일반관리자가 아니면 400 을 반환합니다.',
  })
  @ApiCreatedResponse({ type: RootAdminSummaryResponseDto })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '대상이 그 조직의 활성 일반관리자가 아님' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Post('organizations/:id/root-admin/transfer')
  async transferRootAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferRootAdminDto,
  ) {
    return this.organizationService.transferRootAdmin(id, dto.userId);
  }

  /** 조직 루트 관리자 교체(신규 계정 생성) */
  @ApiOperation({
    summary: '[ORG-013] 조직 루트 관리자 교체(신규 계정)',
    description:
      '조직에 계정이 없는 사람을 루트 관리자로 세웁니다. 계정을 새로 만들어 루트로 두고 기존 루트 관리자는 일반관리자로 내립니다(계정은 남고 대표 직책은 해임됩니다). 이메일이 이미 사용 중이면 409 를 반환합니다. 플랫폼 운영자 계정과는 저장 테이블이 달라 같은 이메일을 쓸 수 있습니다.',
  })
  @ApiCreatedResponse({ type: RootAdminSummaryResponseDto })
  @ApiResponse({ status: 409, description: '이미 사용 중인 이메일' })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '입력값 검증 실패' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Post('organizations/:id/root-admin/replace')
  async replaceRootAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceRootAdminDto,
  ) {
    return this.organizationService.replaceRootAdmin(id, dto);
  }

  /** 조직 ROOT 관리자 이메일 사용 가능 여부(저장 전 사전 확인) */
  @ApiOperation({
    summary: '[ORG-010] 조직 ROOT 관리자 이메일 사용 가능 여부',
    description:
      '조직 ROOT 관리자가 해당 이메일을 쓸 수 있는지 확인합니다. 조직유저의 이메일은 로그인 ID 이며 전체에서 유일해야 하므로 다른 조직이 쓰는 이메일도 사용할 수 없습니다. 확인과 저장 사이에 같은 이메일이 선점될 수 있어 저장 시점의 검증을 대체하지 않습니다.',
  })
  @ApiOkResponse({ type: EmailAvailabilityResponseDto })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @ApiQuery({ name: 'email', description: '확인할 이메일', example: 'root@example.com' })
  @UseGuards(PlatformAdminGuard)
  @Get('organizations/:id/root-admin/email-available')
  async isRootAdminEmailAvailable(
    @Param('id', ParseIntPipe) id: number,
    @Query('email') email: string,
  ) {
    const available = await this.organizationService.isRootAdminEmailAvailable(id, email);
    return { available };
  }

  /** 조직 ROOT 관리자 프로필 수정 */
  @ApiOperation({
    summary: '[ORG-009] 조직 ROOT 관리자 수정',
    description:
      '특정 조직 ROOT 관리자의 이름과 이메일을 수정합니다(제공된 필드만). 이름은 표시 이름이라 중복을 허용하고, 이메일은 로그인 ID 이며 이미 쓰는 계정이 있으면 409 를 반환합니다. 어느 쪽을 바꾸어도 세션은 유지됩니다.',
  })
  @ApiOkResponse({ type: RootAdminSummaryResponseDto })
  @ApiResponse({ status: 409, description: '이미 사용 중인 이메일' })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: 'PLATFORM 조직' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Patch('organizations/:id/root-admin')
  async updateRootAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRootAdminDto,
  ) {
    return this.organizationService.updateRootAdmin(id, dto);
  }

  /** 조직에 부여된 AI도구 key 목록 */
  @ApiOperation({
    summary: '[ORG-007] 조직 AI도구 조회',
    description: '특정 조직에 부여된 AI도구 key 목록을 조회합니다.',
  })
  @ApiOkResponse({ type: String, isArray: true, description: '부여된 AI 도구 key 목록' })
  @ApiResponse({ status: 404, description: '조직을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Get('organizations/:id/ai-tools')
  async getOrganizationAiTools(@Param('id', ParseIntPipe) id: number) {
    return this.organizationService.getOrganizationAiTools(id);
  }

  /** 조직 ROOT 관리자 비밀번호 재설정 */
  @ApiOperation({
    summary: '[ORG-008] 조직 ROOT 비밀번호 재설정',
    description: '특정 조직 ROOT 관리자의 비밀번호를 재설정합니다.',
  })
  @ApiCreatedResponse({ type: SuccessResponseDto })
  @ApiResponse({ status: 404, description: '조직 또는 루트 관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '처리할 수 없는 조직(PLATFORM)' })
  @ApiParam({ name: 'id', description: '조직 ID', example: 1 })
  @UseGuards(PlatformAdminGuard)
  @Post('organizations/:id/root-admin/reset-password')
  async resetRootPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetRootPasswordDto,
  ) {
    await this.organizationService.resetRootPassword(id, dto.password);
    return { success: true };
  }
}

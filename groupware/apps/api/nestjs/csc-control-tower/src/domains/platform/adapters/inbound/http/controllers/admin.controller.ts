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
import { PlatformRootGuard } from '../../../../../../shared/guards';
import {
  ADMIN_MANAGEMENT_PORT,
  AdminManagementPort,
} from '../../../../core/application/ports/inbound/admin-management.port';
import {
  AdminFeatureCatalogItemResponseDto,
  AdminSummaryResponseDto,
} from '../dto/admin-summary.response.dto';
import { EmailAvailabilityResponseDto, SuccessResponseDto } from '../dto/common.response.dto';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { SetAdminFeaturesDto } from '../dto/set-admin-features.dto';
import { UpdateAdminDto } from '../dto/update-admin.dto';

/**
 * 플랫폼 관리자 관리 Inbound Adapter: ROOT 전용(PlatformRootGuard)
 * 전역 ServiceTokenGuard(서버 간) + PlatformRootGuard(플랫폼 ROOT JWT) 이중 보호. 내부망 전용
 * admin_users 쓰기는 user 서버에 위임(소유권)
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('platform')
export class AdminController {
  constructor(
    @Inject(ADMIN_MANAGEMENT_PORT)
    private readonly adminService: AdminManagementPort,
  ) {}

  /** 플랫폼 관리자 목록 */
  @ApiOperation({
    summary: '[ADMIN-001] 플랫폼 관리자 목록',
    description: '플랫폼 관리자(ADMIN/ROOT) 전체 목록을 조회합니다.',
  })
  @ApiOkResponse({ type: AdminSummaryResponseDto, isArray: true })
  @UseGuards(PlatformRootGuard)
  @Get('admins')
  async listAdmins() {
    return this.adminService.listAdmins();
  }

  /** 플랫폼 관리자(ADMIN) 추가 (+초기 옵션) */
  @ApiOperation({
    summary: '[ADMIN-002] 플랫폼 관리자 추가',
    description: '신규 플랫폼 관리자(ADMIN)를 초기 부여 옵션과 함께 생성합니다.',
  })
  @ApiCreatedResponse({ type: AdminSummaryResponseDto })
  @ApiResponse({ status: 409, description: '이미 사용 중인 이메일' })
  @UseGuards(PlatformRootGuard)
  @Post('admins')
  async createAdmin(@Body() dto: CreateAdminDto) {
    return this.adminService.createAdmin(dto);
  }

  /** 이메일 사용 가능 여부(저장 전 사전 확인) */
  @ApiOperation({
    summary: '[ADMIN-008] 관리자 이메일 사용 가능 여부',
    description:
      '해당 이메일로 플랫폼 관리자를 만들거나 수정할 수 있는지 확인합니다. 이미 같은 이메일의 관리자가 있으면 available=false 를 반환합니다. 확인과 저장 사이에 다른 요청이 같은 이메일을 선점할 수 있어 저장 시점의 검증을 대체하지 않습니다.',
  })
  @ApiOkResponse({ type: EmailAvailabilityResponseDto })
  @ApiQuery({ name: 'email', description: '확인할 이메일', example: 'admin@csc.kr' })
  @ApiQuery({
    name: 'excludeId',
    required: false,
    description: '검사에서 제외할 관리자 id(수정 대상 자신). 생략 시 전체 검사',
    example: 2,
  })
  @UseGuards(PlatformRootGuard)
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

  /** 플랫폼 관리자 프로필 수정(name, email) */
  @ApiOperation({
    summary: '[ADMIN-003] 플랫폼 관리자 수정',
    description:
      '플랫폼 관리자의 프로필(표시 이름, 로그인 이메일)을 수정합니다. 이메일이 이미 사용 중이면 409, 루트 관리자의 이메일 변경 요청은 400 을 반환합니다.',
  })
  @ApiOkResponse({ type: AdminSummaryResponseDto })
  @ApiResponse({ status: 409, description: '이미 사용 중인 이메일' })
  @ApiResponse({ status: 404, description: '관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '루트 관리자의 이메일 변경 시도' })
  @ApiParam({ name: 'id', description: '플랫폼 관리자 ID', example: 1 })
  @UseGuards(PlatformRootGuard)
  @Patch('admins/:id')
  async updateAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.adminService.updateAdmin(id, dto);
  }

  /** 플랫폼 관리자 삭제(ROOT 불가) */
  @ApiOperation({
    summary: '[ADMIN-004] 플랫폼 관리자 삭제',
    description: '플랫폼 관리자를 삭제합니다. ROOT 관리자는 삭제할 수 없습니다.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiResponse({ status: 404, description: '관리자를 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '루트 관리자 삭제 시도' })
  @ApiParam({ name: 'id', description: '플랫폼 관리자 ID', example: 1 })
  @UseGuards(PlatformRootGuard)
  @Delete('admins/:id')
  async deleteAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.adminService.deleteAdmin(id);
    return { success: true };
  }

  /** 관리자에게 부여된 옵션 key */
  @ApiOperation({
    summary: '[ADMIN-005] 관리자 옵션 조회',
    description: '특정 플랫폼 관리자에게 부여된 옵션 key 목록을 조회합니다.',
  })
  @ApiOkResponse({ type: String, isArray: true, description: '부여된 옵션 key 목록' })
  @ApiResponse({ status: 404, description: '관리자를 찾을 수 없음' })
  @ApiParam({ name: 'id', description: '플랫폼 관리자 ID', example: 1 })
  @UseGuards(PlatformRootGuard)
  @Get('admins/:id/features')
  async getAdminFeatures(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getAdminFeatures(id);
  }

  /** 관리자 옵션 일괄 설정 */
  @ApiOperation({
    summary: '[ADMIN-006] 관리자 옵션 일괄 설정',
    description: '특정 플랫폼 관리자의 옵션 key 집합을 전달된 목록으로 동기화합니다.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiResponse({ status: 404, description: '관리자를 찾을 수 없음' })
  @ApiParam({ name: 'id', description: '플랫폼 관리자 ID', example: 1 })
  @UseGuards(PlatformRootGuard)
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
    summary: '[ADMIN-007] 관리자 옵션 카탈로그',
    description: '부여 가능한 플랫폼 관리자 옵션 카탈로그 전체를 조회합니다.',
  })
  @ApiOkResponse({ type: AdminFeatureCatalogItemResponseDto, isArray: true })
  @UseGuards(PlatformRootGuard)
  @Get('admin-features')
  async listAdminFeatureCatalog() {
    return this.adminService.listAdminFeatureCatalog();
  }
}

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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  DEPARTMENT_MANAGEMENT_PORT,
  DepartmentActor,
  DepartmentManagementPort,
} from '../../../../core/application/ports/inbound/department-management.port';
import {
  PERMISSION_MANAGEMENT_PORT,
  PermissionManagementPort,
} from '../../../../core/application/ports/inbound/permission-management.port';
import {
  AI_TOOL_DISTRIBUTION_PORT,
  AiToolDistributionPort,
} from '../../../../core/application/ports/inbound/ai-tool-distribution.port';
import {
  POSITION_MANAGEMENT_PORT,
  PositionManagementPort,
} from '../../../../core/application/ports/inbound/position-management.port';
import { AccessTokenPayload } from '../../../../core/domain/types/user.types';
import { DepartmentEntity } from '../../../../core/domain/entities/department.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CreateDepartmentDto } from '../dto/create-department.dto';
import { UpdateDepartmentDto } from '../dto/update-department.dto';
import { SetPermissionsDto } from '../dto/set-permissions.dto';
import { SetAiToolsDto } from '../dto/set-ai-tools.dto';
import { SetPositionDto } from '../dto/set-position.dto';

/**
 * 부서(조직도) 관리 Inbound Adapter: 슈퍼관리자(조직 ROOT)가 조직 부서 트리를 관리
 * JWT(본인) 인증: organizationId/role 은 호출자 토큰(req.user). 경로는 web/groupware BFF 가
 * 호출하는 형태(/user-api/org/departments* 등). 테넌트 격리, ROOT 강제는 DepartmentManagementService 가 강제
 */
@ApiTags('department')
@ApiBearerAuth()
@Controller('user-api')
@UseGuards(JwtAuthGuard)
export class DepartmentController {
  constructor(
    @Inject(DEPARTMENT_MANAGEMENT_PORT)
    private readonly departments: DepartmentManagementPort,
    @Inject(PERMISSION_MANAGEMENT_PORT)
    private readonly permissions: PermissionManagementPort,
    @Inject(AI_TOOL_DISTRIBUTION_PORT)
    private readonly aiToolDistribution: AiToolDistributionPort,
    @Inject(POSITION_MANAGEMENT_PORT)
    private readonly positions: PositionManagementPort,
  ) {}

  private actorOf(req: Request & { user: AccessTokenPayload }): DepartmentActor {
    return {
      id: req.user.id,
      role: req.user.role,
      principalType: req.user.principalType,
      organizationId: req.user.organizationId,
      permissions: req.user.permissions,
      position: req.user.position,
    };
  }

  private toSummary(d: DepartmentEntity) {
    return { id: d.id, parentId: d.parentId, name: d.name };
  }

  /** 조직 부서 전체(트리 구성용) */
  @ApiOperation({
    summary: '[DEPARTMENT-001] 조직 부서 목록',
    description: '조직 부서 전체를 조회한다(트리 구성용).',
  })
  @Get('org/departments')
  async list(@Req() req: Request & { user: AccessTokenPayload }) {
    const list = await this.departments.listDepartments(this.actorOf(req));
    return list.map((d) => this.toSummary(d));
  }

  /** 부서 추가(하위조직) */
  @ApiOperation({
    summary: '[DEPARTMENT-002] 부서 추가',
    description: '하위조직(부서)을 새로 추가한다.',
  })
  @Post('org/departments')
  async create(
    @Req() req: Request & { user: AccessTokenPayload },
    @Body() dto: CreateDepartmentDto,
  ) {
    const dept = await this.departments.createDepartment(this.actorOf(req), dto);
    return this.toSummary(dept);
  }

  /** 부서 수정(이름 변경 / 이동) */
  @ApiOperation({
    summary: '[DEPARTMENT-003] 부서 수정',
    description: '부서 이름을 변경하거나 상위 부서로 이동한다.',
  })
  @ApiParam({ name: 'id', description: '부서 id', example: 7 })
  @Patch('org/departments/:id')
  async update(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
  ) {
    const dept = await this.departments.updateDepartment(this.actorOf(req), id, dto);
    return this.toSummary(dept);
  }

  /** 부서 삭제(서브트리 + 소속 멤버 미배치) */
  @ApiOperation({
    summary: '[DEPARTMENT-004] 부서 삭제',
    description: '부서 서브트리를 삭제하고 소속 멤버를 미배치 상태로 만든다.',
  })
  @ApiParam({ name: 'id', description: '부서 id', example: 7 })
  @Delete('org/departments/:id')
  async remove(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.departments.deleteDepartment(this.actorOf(req), id);
    return { success: true };
  }

  // 권한 부여(부서/멤버): 편집 매트릭스 조회 + 설정

  /** 조직 권한 부여 현황(편집 UI 용: 부서/멤버 직접 부여) */
  @ApiOperation({
    summary: '[DEPARTMENT-005] 권한 부여 현황 조회',
    description: '조직 권한 부여 매트릭스를 조회한다(편집 UI 용: 부서/멤버 직접 부여).',
  })
  @Get('org/permissions/grants')
  async grantMatrix(@Req() req: Request & { user: AccessTokenPayload }) {
    return this.permissions.getGrantMatrix(this.actorOf(req));
  }

  /** 부서 권한 설정(desired key 집합) */
  @ApiOperation({
    summary: '[DEPARTMENT-006] 부서 권한 설정',
    description: '부서에 부여할 권한 key 집합을 설정한다(desired 집합으로 동기화).',
  })
  @ApiParam({ name: 'id', description: '부서 id', example: 7 })
  @Post('org/departments/:id/permissions')
  async setDepartmentPermissions(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetPermissionsDto,
  ) {
    await this.permissions.setDepartmentPermissions(this.actorOf(req), id, dto.permissionKeys);
    return { success: true };
  }

  /** 멤버(일반관리자) 직접 권한 설정(desired key 집합) */
  @ApiOperation({
    summary: '[DEPARTMENT-007] 멤버 권한 설정',
    description: '멤버(일반관리자)에게 직접 부여할 권한 key 집합을 설정한다(desired 집합으로 동기화).',
  })
  @ApiParam({ name: 'id', description: '멤버 id', example: 12 })
  @Post('org/members/:id/permissions')
  async setMemberPermissions(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetPermissionsDto,
  ) {
    await this.permissions.setMemberPermissions(this.actorOf(req), id, dto.permissionKeys);
    return { success: true };
  }

  // AI도구 배포(조직 보유 도구 → 팀/멤버 부여)

  /** 조직 AI도구 배포 현황(편집 UI 용: 보유 도구, 팀/멤버 부여) */
  @ApiOperation({
    summary: '[DEPARTMENT-008] AI도구 배포 현황 조회',
    description: '조직 AI도구 배포 매트릭스를 조회한다(보유 도구, 팀/멤버 부여 현황).',
  })
  @Get('org/ai-tools/distribution')
  async aiToolDistributionMatrix(@Req() req: Request & { user: AccessTokenPayload }) {
    return this.aiToolDistribution.getDistribution(this.actorOf(req));
  }

  /** 팀(부서) AI도구 설정(desired key 집합) */
  @ApiOperation({
    summary: '[DEPARTMENT-010] 팀(부서) AI도구 설정',
    description: '부서에 부여할 AI도구 key 집합을 설정한다(desired 집합으로 동기화).',
  })
  @ApiParam({ name: 'id', description: '부서 id', example: 7 })
  @Post('org/departments/:id/ai-tools')
  async setDepartmentAiTools(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAiToolsDto,
  ) {
    await this.aiToolDistribution.setDepartmentAiTools(this.actorOf(req), id, dto.aiToolKeys);
    return { success: true };
  }

  /** 멤버(일반관리자) 직접 AI도구 설정(desired key 집합) */
  @ApiOperation({
    summary: '[DEPARTMENT-011] 멤버 AI도구 설정',
    description: '멤버(일반관리자)에게 직접 부여할 AI도구 key 집합을 설정한다(desired 집합으로 동기화).',
  })
  @ApiParam({ name: 'id', description: '멤버 id', example: 12 })
  @Post('org/members/:id/ai-tools')
  async setMemberAiTools(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAiToolsDto,
  ) {
    await this.aiToolDistribution.setMemberAiTools(this.actorOf(req), id, dto.aiToolKeys);
    return { success: true };
  }

  // 직책(대표/팀장): 권한/AI도구와 분리된 별도 차원(멤버당 하나)

  /** 멤버 직책 설정(대표/팀장/해제) */
  @ApiOperation({
    summary: '[DEPARTMENT-012] 멤버 직책 설정',
    description:
      '멤버(일반관리자)에게 직책(대표/팀장)을 지정하거나 해제한다. 대표↔팀장 상호배제(단일 값). ' +
      '대표는 개발관리자(ROOT)만, 팀장은 부서 배치 필수 + 부서당 1명.',
  })
  @ApiParam({ name: 'id', description: '멤버 id', example: 12 })
  @Post('org/members/:id/position')
  async setMemberPosition(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetPositionDto,
  ) {
    await this.positions.setMemberPosition(this.actorOf(req), id, dto.position);
    return { success: true };
  }
}

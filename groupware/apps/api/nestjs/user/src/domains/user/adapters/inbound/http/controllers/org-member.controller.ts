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
  ORG_MEMBER_MANAGEMENT_PORT,
  OrgMemberActor,
  OrgMemberManagementPort,
} from '../../../../core/application/ports/inbound/org-member-management.port';
import { AccessTokenPayload } from '../../../../core/domain/types/user.types';
import { UserEntity } from '../../../../core/domain/entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CreateOrgMemberDto } from '../dto/create-org-member.dto';
import { UpdateOrgMemberDto } from '../dto/update-org-member.dto';
import { ResetMemberPasswordDto } from '../dto/reset-member-password.dto';

/**
 * 조직 사용자관리 Inbound Adapter: 슈퍼관리자(조직 ROOT)가 같은 조직의 일반관리자(ADMIN)를 관리
 * JWT(본인) 인증: organizationId/role 은 호출자 토큰에서 추출(req.user). 경로는 web/groupware BFF
 * 가 호출하는 형태(/user-api/org/members*)에 매칭. 테넌트 격리, ROOT 강제는 OrgMemberManagementService 가 강제
 */
@ApiTags('org-member')
@ApiBearerAuth()
@Controller('user-api')
@UseGuards(JwtAuthGuard)
export class OrgMemberController {
  constructor(
    @Inject(ORG_MEMBER_MANAGEMENT_PORT)
    private readonly orgMembers: OrgMemberManagementPort,
  ) {}

  /** 호출자 토큰 → 서비스 actor(조직/역할 강제는 서비스가 수행) */
  private actorOf(req: Request & { user: AccessTokenPayload }): OrgMemberActor {
    return {
      id: req.user.id,
      role: req.user.role,
      principalType: req.user.principalType,
      organizationId: req.user.organizationId,
      permissions: req.user.permissions,
      position: req.user.position,
    };
  }

  /** 멤버 요약(비밀번호 해시 제외): 표시이름은 name. */
  private toSummary(u: UserEntity) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      position: u.position, // 직책(대표/팀장/null): 조직 관리 UI 가 소비
      status: u.status,
      departmentId: u.departmentId,
      phone: u.phone,
      extension: u.extension,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    };
  }

  /** 조직 멤버(ROOT+ADMIN) 목록 */
  @ApiOperation({
    summary: '[MEMBER-001] 조직 멤버 목록',
    description: '같은 조직 멤버(ROOT+ADMIN) 목록을 조회한다.',
  })
  @Get('org/members')
  async listMembers(@Req() req: Request & { user: AccessTokenPayload }) {
    const members = await this.orgMembers.listMembers(this.actorOf(req));
    return members.map((m) => this.toSummary(m));
  }

  /** 일반관리자(ADMIN) 추가 */
  @ApiOperation({
    summary: '[MEMBER-002] 일반관리자 추가',
    description: '같은 조직에 일반관리자(ADMIN)를 추가한다.',
  })
  @Post('org/members')
  async createMember(
    @Req() req: Request & { user: AccessTokenPayload },
    @Body() dto: CreateOrgMemberDto,
  ) {
    const member = await this.orgMembers.createAdmin(this.actorOf(req), dto);
    return this.toSummary(member);
  }

  /** 일반관리자 표시이름 수정 */
  @ApiOperation({
    summary: '[MEMBER-003] 일반관리자 수정',
    description: '일반관리자의 표시이름/소속 부서/연락처를 수정한다(제공된 필드만).',
  })
  @ApiParam({ name: 'id', description: '멤버 id', example: 12 })
  @Patch('org/members/:id')
  async updateMember(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrgMemberDto,
  ) {
    const member = await this.orgMembers.updateMember(this.actorOf(req), id, dto);
    return this.toSummary(member);
  }

  /** 일반관리자 비밀번호 재설정(잠금해제 + 세션 무효화) */
  @ApiOperation({
    summary: '[MEMBER-004] 일반관리자 비밀번호 재설정',
    description: '일반관리자 비밀번호를 재설정한다(잠금 해제 + 세션 무효화 동반).',
  })
  @ApiParam({ name: 'id', description: '멤버 id', example: 12 })
  @Post('org/members/:id/reset-password')
  async resetMemberPassword(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetMemberPasswordDto,
  ) {
    await this.orgMembers.resetMemberPassword(this.actorOf(req), id, dto.password);
    return { success: true };
  }

  /** 일반관리자 삭제(soft: WITHDRAWN + 세션 무효화): 단계적 삭제 1단계 */
  @ApiOperation({
    summary: '[MEMBER-005] 일반관리자 삭제(soft)',
    description: '일반관리자를 WITHDRAWN 으로 전환하고 세션을 무효화한다(단계적 삭제 1단계).',
  })
  @ApiParam({ name: 'id', description: '멤버 id', example: 12 })
  @Delete('org/members/:id')
  async deleteMember(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.orgMembers.deleteMember(this.actorOf(req), id);
    return { success: true };
  }

  /** 삭제(탈퇴)된 일반관리자 목록: 단계적 삭제 2단계(완전삭제) 화면용 */
  @ApiOperation({
    summary: '[MEMBER-006] 삭제된 일반관리자 목록',
    description: '삭제(탈퇴)된 일반관리자 목록을 조회한다(단계적 삭제 2단계 화면용).',
  })
  @Get('org/members/withdrawn')
  async listWithdrawnMembers(@Req() req: Request & { user: AccessTokenPayload }) {
    const members = await this.orgMembers.listWithdrawnMembers(this.actorOf(req));
    return members.map((m) => this.toSummary(m));
  }

  /** 일반관리자 영구 삭제(hard: 이미 삭제된 대상만): 단계적 삭제 2단계 */
  @ApiOperation({
    summary: '[MEMBER-007] 일반관리자 영구 삭제(hard)',
    description: '이미 삭제(탈퇴)된 일반관리자를 영구 삭제한다(단계적 삭제 2단계).',
  })
  @ApiParam({ name: 'id', description: '멤버 id', example: 12 })
  @Delete('org/members/:id/purge')
  async purgeMember(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.orgMembers.purgeMember(this.actorOf(req), id);
    return { success: true };
  }
}

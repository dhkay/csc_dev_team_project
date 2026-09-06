import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  ORG_DIRECTORY_PORT,
  OrgDirectoryActor,
  OrgDirectoryPort,
} from '../../../../core/application/ports/inbound/org-directory.port';
import { AccessTokenPayload } from '../../../../core/domain/types/user.types';
import { UserEntity } from '../../../../core/domain/entities/user.entity';
import { DepartmentEntity } from '../../../../core/domain/entities/department.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

/**
 * 직원조회(디렉터리) Inbound Adapter: 같은 조직 조직유저(ROOT+ADMIN)가 조직 전체 멤버/부서를 조회
 * JWT(본인) 인증: organizationId/role 은 토큰에서 추출(req.user). 권한(조직유저 강제)은 서비스가 강제
 * 관리(/user-api/org/members*, ROOT 전용)와 분리된 읽기 전용 슬라이스: AppBar 조직 아이콘 팝아웃이 사용
 */
@ApiTags('org-directory')
@ApiBearerAuth()
@Controller('user-api')
@UseGuards(JwtAuthGuard)
export class OrgDirectoryController {
  constructor(
    @Inject(ORG_DIRECTORY_PORT)
    private readonly directory: OrgDirectoryPort,
  ) {}

  /** 호출자 토큰 → 서비스 actor(조직유저 강제는 서비스가 수행) */
  private actorOf(req: Request & { user: AccessTokenPayload }): OrgDirectoryActor {
    return {
      id: req.user.id,
      role: req.user.role,
      principalType: req.user.principalType,
      organizationId: req.user.organizationId,
    };
  }

  /** 멤버 요약(비밀번호 해시 제외): 표시이름은 name. */
  private toSummary(u: UserEntity) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      departmentId: u.departmentId,
      phone: u.phone,
      extension: u.extension,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    };
  }

  /** 부서 요약(트리 구성용): id/parentId/name. */
  private toDept(d: DepartmentEntity) {
    return { id: d.id, parentId: d.parentId, name: d.name };
  }

  /** 직원조회: 조직 전체 멤버 + 부서 트리(같은 조직 조직유저면 조회) */
  @ApiOperation({
    summary: '[DIRECTORY-001] 직원조회(디렉터리)',
    description:
      '같은 조직 조직유저가 조직 전체 멤버와 부서 트리를 조회한다(읽기 전용). ' +
      '기본 응답에는 조직 소유자가 빠진다. 직원 목록을 보여 주는 화면의 규칙이다. ' +
      '남은 기록의 사용자 id 를 이름으로 바꾸는 용도라면 includeRoot 를 참으로 준다. ' +
      '소유자가 빠진 목록으로 이름을 찾으면 그가 만든 항목이 알 수 없는 사용자로 보인다.',
  })
  @ApiQuery({
    name: 'includeRoot',
    required: false,
    type: Boolean,
    description:
      '조직 소유자를 목록에 포함할지. 기본은 제외. 이름 해석용 조회에서 참으로 준다.',
  })
  @Get('org/directory')
  async getDirectory(
    @Req() req: Request & { user: AccessTokenPayload },
    @Query('includeRoot') includeRoot?: string,
  ) {
    const { members, departments } = await this.directory.getDirectory(this.actorOf(req), {
      includeRoot: includeRoot === 'true',
    });
    return {
      members: members.map((m) => this.toSummary(m)),
      departments: departments.map((d) => this.toDept(d)),
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { UserRole } from '../../domain/types/user.types';
import { resolveOrgManagementOrgId } from './org-management-access';
import {
  DepartmentForbiddenError,
  DepartmentNotFoundError,
  OrgMemberForbiddenError,
  OrgMemberNotFoundError,
} from '../../domain/errors';
import { DepartmentActor } from '../ports/inbound/department-management.port';
import { AiToolDistributionPort } from '../ports/inbound/ai-tool-distribution.port';
import {
  AI_TOOL_DISTRIBUTION_REPOSITORY_PORT,
  AiToolDistributionMatrix,
  AiToolDistributionRepositoryPort,
} from '../ports/outbound/ai-tool-distribution-repository.port';
import {
  DEPARTMENT_REPOSITORY_PORT,
  DepartmentRepositoryPort,
} from '../ports/outbound/department-repository.port';
import { USER_REPOSITORY_PORT, UserRepositoryPort } from '../ports/outbound/user-repository.port';

/**
 * AI도구 배포 관리: 슈퍼관리자(조직 ROOT)가 조직 보유(인가받은) AI도구를 팀(부서)/멤버에 부여(조직 내부 결정)
 * 보안 경계: 호출자 ROOT, 대상 부서/멤버가 호출자 조직 소속(테넌트 격리). 조직 보유 범위는 어댑터 FK 가 강제
 * 팀 부여는 그 부서+하위 소속 조직원이 토큰 발급 시 상속
 */
@Injectable()
export class AiToolDistributionService implements AiToolDistributionPort {
  constructor(
    @Inject(AI_TOOL_DISTRIBUTION_REPOSITORY_PORT)
    private readonly dist: AiToolDistributionRepositoryPort,
    @Inject(DEPARTMENT_REPOSITORY_PORT)
    private readonly departments: DepartmentRepositoryPort,
    @Inject(USER_REPOSITORY_PORT)
    private readonly users: UserRepositoryPort,
  ) {}

  async getDistribution(actor: DepartmentActor): Promise<AiToolDistributionMatrix> {
    const orgId = this.assertOrgManager(actor);
    return this.dist.findDistributionByOrganizationId(orgId);
  }

  async setDepartmentAiTools(
    actor: DepartmentActor,
    departmentId: number,
    aiToolKeys: string[],
  ): Promise<void> {
    const orgId = this.assertOrgManager(actor);
    await this.assertSameOrgDept(orgId, departmentId);
    await this.dist.setDepartmentAiToolsRecord(orgId, departmentId, aiToolKeys, actor.id);
  }

  async setMemberAiTools(
    actor: DepartmentActor,
    memberId: number,
    aiToolKeys: string[],
  ): Promise<void> {
    const orgId = this.assertOrgManager(actor);
    await this.assertManageableAdmin(orgId, memberId);
    await this.dist.setUserAiToolsRecord(orgId, memberId, aiToolKeys, actor.id);
  }

  /** 호출자 = 조직 관리 가능(ROOT 또는 시스템관리 권한, 같은 조직). 통과 시 조직 id 반환 */
  private assertOrgManager(actor: DepartmentActor): number {
    const orgId = resolveOrgManagementOrgId(actor);
    if (orgId == null) {
      throw new DepartmentForbiddenError();
    }
    return orgId;
  }

  /** 부서가 존재하고 같은 조직인지 보장 */
  private async assertSameOrgDept(orgId: number, id: number): Promise<void> {
    const dept = await this.departments.findOneRecordById(id);
    if (!dept || dept.organizationId !== orgId) {
      throw new DepartmentNotFoundError(id);
    }
  }

  /** 대상 = 같은 조직의 ADMIN. ROOT/타org/없음은 거부 */
  private async assertManageableAdmin(orgId: number, id: number): Promise<void> {
    const target = await this.users.findOneRecordById(id);
    if (!target || target.organizationId !== orgId) {
      throw new OrgMemberNotFoundError(id);
    }
    if (target.role !== UserRole.ADMIN) {
      throw new OrgMemberForbiddenError('슈퍼관리자에게는 AI도구를 직접 부여할 수 없습니다.');
    }
  }
}

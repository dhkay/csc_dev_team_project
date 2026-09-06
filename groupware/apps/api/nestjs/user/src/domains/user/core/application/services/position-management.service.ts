import { Inject, Injectable } from '@nestjs/common';
import { OrgPosition, isRootRoleOnlyPosition } from '../../domain/types/entitlement-catalog';
import { UserRole } from '../../domain/types/user.types';
import { resolveOrgManagementOrgId } from './org-management-access';
import {
  PositionForbiddenError,
  PositionInvalidError,
  PositionTargetNotFoundError,
  TeamLeaderAlreadyExistsError,
} from '../../domain/errors';
import { DepartmentActor } from '../ports/inbound/department-management.port';
import { PositionManagementPort } from '../ports/inbound/position-management.port';
import { USER_REPOSITORY_PORT, UserRepositoryPort } from '../ports/outbound/user-repository.port';

/** Postgres unique_violation: 부서당 팀장 1명 부분유니크(org_users_dept_team_leader_uq) 위반 backstop. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * 직책 부여 관리: 조직 관리자(루트 권한자/시스템관리)가 멤버(ADMIN)에 직책(대표/팀장)을 임명/해임
 * 직책은 권한/AI도구와 분리된 별도 차원(organization_users.position, 유저당 하나): 단일 컬럼이라
 * 대표↔팀장 상호배제가 구조적으로 보장된다(설정 시 이전 직책 자동 대체)
 * 보안 경계: 호출자 조직 관리 권한 강제 + 테넌트 격리 + 대표=ROOT 역할 전용 + 팀장 부서당 1명/부서 필수
 */
@Injectable()
export class PositionManagementService implements PositionManagementPort {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly users: UserRepositoryPort,
  ) {}

  async setMemberPosition(
    actor: DepartmentActor,
    memberId: number,
    position: OrgPosition | null,
  ): Promise<void> {
    const orgId = this.assertOrgManager(actor);

    const target = await this.users.findOneRecordById(memberId);
    if (!target || target.organizationId !== orgId) {
      throw new PositionTargetNotFoundError(memberId);
    }
    if (target.role !== UserRole.ADMIN) {
      throw new PositionForbiddenError('슈퍼관리자에게는 직책을 지정할 수 없습니다.');
    }

    // 대표(REPRESENTATIVE)는 ROOT 동등 권한 → 임명/해임 모두 ROOT(개발관리자) 역할만(무한 증식 차단)
    //  현재 직책이 대표(해임/교체)거나 지정하려는 직책이 대표(임명)면 ROOT 역할을 요구한다.
    const touchesRepresentative =
      (position != null && isRootRoleOnlyPosition(position)) ||
      (target.position != null && isRootRoleOnlyPosition(target.position));
    if (touchesRepresentative && actor.role !== UserRole.ROOT) {
      throw new PositionForbiddenError('대표는 개발관리자(루트)만 임명/해임할 수 있습니다.');
    }

    if (position === OrgPosition.TeamLeader) {
      // 팀장 = 그 부서의 리더: 부서 배치 필수 + 부서당 1명
      if (target.departmentId == null) {
        throw new PositionInvalidError('팀장은 부서에 배치된 멤버만 지정할 수 있습니다.');
      }
      const existing = await this.users.findTeamLeaderRecordByDepartment(
        orgId,
        target.departmentId,
      );
      if (existing && existing.id !== memberId) {
        throw new TeamLeaderAlreadyExistsError();
      }
    }

    try {
      await this.users.updateMemberPositionRecord(memberId, position);
    } catch (err) {
      // 부분유니크(부서당 팀장 1명) 경합 backstop: 사전 검사와 저장 사이 동시 지정 방어
      if (this.isUniqueViolation(err)) {
        throw new TeamLeaderAlreadyExistsError();
      }
      throw err;
    }
  }

  /** 호출자 = 조직 관리 가능(루트 권한자 ROOT/대표 또는 시스템관리, 같은 조직). 통과 시 조직 id 반환 */
  private assertOrgManager(actor: DepartmentActor): number {
    const orgId = resolveOrgManagementOrgId(actor);
    if (orgId == null) {
      throw new PositionForbiddenError();
    }
    return orgId;
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === PG_UNIQUE_VIOLATION
    );
  }
}

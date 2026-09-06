import { Inject, Injectable } from '@nestjs/common';
import {
  isIndividualOnlyPermission,
  isRootOnlyGrantPermission,
  isRootRoleOnlyGrantPermission,
} from '../../domain/types/entitlement-catalog';
import { UserRole } from '../../domain/types/user.types';
import { hasRootAuthority, resolveOrgManagementOrgId } from './org-management-access';
import {
  DepartmentForbiddenError,
  DepartmentNotFoundError,
  OrgMemberForbiddenError,
  OrgMemberNotFoundError,
} from '../../domain/errors';
import { DepartmentActor } from '../ports/inbound/department-management.port';
import { PermissionManagementPort } from '../ports/inbound/permission-management.port';
import {
  PERMISSION_GRANT_REPOSITORY_PORT,
  PermissionGrantMatrix,
  PermissionGrantRepositoryPort,
} from '../ports/outbound/permission-grant-repository.port';
import {
  DEPARTMENT_REPOSITORY_PORT,
  DepartmentRepositoryPort,
} from '../ports/outbound/department-repository.port';
import { USER_REPOSITORY_PORT, UserRepositoryPort } from '../ports/outbound/user-repository.port';

/**
 * 권한 부여 관리: 조직 관리자(루트 권한자 ROOT/대표 또는 시스템관리 보유자)가 부서(조직도 노드)/
 * 일반관리자(ADMIN)에 권한을 부여. 단 ROOT 전용 부여 권한(시스템관리, 대표)은 루트 권한자만
 * 보안 경계: 호출자 조직 관리 권한 강제, 대상 부서/멤버가 호출자 조직 소속인지 검증(테넌트 격리)
 * 부여는 desired key 집합으로 멱등 reconcile. 부서 부여는 하위 소속 조직원이 토큰 발급 시 상속
 */
@Injectable()
export class PermissionManagementService implements PermissionManagementPort {
  constructor(
    @Inject(PERMISSION_GRANT_REPOSITORY_PORT)
    private readonly grants: PermissionGrantRepositoryPort,
    @Inject(DEPARTMENT_REPOSITORY_PORT)
    private readonly departments: DepartmentRepositoryPort,
    @Inject(USER_REPOSITORY_PORT)
    private readonly users: UserRepositoryPort,
  ) {}

  async getGrantMatrix(actor: DepartmentActor): Promise<PermissionGrantMatrix> {
    const orgId = this.assertOrgManager(actor);
    return this.grants.findGrantMatrixByOrganizationId(orgId);
  }

  async setDepartmentPermissions(
    actor: DepartmentActor,
    departmentId: number,
    permissionKeys: string[],
  ): Promise<void> {
    const orgId = this.assertOrgManager(actor);
    await this.assertSameOrgDept(orgId, departmentId);
    this.assertNoIndividualOnly(permissionKeys);
    await this.assertRootOnlyGrantAllowed(actor, orgId, 'department', departmentId, permissionKeys);
    await this.grants.setDepartmentPermissionsRecord(departmentId, permissionKeys, actor.id);
  }

  async setMemberPermissions(
    actor: DepartmentActor,
    memberId: number,
    permissionKeys: string[],
  ): Promise<void> {
    const orgId = this.assertOrgManager(actor);
    await this.assertManageableAdmin(orgId, memberId);
    await this.assertRootOnlyGrantAllowed(actor, orgId, 'member', memberId, permissionKeys);
    await this.grants.setUserPermissionsRecord(orgId, memberId, permissionKeys, actor.id);
  }

  /** 호출자 = 조직 관리 가능(루트 권한자 ROOT/대표 또는 시스템관리 권한, 같은 조직). 통과 시 조직 id 반환 */
  private assertOrgManager(actor: DepartmentActor): number {
    const orgId = resolveOrgManagementOrgId(actor);
    if (orgId == null) {
      throw new DepartmentForbiddenError();
    }
    return orgId;
  }

  /** 개인(멤버) 전용 권한(예: 대표)은 부서(조직) 단위로 부여할 수 없다. 개인 직접 부여만 허용 */
  private assertNoIndividualOnly(permissionKeys: string[]): void {
    if (permissionKeys.some(isIndividualOnlyPermission)) {
      throw new DepartmentForbiddenError('개인 전용 권한은 부서에 부여할 수 없습니다.');
    }
  }

  /**
   * ROOT 전용 부여 권한의 부여/회수 인가: 권한 상승 차단
   *  - 시스템관리(system-management, ROOT_ONLY): 루트 권한자(ROOT/대표) 만. 일반관리자는 부여 불가
   * ROOT 는 전부 통과. 그 외에는 현재↔desired 에서 변경된 root-only key 만 골라 검사한다.
   * (대표는 권한이 아닌 직책으로 이전됨. PositionManagementService 가 ROOT 전용으로 별도 집행
   *  ROOT_ROLE_ONLY_GRANT_PERMISSION_KEYS 는 현재 비어 있으나 향후 재도입 대비해 2층 구조는 유지한다.)
   */
  private async assertRootOnlyGrantAllowed(
    actor: DepartmentActor,
    orgId: number,
    targetKind: 'department' | 'member',
    targetId: number,
    desiredKeys: string[],
  ): Promise<void> {
    if (actor.role === UserRole.ROOT) return;

    const matrix = await this.grants.findGrantMatrixByOrganizationId(orgId);
    const currentKeys =
      targetKind === 'department'
        ? (matrix.departments.find((d) => d.departmentId === targetId)?.permissionKeys ?? [])
        : (matrix.members.find((m) => m.userId === targetId)?.permissionKeys ?? []);
    const current = new Set(currentKeys.filter(isRootOnlyGrantPermission));
    const desired = new Set(desiredKeys.filter(isRootOnlyGrantPermission));

    // 변경(추가/제거)된 root-only key 만 검사: 나머지는 일반 관리자도 그대로 둘 수 있다.
    const changedKeys = new Set<string>();
    for (const k of desired) if (!current.has(k)) changedKeys.add(k);
    for (const k of current) if (!desired.has(k)) changedKeys.add(k);

    for (const k of changedKeys) {
      // 여기서 actor 는 비-ROOT. ROOT 역할 전용 부여 권한(현재 없음)은 무조건 거부
      if (isRootRoleOnlyGrantPermission(k)) {
        throw new DepartmentForbiddenError('이 권한은 개발관리자(루트)만 부여할 수 있습니다.');
      }
      // 시스템관리 등: 루트 권한자(ROOT/대표): 여기선 비-ROOT 이므로 대표만 통과
      if (!hasRootAuthority(actor)) {
        throw new DepartmentForbiddenError('이 권한은 대표 및 개발관리자만 부여할 수 있습니다.');
      }
    }
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
      throw new OrgMemberForbiddenError('슈퍼관리자에게는 권한을 직접 부여할 수 없습니다.');
    }
  }
}

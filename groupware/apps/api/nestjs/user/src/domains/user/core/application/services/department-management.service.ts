import { Inject, Injectable } from '@nestjs/common';
import { DepartmentEntity } from '../../domain/entities/department.entity';
import { resolveOrgManagementOrgId } from './org-management-access';
import {
  DepartmentForbiddenError,
  DepartmentNotFoundError,
  InvalidDepartmentMoveError,
} from '../../domain/errors';
import {
  CreateDepartmentInput,
  DepartmentActor,
  DepartmentManagementPort,
  UpdateDepartmentInput,
} from '../ports/inbound/department-management.port';
import {
  DEPARTMENT_REPOSITORY_PORT,
  DepartmentRepositoryPort,
} from '../ports/outbound/department-repository.port';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../ports/outbound/user-repository.port';

/**
 * 부서(조직도) 관리: 슈퍼관리자(조직 ROOT)가 조직의 부서 트리를 추가/이름변경/이동/삭제
 * 보안 경계(서비스가 강제):
 *  - 호출자는 ORGANIZATION_USER 의 ROOT 여야 한다(아니면 403)
 *  - 부서는 호출자와 같은 조직(테넌트) 것이어야 한다.
 *  - 이동은 자기 자신/자손 하위로 불가(사이클 방지). 삭제는 서브트리 일괄 + 소속 멤버 미배치
 */
@Injectable()
export class DepartmentManagementService implements DepartmentManagementPort {
  constructor(
    @Inject(DEPARTMENT_REPOSITORY_PORT)
    private readonly departments: DepartmentRepositoryPort,
    @Inject(USER_REPOSITORY_PORT)
    private readonly users: UserRepositoryPort,
  ) {}

  async listDepartments(actor: DepartmentActor): Promise<DepartmentEntity[]> {
    const orgId = this.assertOrgManager(actor);
    return this.departments.findManyRecordsByOrganizationId(orgId);
  }

  async createDepartment(
    actor: DepartmentActor,
    input: CreateDepartmentInput,
  ): Promise<DepartmentEntity> {
    const orgId = this.assertOrgManager(actor);
    const parentId = input.parentId ?? null;
    if (parentId !== null) await this.assertSameOrgDept(orgId, parentId); // 부모 같은 조직
    return this.departments.createRecord({ organizationId: orgId, parentId, name: input.name.trim() });
  }

  async updateDepartment(
    actor: DepartmentActor,
    id: number,
    patch: UpdateDepartmentInput,
  ): Promise<DepartmentEntity> {
    const orgId = this.assertOrgManager(actor);
    await this.assertSameOrgDept(orgId, id);

    if (patch.name !== undefined && patch.name.trim()) {
      await this.departments.updateNameRecord(id, patch.name.trim());
    }
    if (patch.parentId !== undefined) {
      const parentId = patch.parentId;
      if (parentId !== null) {
        if (parentId === id) throw new InvalidDepartmentMoveError();
        await this.assertSameOrgDept(orgId, parentId);
        // 자손 하위로 이동 금지(사이클)
        const all = await this.departments.findManyRecordsByOrganizationId(orgId);
        if (this.descendantIds(all, id).has(parentId)) {
          throw new InvalidDepartmentMoveError('하위 부서로는 이동할 수 없습니다.');
        }
      }
      await this.departments.updateParentRecord(id, parentId);
    }
    return (await this.departments.findOneRecordById(id)) as DepartmentEntity;
  }

  async deleteDepartment(actor: DepartmentActor, id: number): Promise<void> {
    const orgId = this.assertOrgManager(actor);
    await this.assertSameOrgDept(orgId, id);
    const all = await this.departments.findManyRecordsByOrganizationId(orgId);
    const subtree = [id, ...this.descendantIds(all, id)];
    await this.users.clearDepartmentForMembers(subtree); // 소속 멤버 미배치로
    await this.departments.deleteManyRecordsByIds(subtree);
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
  private async assertSameOrgDept(orgId: number, id: number): Promise<DepartmentEntity> {
    const dept = await this.departments.findOneRecordById(id);
    if (!dept || dept.organizationId !== orgId) {
      throw new DepartmentNotFoundError(id);
    }
    return dept;
  }

  /** id 의 모든 자손 부서 id 집합 */
  private descendantIds(all: DepartmentEntity[], id: number): Set<number> {
    const childrenOf = new Map<number, number[]>();
    for (const d of all) {
      if (d.parentId !== null) {
        const arr = childrenOf.get(d.parentId) ?? [];
        arr.push(d.id);
        childrenOf.set(d.parentId, arr);
      }
    }
    const out = new Set<number>();
    const stack = [...(childrenOf.get(id) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (out.has(cur)) continue;
      out.add(cur);
      stack.push(...(childrenOf.get(cur) ?? []));
    }
    return out;
  }
}

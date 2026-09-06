import { Inject, Injectable } from '@nestjs/common';
import { PrincipalType, UserRole } from '../../domain/types/user.types';
import { OrgMemberForbiddenError } from '../../domain/errors';
import {
  OrgDirectory,
  OrgDirectoryActor,
  OrgDirectoryOptions,
  OrgDirectoryPort,
} from '../ports/inbound/org-directory.port';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../ports/outbound/user-repository.port';
import {
  DEPARTMENT_REPOSITORY_PORT,
  DepartmentRepositoryPort,
} from '../ports/outbound/department-repository.port';

/**
 * 직원조회(디렉터리): 같은 조직 조직유저가 조직 전체 멤버/부서를 읽는다(읽기 전용)
 * 보안 경계(서비스가 강제): 호출자는 ORGANIZATION_USER 이고 organizationId 가 있어야 한다(역할 무관)
 * 관리(ROOT 전용)와 권한 모델이 달라 OrgMemberManagementService 와 분리한다.
 */
@Injectable()
export class OrgDirectoryService implements OrgDirectoryPort {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly users: UserRepositoryPort,
    @Inject(DEPARTMENT_REPOSITORY_PORT)
    private readonly departments: DepartmentRepositoryPort,
  ) {}

  async getDirectory(
    actor: OrgDirectoryActor,
    options: OrgDirectoryOptions = {},
  ): Promise<OrgDirectory> {
    const orgId = this.assertOrgMember(actor);
    const [allMembers, departments] = await Promise.all([
      this.users.findManyRecordsByOrganizationId(orgId), // 활성 멤버(WITHDRAWN 제외)
      this.departments.findManyRecordsByOrganizationId(orgId),
    ]);
    // 직원조회 = 직원(일반관리자) 디렉터리: 조직 소유자(ROOT)는 제외한다.
    //   다만 이 응답을 id → 이름 해석에 쓰는 호출자는 소유자까지 필요하다. 빠지면 그가 올린
    //   파일이 화면에 `알 수 없는 사용자` 로 나온다(스토리지의 올린 사람 컬럼이 그 자리다)
    const members = options.includeRoot
      ? allMembers
      : allMembers.filter((m) => m.role !== UserRole.ROOT);
    return { members, departments };
  }

  /** 호출자 = 같은 조직 조직유저(ROOT/ADMIN/향후 EMPLOYEE) 강제. 통과 시 조직 id 반환 */
  private assertOrgMember(actor: OrgDirectoryActor): number {
    if (actor.principalType !== PrincipalType.ORGANIZATION_USER || actor.organizationId == null) {
      throw new OrgMemberForbiddenError();
    }
    return actor.organizationId;
  }
}

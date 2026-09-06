import { Inject, Injectable } from '@nestjs/common';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserRole, UserStatus } from '../../domain/types/user.types';
import {
  DepartmentNotFoundError,
  OrgMemberEmailAlreadyExistsError,
  OrgMemberForbiddenError,
  OrgMemberNotFoundError,
} from '../../domain/errors';
import {
  CreateOrgMemberInput,
  OrgMemberActor,
  OrgMemberManagementPort,
  UpdateOrgMemberInput,
} from '../ports/inbound/org-member-management.port';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../ports/outbound/user-repository.port';
import {
  DEPARTMENT_REPOSITORY_PORT,
  DepartmentRepositoryPort,
} from '../ports/outbound/department-repository.port';
import { PASSWORD_HASHER_PORT, PasswordHasherPort } from '../ports/outbound/password-hasher.port';
import { resolveOrgManagementOrgId } from './org-management-access';

/**
 * 조직유저 관리: 슈퍼관리자(조직 ROOT)가 같은 조직의 일반관리자(ADMIN)를 추가/편집/삭제
 * 보안 경계(서비스가 강제):
 *  - 호출자는 ORGANIZATION_USER 의 ROOT 여야 한다(아니면 403)
 *  - 대상은 호출자와 같은 조직의 ADMIN 이어야 한다(타org, ROOT 대상은 거부: 테넌트 격리)
 *  - 이메일(로그인 ID)은 조직 범위(UNIQUE org_id,email)에서 중복 불가
 *    이름은 표시 이름이라 중복을 허용한다(동명이인이 정상: 사람 식별은 id 로 한다)
 */
@Injectable()
export class OrgMemberManagementService implements OrgMemberManagementPort {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly users: UserRepositoryPort,
    @Inject(DEPARTMENT_REPOSITORY_PORT)
    private readonly departments: DepartmentRepositoryPort,
    @Inject(PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async listMembers(actor: OrgMemberActor): Promise<UserEntity[]> {
    const orgId = this.assertOrgManager(actor);
    return this.users.findManyRecordsByOrganizationId(orgId);
  }

  async listWithdrawnMembers(actor: OrgMemberActor): Promise<UserEntity[]> {
    const orgId = this.assertOrgManager(actor);
    return this.users.findManyWithdrawnRecordsByOrganizationId(orgId);
  }

  async createAdmin(actor: OrgMemberActor, input: CreateOrgMemberInput): Promise<UserEntity> {
    const orgId = this.assertOrgManager(actor);
    // 로그인 ID 는 전역 유일이다(UNIQUE email). 로그인이 조직을 모른 채 이메일로 계정을 찾으므로
    // 다른 조직이 쓰는 이메일도 충돌이다. 상태 무관(WITHDRAWN 포함)이어야 DB 제약과 판정이 맞는다.
    if (await this.users.findOneRecordByEmail(input.email)) {
      throw new OrgMemberEmailAlreadyExistsError(input.email);
    }
    const departmentId = await this.resolveDepartmentId(orgId, input.departmentId);
    const passwordHash = await this.passwordHasher.hash(input.password);
    return this.users.createRecord({
      email: input.email,
      passwordHash,
      name: input.name,
      organizationId: orgId,
      departmentId, // 소속 부서(없으면 null=미배치)
      phone: input.phone ?? null, // 연락처(선택)
      extension: input.extension ?? null,
      role: UserRole.ADMIN, // 추가되는 멤버는 일반관리자. ROOT 는 조직 생성 시만
    });
  }

  async updateMember(
    actor: OrgMemberActor,
    id: number,
    patch: UpdateOrgMemberInput,
  ): Promise<UserEntity> {
    const orgId = this.assertOrgManager(actor);
    const target = await this.assertManageableAdmin(orgId, id);
    if (patch.name !== undefined && patch.name !== target.name) {
      // 이름 중복 검사는 하지 않는다. 표시 이름이라 동명이인이 정상이다.
      await this.users.updateProfileRecord(id, { name: patch.name });
    }
    if (patch.email !== undefined && patch.email !== target.email) {
      // 로그인 ID 변경: 중복 검사는 생성(createAdmin)과 같은 범위로 한다.
      //   전역이며 상태 무관(WITHDRAWN 포함)이어야 DB UNIQUE(email) 과 판정이 어긋나지 않는다.
      //   자기 자신은 제외(대소문자만 바꾸는 변경도 통과해야 한다)
      const dup = await this.users.findOneRecordByEmail(patch.email);
      if (dup && dup.id !== id) {
        throw new OrgMemberEmailAlreadyExistsError(patch.email);
      }
      await this.users.updateEmailRecord(id, patch.email);
    }
    if (patch.departmentId !== undefined) {
      const departmentId = await this.resolveDepartmentId(orgId, patch.departmentId);
      await this.users.updateMemberDepartmentRecord(id, departmentId);
    }
    if (patch.phone !== undefined || patch.extension !== undefined) {
      await this.users.updateProfileRecord(id, {
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.extension !== undefined ? { extension: patch.extension } : {}),
      });
    }
    return (await this.users.findOneRecordById(id)) as UserEntity; // 수정 반영본 재조회
  }

  async resetMemberPassword(
    actor: OrgMemberActor,
    id: number,
    password: string,
  ): Promise<void> {
    const orgId = this.assertOrgManager(actor);
    await this.assertManageableAdmin(orgId, id);
    const passwordHash = await this.passwordHasher.hash(password);
    await this.users.updatePasswordHashRecord(id, passwordHash);
    await this.users.updateLoginSecurityRecord(id, 0, null); // 잠금 해제
    await this.users.incrementTokenVersionRecord(id); // 세션 즉시 무효화
  }

  async deleteMember(actor: OrgMemberActor, id: number): Promise<void> {
    const orgId = this.assertOrgManager(actor);
    await this.assertManageableAdmin(orgId, id);
    await this.users.updateMemberStatusRecord(id, UserStatus.WITHDRAWN); // soft-delete
    await this.users.incrementTokenVersionRecord(id); // 세션 즉시 무효화
  }

  async purgeMember(actor: OrgMemberActor, id: number): Promise<void> {
    const orgId = this.assertOrgManager(actor);
    const target = await this.assertManageableAdmin(orgId, id); // 같은 조직 ADMIN(ROOT/타org/없음 거부)
    // 단계적 삭제: 영구 삭제는 이미 삭제(soft-delete=WITHDRAWN)된 대상만. 활성 멤버는 먼저 삭제해야 한다.
    if (target.status !== UserStatus.WITHDRAWN) {
      throw new OrgMemberForbiddenError('영구 삭제는 이미 삭제된(탈퇴) 관리자만 가능합니다. 먼저 삭제하세요.');
    }
    await this.users.purgeMemberRecord(id); // hard-delete: 이메일 슬롯 회수
  }

  /** 소속 부서 검증: null/미지정이면 미배치(null). 지정 시 같은 조직 부서여야 함(아니면 404) */
  private async resolveDepartmentId(
    orgId: number,
    departmentId: number | null | undefined,
  ): Promise<number | null> {
    if (departmentId == null) return null;
    const dept = await this.departments.findOneRecordById(departmentId);
    if (!dept || dept.organizationId !== orgId) {
      throw new DepartmentNotFoundError(departmentId);
    }
    return departmentId;
  }

  /** 호출자 = 조직 관리 가능(ROOT 또는 시스템관리 권한, 같은 조직). 통과 시 조직 id 반환 */
  private assertOrgManager(actor: OrgMemberActor): number {
    const orgId = resolveOrgManagementOrgId(actor);
    if (orgId == null) {
      throw new OrgMemberForbiddenError();
    }
    return orgId;
  }

  /** 대상 = 같은 조직의 ADMIN(관리 가능). ROOT/타org/없음은 거부 */
  private async assertManageableAdmin(orgId: number, id: number): Promise<UserEntity> {
    const target = await this.users.findOneRecordById(id);
    if (!target || target.organizationId !== orgId) {
      throw new OrgMemberNotFoundError(id);
    }
    if (target.role !== UserRole.ADMIN) {
      throw new OrgMemberForbiddenError('슈퍼관리자는 이 화면에서 관리할 수 없습니다.');
    }
    return target;
  }
}

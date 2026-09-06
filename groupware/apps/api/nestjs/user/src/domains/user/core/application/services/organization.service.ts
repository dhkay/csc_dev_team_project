import { Inject, Injectable } from '@nestjs/common';
import { OrgStatus, OrgType, UserRole, UserStatus, UserType } from '../../domain/types/user.types';
import { AiToolResolved, isReservedSlug } from '../../domain/types';
import { OrgPosition } from '../../domain/types/entitlement-catalog';
import { OrganizationEntity, UserEntity } from '../../domain/entities/user.entity';
import {
  CannotModifyPlatformOrganizationError,
  OrganizationNotFoundError,
  OrganizationSlugAlreadyExistsError,
  ReservedOrganizationSlugError,
  RootAdminEmailAlreadyExistsError,
  RootAdminNotFoundError,
  RootAdminTransferTargetInvalidError,
} from '../../domain/errors';
import {
  CreateOrganizationInput,
  CreateOrganizationResult,
  OrganizationPort,
  UpdateOrganizationInput,
} from '../ports/inbound/organization.port';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../ports/outbound/user-repository.port';
import {
  PASSWORD_HASHER_PORT,
  PasswordHasherPort,
} from '../ports/outbound/password-hasher.port';

/**
 * 조직(테넌트) 프로비저닝: 신규 회사 + 그 회사 ROOT 관리자를 함께 생성한다.
 * 테넌트 ROOT 는 groupware 를 쓰는 사용자이므로 userType=WEB_USER.
 */
@Injectable()
export class OrganizationService implements OrganizationPort {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepository: UserRepositoryPort,
    @Inject(PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async createOrganization(input: CreateOrganizationInput): Promise<CreateOrganizationResult> {
    // 예약어 검사가 중복 검사보다 먼저다. 예약어는 DB 에 없으므로 중복으로는 잡히지 않는다.
    if (isReservedSlug(input.slug)) {
      throw new ReservedOrganizationSlugError(input.slug);
    }
    const existing = await this.userRepository.findOrganizationBySlug(input.slug);
    if (existing) {
      throw new OrganizationSlugAlreadyExistsError(input.slug);
    }
    // ROOT 로그인 ID 선점 검사: 전역 유일이라 다른 조직이 쓰는 이메일도 충돌이다.
    // 이 검사가 없으면 조직 행을 만든 뒤 유저 생성이 DB 제약에 걸려, 조직만 남고 500 이 나간다.
    const emailTaken = await this.userRepository.findOneRecordByEmail(input.rootAdmin.email);
    if (emailTaken) {
      throw new RootAdminEmailAlreadyExistsError(input.rootAdmin.email);
    }

    const organization = await this.userRepository.createOrganizationRecord({
      slug: input.slug,
      name: input.name,
      type: OrgType.TENANT,
      profileImageUrl: input.profileImageUrl ?? null,
    });

    const passwordHash = await this.passwordHasher.hash(input.rootAdmin.password);
    const rootAdmin = await this.userRepository.createRecord({
      email: input.rootAdmin.email,
      passwordHash,
      name: input.rootAdmin.name,
      organizationId: organization.id,
      role: UserRole.ROOT,
      userType: UserType.WEB_USER,
    });

    return { organization, rootAdmin };
  }

  /**
   * 조직 관리 목록: 운영사가 관리하는 테넌트 조직만 반환한다.
   * 운영사(PLATFORM, CSC Partners)는 그 위에 별도로 존재하는 상위 주체이므로(테넌트가 아님)
   * 목록에서 제외한다. 멀티테넌시: .claude/rules/multi-tenancy.md
   */
  async listOrganizations(): Promise<OrganizationEntity[]> {
    const all = await this.userRepository.findManyOrganizationRecords();
    return all.filter((org) => org.type === OrgType.TENANT);
  }

  /** 조직 수정: 이름/slug/상태. slug 충돌 검사, 정지(SUSPENDED) 시 세션 무효화 */
  async updateOrganization(
    id: number,
    patch: UpdateOrganizationInput,
  ): Promise<OrganizationEntity> {
    const org = await this.assertDeletableOrganization(id); // 존재 + PLATFORM 아님

    // WITHDRAWN(소프트 삭제) 조직은 편집 저장으로 상태를 되살릴 수 없다. 복구는 recoverOrganization 전용
    // 이 불변식을 프레젠테이션 레이어(클라이언트가 status 미전송)가 아니라 소유 도메인에서 강제한다:
    // 어떤 호출자가 status 를 보내든 WITHDRAWN 조직이면 status 변경을 버린다.
    // 타입 고정(UpdateOrganizationInput): 구조분해로 status 를 뺀 결과가 유니온이 되어 이후 .status 접근이
    // 막히는 것을 방지(모든 필드 optional 이라 status 뺀 객체도 그대로 대입 가능)
    const effectivePatch: UpdateOrganizationInput =
      org.status === OrgStatus.WITHDRAWN && patch.status !== undefined
        ? (({ status: _status, ...rest }) => rest)(patch)
        : patch;

    if (effectivePatch.slug !== undefined && effectivePatch.slug !== org.slug) {
      if (isReservedSlug(effectivePatch.slug)) {
        throw new ReservedOrganizationSlugError(effectivePatch.slug);
      }
      const conflict = await this.userRepository.findOrganizationBySlug(effectivePatch.slug);
      if (conflict) {
        throw new OrganizationSlugAlreadyExistsError(effectivePatch.slug);
      }
    }

    const updated = await this.userRepository.updateOrganizationRecord(id, effectivePatch);

    // AI도구 grant 동기화: 제공된 경우에만(원하는 key 전체 집합으로 reconcile)
    if (effectivePatch.aiTools !== undefined) {
      await this.userRepository.setOrganizationAiToolsRecord(id, effectivePatch.aiTools);
    }

    // 정지(SUSPENDED) 로 전환 시에만 그 조직 유저 세션을 즉시 차단(token_version bump)
    // slug/name 변경은 세션을 무효화하지 않는다. 토큰에 slug 를 담지 않고 라우팅이
    // findData(현재 slug)로 self-heal 하므로(AccessTokenPayload 주석 참고), 이름변경에
    // 강제 재로그인은 불필요하다.
    if (effectivePatch.status === OrgStatus.SUSPENDED && org.status !== OrgStatus.SUSPENDED) {
      await this.userRepository.bumpTokenVersionByOrganizationId(id);
    }

    return updated;
  }

  /** 소프트 삭제: 조직을 WITHDRAWN 으로 + 그 조직 유저 세션 일괄 무효화 */
  async withdrawOrganization(id: number): Promise<void> {
    await this.assertDeletableOrganization(id);
    await this.userRepository.updateOrganizationStatusRecord(id, OrgStatus.WITHDRAWN);
    await this.userRepository.bumpTokenVersionByOrganizationId(id);
  }

  /**
   * 복구: WITHDRAWN 조직을 ACTIVE 로 되돌린다(소프트 삭제 되돌리기)
   * 소프트 삭제는 하위 데이터/파일 스토리지를 그대로 보존하므로 상태만 되돌리면 완전 복구된다.
   * (토큰은 삭제 시 bump 됐으니 사용자는 재로그인). WITHDRAWN 이 아니면 멱등(그대로 반환)
   */
  async recoverOrganization(id: number): Promise<OrganizationEntity> {
    const org = await this.assertDeletableOrganization(id); // 존재 + PLATFORM 아님
    if (org.status !== OrgStatus.WITHDRAWN) {
      return org; // 활성/정지는 복구 대상 아님: 정지 해제는 수정(update)으로 처리
    }
    return this.userRepository.updateOrganizationRecord(id, { status: OrgStatus.ACTIVE });
  }

  /** 하드 삭제: 조직 유저 전원 + 조직 행 영구 제거(비가역) */
  async purgeOrganization(id: number): Promise<void> {
    await this.assertDeletableOrganization(id);
    await this.userRepository.purgeOrganizationRecord(id);
  }

  /** 조직 ROOT 관리자 조회: 테넌트 조직만(PLATFORM 차단) */
  async getRootAdmin(organizationId: number): Promise<UserEntity> {
    await this.assertDeletableOrganization(organizationId); // 존재 + PLATFORM 아님
    const root = await this.userRepository.findRootByOrganizationId(organizationId);
    if (!root) {
      throw new RootAdminNotFoundError(organizationId);
    }
    return root;
  }

  /**
   * 조직 ROOT 관리자 프로필 수정: 운영사가 조직 생성 시 넣은 값을 사후 정정한다.
   * 이름은 표시 이름이라 중복 검사가 없다. 이메일은 로그인 ID 라 전역 중복 검사를 거치되,
   * 세션은 무효화하지 않는다(비밀번호 재설정과 다르다. 토큰은 이메일이 아니라 id 로 주체를 가린다)
   */
  async updateRootAdmin(
    organizationId: number,
    patch: { name?: string; email?: string },
  ): Promise<UserEntity> {
    const root = await this.getRootAdmin(organizationId); // 존재 + PLATFORM 아님 + ROOT 확인
    if (patch.name !== undefined) {
      await this.userRepository.updateProfileRecord(root.id, { name: patch.name.trim() });
    }
    if (patch.email !== undefined && patch.email !== root.email) {
      // 조직 멤버 관리(org-member)와 같은 판정: 전역 + 상태 무관(WITHDRAWN 포함) + 자기 자신 제외
      // DB UNIQUE(email) 과 어긋나지 않게 범위를 맞춘다.
      const dup = await this.userRepository.findOneRecordByEmail(patch.email);
      if (dup && dup.id !== root.id) {
        throw new RootAdminEmailAlreadyExistsError(patch.email);
      }
      await this.userRepository.updateEmailRecord(root.id, patch.email);
    }
    return (await this.userRepository.findOneRecordById(root.id)) as UserEntity;
  }

  /**
   * 저장 전 사전 확인. 화면이 이 결과로 저장 버튼을 열어주지만, 확인과 저장 사이에 같은
   * 이메일이 선점될 수 있으므로 updateRootAdmin 의 검증은 그대로 둔다.
   */
  async isRootAdminEmailAvailable(organizationId: number, email: string): Promise<boolean> {
    const root = await this.getRootAdmin(organizationId);
    const dup = await this.userRepository.findOneRecordByEmail(email);
    return !dup || dup.id === root.id;
  }

  /** 조직 멤버 목록(ROOT+ADMIN, 탈퇴 제외): 테넌트 조직만 */
  async listMembers(organizationId: number): Promise<UserEntity[]> {
    await this.assertDeletableOrganization(organizationId); // 존재 + PLATFORM 아님
    return this.userRepository.findManyRecordsByOrganizationId(organizationId);
  }

  /**
   * 조직 ROOT 이양: 대상(같은 조직의 활성 일반관리자)을 ROOT 로, 기존 ROOT 를 일반관리자로
   *
   * 기존 조직원을 루트로 세우는 정규 경로다. ROOT 이메일을 그 사람 주소로 바꾸는 방법은
   * 계정을 합치지 못한다. 그 사람의 부서, 권한, 활동 이력은 원래 계정에 남고 로그인만 옮겨 가
   * 한 사람이 계정 둘을 갖게 된다.
   *
   * 강등된 ROOT 가 대표(REPRESENTATIVE)면 직책도 함께 해임한다. 대표는 역할과 별개 축이지만
   * 루트와 동등한 권한자(hasRootAuthority)라, 역할만 내리면 권한이 그대로 남아 이양이 무의미해진다.
   */
  async transferRootAdmin(organizationId: number, targetUserId: number): Promise<UserEntity> {
    const root = await this.getRootAdmin(organizationId); // 존재 + PLATFORM 아님 + ROOT 확인
    const target = await this.userRepository.findOneRecordById(targetUserId);
    const eligible =
      target !== null &&
      target.id !== root.id &&
      target.organizationId === organizationId &&
      target.role === UserRole.ADMIN &&
      target.status === UserStatus.ACTIVE;
    if (!eligible) {
      throw new RootAdminTransferTargetInvalidError(targetUserId);
    }
    await this.userRepository.transferRootRecord(root.id, targetUserId, {
      clearFromPosition: root.position === OrgPosition.Representative,
    });
    return (await this.userRepository.findOneRecordById(targetUserId)) as UserEntity;
  }

  /**
   * 조직 ROOT 교체(신규 계정): 조직에 아직 계정이 없는 사람을 루트로 세운다.
   * 기존 ROOT 는 일반관리자로 내려 계정과 이력을 남긴다(삭제는 사용자관리에서 별도로 한다)
   * 대표였다면 직책도 함께 해임한다(이양과 같은 이유: 대표는 루트와 동등 권한자)
   *
   * 플랫폼 운영자가 특정 조직의 루트를 맡는 경우도 이 경로다. 관리자유저(admin_users)와
   * 조직유저(organization_users)는 별개 테이블이라 같은 이메일로 두 계정을 둘 수 있고,
   * 로그인 경로도 갈린다(control-tower 는 플랫폼 계정, groupware 는 조직 계정)
   */
  async replaceRootAdmin(
    organizationId: number,
    input: { email: string; name: string; password: string },
  ): Promise<UserEntity> {
    const root = await this.getRootAdmin(organizationId); // 존재 + PLATFORM 아님 + ROOT 확인
    const taken = await this.userRepository.findOneRecordByEmail(input.email);
    if (taken) {
      throw new RootAdminEmailAlreadyExistsError(input.email);
    }
    const passwordHash = await this.passwordHasher.hash(input.password);
    return this.userRepository.replaceRootWithNewRecord(
      root.id,
      {
        email: input.email,
        passwordHash,
        name: input.name.trim(),
        organizationId,
        role: UserRole.ROOT,
        userType: UserType.WEB_USER,
      },
      { clearFromPosition: root.position === OrgPosition.Representative },
    );
  }

  /**
   * 조직 ROOT 비밀번호 재설정: 운영사가 분실/탈취 복구용으로 새 비번을 지정한다.
   * 부수효과: 무차별 대입 임시 잠금 해제 + token_version bump(그 ROOT 의 기존 세션 즉시 무효화)
   */
  async resetRootPassword(organizationId: number, newPassword: string): Promise<void> {
    await this.assertDeletableOrganization(organizationId);
    const root = await this.userRepository.findRootByOrganizationId(organizationId);
    if (!root) {
      throw new RootAdminNotFoundError(organizationId);
    }
    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.userRepository.updatePasswordHashRecord(root.id, passwordHash);
    await this.userRepository.updateLoginSecurityRecord(root.id, 0, null); // 임시 잠금 해제
    await this.userRepository.incrementTokenVersionRecord(root.id); // 기존 세션 무효화
  }

  /** 조직에 부여된 AI도구 key 목록: 테넌트 조직만(PLATFORM 차단) */
  async getOrganizationAiTools(organizationId: number): Promise<string[]> {
    await this.assertDeletableOrganization(organizationId); // 존재 + PLATFORM 아님
    return this.userRepository.findOrganizationAiToolKeys(organizationId);
  }

  /** 조직에 부여된 AI도구(표시명+slug 포함): 그룹웨어 노출/라우팅용. 테넌트 조직만 */
  async getOrganizationAiToolsResolved(organizationId: number): Promise<AiToolResolved[]> {
    await this.assertDeletableOrganization(organizationId); // 존재 + PLATFORM 아님
    return this.userRepository.findOrganizationAiToolsResolvedRecords(organizationId);
  }

  /** 삭제 가능 여부: 존재 + PLATFORM(벤더) 조직 아님 */
  private async assertDeletableOrganization(id: number): Promise<OrganizationEntity> {
    const org = await this.userRepository.findOrganizationById(id);
    if (!org) {
      throw new OrganizationNotFoundError(id);
    }
    if (org.type === OrgType.PLATFORM) {
      throw new CannotModifyPlatformOrganizationError();
    }
    return org;
  }
}

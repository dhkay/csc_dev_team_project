import { OrganizationEntity, UserEntity } from '../../../domain/entities/user.entity';
import { OrgStatus } from '../../../domain/types/user.types';
import { AiToolResolved } from '../../../domain/types';

/** 조직 + 그 조직 ROOT 관리자 동시 생성 입력 */
export interface CreateOrganizationInput {
  slug: string;
  name: string;
  // 조직 프로필 이미지(로고) 접근 URL: file-upload 저장 후 access_url.
  profileImageUrl?: string | null;
  rootAdmin: {
    email: string;
    password: string;
    name: string;
  };
}

/** 조직 생성 결과 */
export interface CreateOrganizationResult {
  organization: OrganizationEntity;
  rootAdmin: UserEntity;
}

/**
 * 조직(테넌트) 프로비저닝 Inbound Port: 멀티테넌시
 * 플랫폼 운영사(csc-control-tower)가 내부 호출로 신규 회사를 만들 때 사용한다.
 */
/** 조직 수정 입력: 제공된 필드만 갱신. status 는 활성/정지만(삭제는 별도) */
export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  status?: OrgStatus;
  // 조직 프로필 이미지(로고) 접근 URL. null 로 제거 가능
  profileImageUrl?: string | null;
  // 부여할 AI도구 key 전체 집합(제공 시 그대로 동기화). 미제공이면 변경 안 함
  aiTools?: string[];
}

export interface OrganizationPort {
  createOrganization(input: CreateOrganizationInput): Promise<CreateOrganizationResult>;
  /** 전체 조직 목록 (플랫폼 운영사 조직 관리용) */
  listOrganizations(): Promise<OrganizationEntity[]>;
  /** 조직 수정: 이름/slug/상태 */
  updateOrganization(id: number, patch: UpdateOrganizationInput): Promise<OrganizationEntity>;
  /** 소프트 삭제: status=WITHDRAWN + 세션 무효화 */
  withdrawOrganization(id: number): Promise<void>;
  /** 복구: WITHDRAWN → ACTIVE (소프트 삭제 되돌리기). 소프트 삭제는 데이터/스토리지를 보존하므로 상태만 되돌린다. */
  recoverOrganization(id: number): Promise<OrganizationEntity>;
  /** 하드 삭제: 조직 유저+조직 영구 제거 */
  purgeOrganization(id: number): Promise<void>;
  /** 조직의 ROOT 관리자 조회 (테넌트 조직만) */
  getRootAdmin(organizationId: number): Promise<UserEntity>;
  /**
   * 조직 ROOT 관리자 프로필 수정: 운영사가 조직 생성 시 넣은 이름/이메일을 사후 정정한다.
   * 이름은 표시 이름이라 본인(환경설정)도 바꿀 수 있고, 여기서 바꿔도 세션은 유지된다.
   * 이메일은 로그인 ID 라 전역 중복 검사를 거친다(UNIQUE email)
   */
  updateRootAdmin(
    organizationId: number,
    patch: { name?: string; email?: string },
  ): Promise<UserEntity>;
  /**
   * 조직 ROOT 관리자가 이 이메일을 쓸 수 있는지(저장 전 사전 확인)
   * 로그인 ID 는 전역 유일이라 다른 조직이 쓰는 이메일도 사용할 수 없다(자기 자신만 예외)
   */
  isRootAdminEmailAvailable(organizationId: number, email: string): Promise<boolean>;
  /** 조직 멤버 목록(ROOT+ADMIN, 탈퇴 제외): 플랫폼이 이양 대상을 고르는 데 쓴다. */
  listMembers(organizationId: number): Promise<UserEntity[]>;
  /**
   * 조직 ROOT 이양: 그 조직의 활성 일반관리자를 ROOT 로 올리고 기존 ROOT 를 일반관리자로 내린다.
   * 계정을 새로 만들지 않는다. 이미 있는 조직원을 루트로 세우는 정규 경로이며,
   * 이메일을 그 사람 주소로 바꿔치기하는 방법(계정이 둘로 갈린다)을 대체한다.
   */
  transferRootAdmin(organizationId: number, targetUserId: number): Promise<UserEntity>;
  /**
   * 조직 ROOT 교체(신규 계정): 조직원이 아닌 사람을 루트로 세울 때. 계정을 새로 만들어 ROOT 로 두고
   * 기존 ROOT 는 일반관리자로 내린다. 이메일은 로그인 ID 라 전역 중복 검사를 거친다.
   */
  replaceRootAdmin(
    organizationId: number,
    input: { email: string; name: string; password: string },
  ): Promise<UserEntity>;
  /** 조직 ROOT 관리자 비밀번호 재설정: 잠금 해제 + 기존 세션 무효화 동반 */
  resetRootPassword(organizationId: number, newPassword: string): Promise<void>;
  /** 조직에 부여된 AI도구 key 목록 */
  getOrganizationAiTools(organizationId: number): Promise<string[]>;
  /** 조직에 부여된 AI도구(표시명+slug 포함): 그룹웨어 노출/라우팅용 */
  getOrganizationAiToolsResolved(organizationId: number): Promise<AiToolResolved[]>;
}

export const ORGANIZATION_PORT = Symbol('ORGANIZATION_PORT');

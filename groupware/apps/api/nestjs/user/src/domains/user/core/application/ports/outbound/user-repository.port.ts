import { OrganizationEntity, UserEntity } from '../../../domain/entities/user.entity';
import { OrgStatus, OrgType, UserRole, UserStatus, UserType } from '../../../domain/types/user.types';
import { OrgPosition, ProvisioningMode } from '../../../domain/types/entitlement-catalog';
import {
  AiToolCatalogItem,
  AiToolResolved,
  PlatformAssistantSettings,
  UpdatePlatformAssistantSettingsInput,
} from '../../../domain/types';

/** 유저 생성 입력 */
export interface CreateUserRecord {
  email: string;
  passwordHash: string;
  // 이름: 유일한 이름 필드(표시 이름). 조직 내 중복 허용
  name: string;
  // 소속 조직: 멀티테넌시(필수)
  organizationId: number;
  // 소속 부서 id: null/미지정이면 미배치. 서비스가 같은 조직 부서인지 검증한 뒤 전달
  departmentId?: number | null;
  // 연락처(선택): 전화번호. 미지정/null = 공란
  phone?: string | null;
  // 연락처(선택): 사내번호. 미지정/null = 공란
  extension?: string | null;
  role: UserRole;
  status?: UserStatus;
  userType?: UserType;
}

/** 조직 생성 입력 */
export interface CreateOrganizationRecord {
  slug: string;
  name: string;
  type: OrgType;
  profileImageUrl?: string | null;
}

/** 유저 레포지토리 아웃바운드 포트 */
export interface UserRepositoryPort {
  findOneRecordByEmail(email: string): Promise<UserEntity | null>;
  findOneRecordById(id: number): Promise<UserEntity | null>;
  /** 조직의 ROOT 유저 조회: 멀티테넌시(조직당 ROOT 1명). 없으면 null. */
  findRootByOrganizationId(organizationId: number): Promise<UserEntity | null>;
  /** 조직의 활성 멤버(ROOT+ADMIN) 목록: WITHDRAWN 제외, role(ROOT 우선), 생성순. 슈퍼관리자 사용자관리용 */
  findManyRecordsByOrganizationId(organizationId: number): Promise<UserEntity[]>;
  /** 조직의 탈퇴(WITHDRAWN) 멤버 목록: 단계적 삭제 2단계(완전삭제) 화면용. 최근 삭제순 */
  findManyWithdrawnRecordsByOrganizationId(organizationId: number): Promise<UserEntity[]>;
  createRecord(record: CreateUserRecord): Promise<UserEntity>;
  /** 멤버 상태 변경: soft-delete(WITHDRAWN)/정지(SUSPENDED 미사용) 등 */
  updateMemberStatusRecord(id: number, status: UserStatus): Promise<void>;
  /** 멤버 행 영구 삭제(hard): 단계적 삭제 2단계. 토글(features/ai_tools)은 FK cascade 로 정리 */
  purgeMemberRecord(id: number): Promise<void>;
  /**
   * 멤버 소속 부서 변경: null = 미배치. 서비스가 같은 조직 부서인지 검증 후 호출
   * 부서가 바뀌면 팀장(TEAM_LEADER) 직책은 함께 해제된다(팀장=그 부서 리더 불변식 유지)
   */
  updateMemberDepartmentRecord(id: number, departmentId: number | null): Promise<void>;
  /** 멤버 직책 변경: null = 없음. 서비스가 인가/부서/부서당1명 검증 후 호출 */
  updateMemberPositionRecord(id: number, position: OrgPosition | null): Promise<void>;
  /** 부서의 팀장(position=TEAM_LEADER) 단건 조회: 부서당 1명 검증용. 없으면 null. */
  findTeamLeaderRecordByDepartment(
    organizationId: number,
    departmentId: number,
  ): Promise<UserEntity | null>;
  /** 주어진 부서들에 배치된 멤버를 미배치(null)로: 부서 삭제 cascade. */
  clearDepartmentForMembers(departmentIds: number[]): Promise<void>;
  updatePasswordHashRecord(id: number, passwordHash: string): Promise<void>;
  /**
   * 로그인 보안 상태 갱신: 연속 실패 횟수와 임시 잠금(locked_until)을 설정한다.
   * 실패 누적: (attempts, null), 임계치 도달 잠금: (0, lockedUntil), 로그인 성공 해제: (0, null)
   */
  updateLoginSecurityRecord(
    id: number,
    failedLoginAttempts: number,
    lockedUntil: Date | null,
  ): Promise<void>;
  /** 토큰 버전 +1: 서버단 로그아웃(해당 유저의 기존 refresh 토큰 일괄 무효화) */
  incrementTokenVersionRecord(id: number): Promise<void>;
  /**
   * 조직 ROOT 이양: from 을 ADMIN 으로 강등하고 to 를 ROOT 로 승격한다(한 트랜잭션)
   * 양쪽 token_version 을 올려 기존 세션을 무효화한다(권한이 바뀐 두 사람 모두 재로그인)
   * clearFromPosition=true 면 강등 대상의 직책도 비운다(대표는 루트와 동등 권한이라 함께 회수)
   */
  transferRootRecord(
    fromUserId: number,
    toUserId: number,
    options: { clearFromPosition: boolean },
  ): Promise<void>;
  /**
   * 조직 ROOT 교체(신규 계정): 새 계정을 ROOT 로 만들고 from 을 ADMIN 으로 강등한다(한 트랜잭션)
   * 새 계정은 아직 세션이 없으므로 옛 ROOT 의 token_version 만 올린다.
   */
  replaceRootWithNewRecord(
    fromUserId: number,
    record: CreateUserRecord,
    options: { clearFromPosition: boolean },
  ): Promise<UserEntity>;
  /**
   * 로그인 이메일 변경: 서비스가 인가/중복 검사 후 호출한다.
   *
   * updateProfileRecord 와 섞지 않는 이유: 이메일은 표시 정보가 아니라 인증 식별자다.
   * 프로필 패치에 끼워 넣으면 이름만 바꾸는 호출이 실수로 로그인 ID 를 건드릴 수 있다.
   * DB UNIQUE(organization_id, email) 이 최종 방어선(경합 시 여기서 터진다)
   */
  updateEmailRecord(id: number, email: string): Promise<void>;
  /** 프로필/연락처 수정: 제공된 필드만(name/profileImageUrl/phone/extension) */
  updateProfileRecord(
    id: number,
    patch: {
      name?: string;
      profileImageUrl?: string | null;
      phone?: string | null;
      extension?: string | null;
    },
  ): Promise<void>;
  // 조직(멀티테넌시): 시더/프로비저닝용
  findOrganizationById(id: number): Promise<OrganizationEntity | null>;
  findOrganizationBySlug(slug: string): Promise<OrganizationEntity | null>;
  findManyOrganizationRecords(): Promise<OrganizationEntity[]>;
  createOrganizationRecord(record: CreateOrganizationRecord): Promise<OrganizationEntity>;
  /** 조직 수정: 제공된 필드만 갱신(name/slug/status) */
  updateOrganizationRecord(
    id: number,
    patch: { name?: string; slug?: string; status?: OrgStatus; profileImageUrl?: string | null },
  ): Promise<OrganizationEntity>;
  // 조직 삭제(멀티테넌시)
  /** 조직 상태 변경: soft 삭제(WITHDRAWN), 정지(SUSPENDED) 등 */
  updateOrganizationStatusRecord(id: number, status: OrgStatus): Promise<void>;
  /** 조직 전체 유저의 token_version 일괄 +1: 세션 즉시 무효화 */
  bumpTokenVersionByOrganizationId(organizationId: number): Promise<void>;
  /** 하드 삭제: 조직 유저 전원 + 조직 행 제거(트랜잭션) */
  purgeOrganizationRecord(organizationId: number): Promise<void>;
  // 조직 AI도구 grant (플랫폼→조직 사용 인가/availability): 엔타이틀먼트
  /** 조직에 부여된 AI도구 key 목록(활성 카탈로그만) */
  findOrganizationAiToolKeys(organizationId: number): Promise<string[]>;
  /** 조직 AI도구 grant 를 원하는 key 집합으로 일괄 동기화(없으면 추가/빠지면 제거, 트랜잭션) */
  setOrganizationAiToolsRecord(organizationId: number, toolKeys: string[]): Promise<void>;
  /** 조직에 부여된 AI도구(표시명+slug 포함): 그룹웨어 노출/라우팅용 */
  findOrganizationAiToolsResolvedRecords(organizationId: number): Promise<AiToolResolved[]>;
  // AI 도구 카탈로그 (플랫폼 관리: 표시명/slug 편집, key 고정)
  /** 카탈로그 전체(sortOrder 순) */
  listAiToolCatalogRecords(): Promise<AiToolCatalogItem[]>;
  /** key 로 단일 조회. 없으면 null. */
  findAiToolRecordByKey(key: string): Promise<AiToolCatalogItem | null>;
  /** slug 로 단일 조회(중복 검사용). 없으면 null. */
  findAiToolRecordBySlug(slug: string): Promise<AiToolCatalogItem | null>;
  /** 표시명/slug/프로비저닝 수정(제공된 필드만) */
  updateAiToolRecordByKey(
    key: string,
    patch: { name?: string; slug?: string; provisioning?: ProvisioningMode },
  ): Promise<AiToolCatalogItem>;

  // 플랫폼 AI 어시스턴트 전역 설정 (싱글톤)
  /** 싱글톤 설정 조회(없으면 기본값으로 보장) */
  findPlatformAssistantSettingsRecord(): Promise<PlatformAssistantSettings>;
  /** 싱글톤 설정 수정(제공된 필드만) */
  updatePlatformAssistantSettingsRecord(
    patch: UpdatePlatformAssistantSettingsInput,
  ): Promise<PlatformAssistantSettings>;
}

export const USER_REPOSITORY_PORT = Symbol('USER_REPOSITORY_PORT');

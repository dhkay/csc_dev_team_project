import { UserEntity } from '../../../domain/entities/user.entity';
import { OrgCallerActor } from './org-caller';

/** 조직유저 관리 호출 주체: 공유 조직 호출자(토큰 도출). 인가(ROOT/시스템관리)는 서비스가 판정 */
export type OrgMemberActor = OrgCallerActor;

/** 일반관리자(ADMIN) 생성 입력 */
export interface CreateOrgMemberInput {
  email: string;
  password: string;
  // 이름: organization_users.name 에 저장(표시 이름. 조직 내 중복 허용)
  name: string;
  // 소속 부서 id: null/미지정이면 미배치. 같은 조직 부서인지 서비스가 검증
  departmentId?: number | null;
  // 연락처(선택): 전화번호. 미지정/null = 공란
  phone?: string | null;
  // 연락처(선택): 사내번호. 미지정/null = 공란
  extension?: string | null;
}

/** 일반관리자 수정 입력: 제공된 필드만(표시이름 / 소속 부서 / 연락처) */
export interface UpdateOrgMemberInput {
  name?: string;
  // 로그인 이메일: undefined=변경 안 함
  //
  // 표시 정보가 아니라 로그인 ID 다: 바꾸는 즉시 이전 주소로는 로그인할 수 없고, 소셜 로그인은
  // 이 값으로 계정을 찾으므로(Google id_token 의 email) 연결 대상도 함께 바뀐다.
  // 그래서 조직 내 중복 검사를 통과해야 하고, 인가는 조직 관리 권한자에게만 있다.
  email?: string;
  // 소속 부서: number=배치, null=미배치, undefined=변경 안 함
  departmentId?: number | null;
  // 전화번호: string=설정(빈문자 가능), null=비움, undefined=변경 안 함
  phone?: string | null;
  // 사내번호: string=설정(빈문자 가능), null=비움, undefined=변경 안 함
  extension?: string | null;
}

/**
 * 조직유저 관리 Inbound Port: 슈퍼관리자(ROOT)가 같은 조직의 일반관리자(ADMIN)를 추가/편집/삭제
 * 테넌트 격리(조직 범위), ROOT 강제, 이메일/이름 조직범위 중복검증은 서비스가 보안 경계로 강제한다.
 */
export interface OrgMemberManagementPort {
  /** 조직 멤버(ROOT+ADMIN) 목록: 슈퍼관리자 사용자관리 화면용 */
  listMembers(actor: OrgMemberActor): Promise<UserEntity[]>;
  /** 삭제(soft-delete=WITHDRAWN)된 일반관리자 목록: 단계적 삭제 2단계(완전삭제) 화면용 */
  listWithdrawnMembers(actor: OrgMemberActor): Promise<UserEntity[]>;
  /** 일반관리자(ADMIN) 추가 */
  createAdmin(actor: OrgMemberActor, input: CreateOrgMemberInput): Promise<UserEntity>;
  /** 일반관리자 표시이름 수정 */
  updateMember(actor: OrgMemberActor, id: number, patch: UpdateOrgMemberInput): Promise<UserEntity>;
  /** 일반관리자 비밀번호 재설정: 잠금해제 + 세션 무효화 동반 */
  resetMemberPassword(actor: OrgMemberActor, id: number, password: string): Promise<void>;
  /** 일반관리자 삭제(soft: WITHDRAWN + 세션 무효화). 단계적 삭제 1단계 */
  deleteMember(actor: OrgMemberActor, id: number): Promise<void>;
  /** 일반관리자 영구 삭제(hard): 이미 삭제(WITHDRAWN)된 대상만. 단계적 삭제 2단계(이메일 슬롯 회수) */
  purgeMember(actor: OrgMemberActor, id: number): Promise<void>;
}

export const ORG_MEMBER_MANAGEMENT_PORT = Symbol('ORG_MEMBER_MANAGEMENT_PORT');

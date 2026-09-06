import { PrincipalType, UserRole } from '../../../domain/types/user.types';

/** self-service 호출 주체: 토큰에서 추출(컨트롤러가 채움) */
export interface AccountActor {
  id: number;
  role: UserRole;
  principalType: PrincipalType;
}

/** 본인 프로필 수정 입력: 제공된 필드만. 역할에 따라 일부는 무시된다(서비스가 강제) */
export interface UpdateOwnProfileInput {
  // 이름(다른 사용자에게 보이는 유일한 이름: 로그/멤버목록/플랫폼 표기가 같이 따라간다)
  name?: string;
  profileImageUrl?: string | null;
}

/**
 * 조직유저 본인 계정 self-service Inbound Port.
 * 역할 게이팅: 이름+프로필이미지는 전 역할 공통, 비밀번호 변경은 ADMIN 만(ROOT 는 플랫폼 관리)
 * 대상은 ORGANIZATION_USER 만(관리자유저는 control-tower 로 관리)
 */
export interface AccountPort {
  updateOwnProfile(actor: AccountActor, patch: UpdateOwnProfileInput): Promise<void>;
  changeOwnPassword(actor: AccountActor, currentPassword: string, newPassword: string): Promise<void>;
}

export const ACCOUNT_PORT = Symbol('ACCOUNT_PORT');

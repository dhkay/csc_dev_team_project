// 본인 계정(account) BFF 엔드포인트 타입 계약: 프로필 수정 / 비밀번호 변경
import { defineRoute } from '$lib/infrastructure/http/bffClient';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';

/** 본인 프로필 수정 입력: 제공된 필드만(역할 게이팅은 백엔드가 강제) */
export interface UpdateProfileInput {
  // 이름(다른 사용자에게 보이는 유일한 이름: 로그/멤버목록/플랫폼 표기가 같이 따라간다)
  name?: string;
  profileImageUrl?: string | null;
}

export const accountContract = {
  updateProfile: defineRoute<UpdateProfileInput, void>('PATCH', ROUTES.USER.ME),
  changePassword: defineRoute<{ currentPassword: string; newPassword: string }, void>(
    'POST',
    ROUTES.USER.PASSWORD
  )
};

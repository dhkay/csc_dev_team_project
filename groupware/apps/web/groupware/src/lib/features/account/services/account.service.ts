// 본인 계정 self-service 비즈니스 로직: mutations 를 조합한다.
// 컴포넌트는 apis 를 직접 호출하지 않고 이 service 를 통해 호출한다.
import { updateProfile, uploadProfileImage } from '../mutations/updateProfile.mutation';
import { changePassword } from '../mutations/changePassword.mutation';

export const accountService = {
  /** 프로필 이미지 업로드(검증→presign→PUT→confirm): 접근 URL 반환, 실패 시 throw. */
  uploadProfileImage,
  /** 이름/프로필이미지 수정(역할 게이팅은 백엔드) */
  updateProfile,
  /** 비밀번호 변경(ADMIN 전용) */
  changePassword,
};

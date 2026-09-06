// 본인 계정 수정 데이터 접근(브라우저): 타입 계약(accountContract) 기반 bff() 로 BFF 호출
// BFF 는 실패 시 실제 상태코드(406/403…)를 반환하므로 봉투 { success, errorCode?, error? } 로 정규화
import { bff } from '$lib/infrastructure/http/bffClient';
import { accountContract, type UpdateProfileInput } from '../accountContract';

export type { UpdateProfileInput };

/** 컴포넌트 소비용 결과 봉투 */
export type AccountResult =
  | { success: true }
  | { success: false; errorCode?: string; error?: string };

export function updateProfile(patch: UpdateProfileInput): Promise<AccountResult> {
  return bff(accountContract.updateProfile, patch);
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AccountResult> {
  return bff(accountContract.changePassword, { currentPassword, newPassword });
}

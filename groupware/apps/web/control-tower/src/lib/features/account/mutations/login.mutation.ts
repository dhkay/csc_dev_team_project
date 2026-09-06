// 변경 로직(로그인 액션). apis 를 호출한다.
import type { LoginRequest, LoginResult } from '$lib/shared/types/common.types';
import { login } from '../apis/loginApi';

export function loginMutation(payload: LoginRequest): Promise<LoginResult> {
  return login(payload);
}

// 변경 로직(로그아웃 액션). apis 를 호출한다.
import { logout } from '../apis/logoutApi';

export function logoutMutation(): Promise<void> {
  return logout();
}

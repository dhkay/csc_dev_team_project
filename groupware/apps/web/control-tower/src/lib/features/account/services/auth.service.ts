// 계정/인증 비즈니스 로직: mutations/queries 를 조합한다.
// 클라이언트(컴포넌트)는 apis 를 직접 호출하지 않고 이 service 를 통해 호출한다.
import { loginMutation } from '../mutations/login.mutation';
import { logoutMutation } from '../mutations/logout.mutation';

export const authService = {
  login: loginMutation,
  logout: logoutMutation,
};

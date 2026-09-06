// 변경 로직(쓰기): 본인 비밀번호 변경(ADMIN 전용, 백엔드 강제)
import * as accountApi from '../apis/accountApi';

export const changePassword = (currentPassword: string, newPassword: string) =>
  accountApi.changePassword(currentPassword, newPassword);

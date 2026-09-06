// 조회 로직(읽기). apis 를 얇게 래핑(추후 TanStack Query 도입 자리)
import * as adminApi from '../apis/adminsApi';

export const checkAdminEmail = (email: string, excludeId?: number) =>
  adminApi.checkAdminEmail(email, excludeId);

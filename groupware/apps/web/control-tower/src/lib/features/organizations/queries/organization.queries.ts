// 조회 로직(읽기). apis 를 얇게 래핑(추후 TanStack Query 도입 자리)
import * as orgApi from '../apis/organizationsApi';

export const getRootAdmin = (id: number) => orgApi.getRootAdmin(id);
export const getAiTools = (id: number) => orgApi.getAiTools(id);
export const checkRootAdminEmail = (id: number, email: string) =>
  orgApi.checkRootAdminEmail(id, email);
export const listOrgMembers = (id: number) => orgApi.listOrgMembers(id);

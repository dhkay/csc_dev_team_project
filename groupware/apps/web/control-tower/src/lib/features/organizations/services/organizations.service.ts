// 조직 관리 비즈니스 로직: mutations/queries 를 조합한다.
// 클라이언트(컴포넌트)는 apis 를 직접 호출하지 않고 이 service 를 통해 호출한다.
import * as mutations from '../mutations/organization.mutations';
import * as queries from '../queries/organization.queries';

export const organizationsService = {
  create: mutations.createOrganization,
  update: mutations.updateOrganization,
  remove: mutations.deleteOrganization,
  recover: mutations.recoverOrganization,
  resetRootPassword: mutations.resetRootPassword,
  updateRootAdmin: mutations.updateRootAdmin,
  transferRootAdmin: mutations.transferRootAdmin,
  replaceRootAdmin: mutations.replaceRootAdmin,
  uploadLogo: mutations.uploadLogo,
  getRootAdmin: queries.getRootAdmin,
  getAiTools: queries.getAiTools,
  checkRootAdminEmail: queries.checkRootAdminEmail,
  listOrgMembers: queries.listOrgMembers,
};

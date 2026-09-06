// 플랫폼 관리자 관리 비즈니스 로직: queries/mutations 를 조합한다.
// 컴포넌트는 apis 를 직접 호출하지 않고 이 service 를 통해 호출한다(로그인 패턴)
import * as mutations from '../mutations/admin.mutations';
import * as queries from '../queries/admin.queries';

export const adminsService = {
  create: mutations.createAdmin,
  remove: mutations.deleteAdmin,
  setFeatures: mutations.setAdminFeatures,
  update: mutations.updateAdmin,
  checkEmail: queries.checkAdminEmail,
};

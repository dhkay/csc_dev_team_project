// 조직 사용자관리 비즈니스 로직: mutations 를 조합한다.
// 컴포넌트는 apis 를 직접 호출하지 않고 이 service 를 통해 호출한다.
import * as mutations from '../mutations/member.mutations';

export const membersService = {
  create: mutations.createMember,
  update: mutations.updateMember,
  remove: mutations.deleteMember,
  purge: mutations.purgeMember,
};

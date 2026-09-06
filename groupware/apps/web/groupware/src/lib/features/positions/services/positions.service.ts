// 직책 부여 비즈니스 로직: apis 를 조합한다. 컴포넌트/스토어는 이 service 를 통해 호출한다.
import * as api from '../apis/positionsApi';

export const positionsService = {
  setMember: api.setMemberPosition,
};

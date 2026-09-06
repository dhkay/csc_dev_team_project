// 권한 부여 비즈니스 로직: apis 를 조합한다. 컴포넌트는 이 service 를 통해 호출한다.
import * as api from '../apis/permissionsApi';

export const permissionsService = {
  setDepartment: api.setDepartmentPermissions,
  setMember: api.setMemberPermissions,
};

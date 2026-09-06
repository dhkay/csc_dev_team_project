// 부서(조직도) 관리 비즈니스 로직: apis 를 조합. 컴포넌트/스토어는 이 service 를 통해 호출한다.
import * as api from '../apis/departmentsApi';

export const departmentsService = {
  create: api.createDepartment,
  update: api.updateDepartment,
  remove: api.deleteDepartment,
};

// AI도구 배포 비즈니스 로직: apis 를 조합한다. 컴포넌트는 이 service 를 통해 호출한다.
import * as api from '../apis/aiToolDistributionApi';

export const aiToolDistributionService = {
  setDepartment: api.setDepartmentAiTools,
  setMember: api.setMemberAiTools,
};

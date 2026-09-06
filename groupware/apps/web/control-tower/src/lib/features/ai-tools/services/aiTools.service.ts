// AI 도구 카탈로그 비즈니스 로직: mutations 를 조합한다.
// 클라이언트(컴포넌트)는 apis 를 직접 호출하지 않고 이 service 를 통해 호출한다.
// (목록 조회는 SSR server load 에서 직접: 브라우저 read 레인 불필요.)
import * as mutations from '../mutations/aiTool.mutations';

export const aiToolsService = {
  update: mutations.updateAiTool,
};

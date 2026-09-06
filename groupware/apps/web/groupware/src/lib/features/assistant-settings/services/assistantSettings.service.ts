// 조직 AI 어시스턴트 설정 서비스: 컴포넌트 단일 진입점. 조회는 SSR 로드, 여기선 수정만
import { updateAssistantSettings } from '../apis/assistantSettingsApi';

export const assistantSettingsService = {
  update: updateAssistantSettings,
};

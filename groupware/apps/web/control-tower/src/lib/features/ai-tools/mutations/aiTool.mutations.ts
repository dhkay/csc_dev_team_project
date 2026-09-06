// 변경 로직(쓰기). apis 를 호출/조합한다.
import * as api from '../apis/aiToolsApi';
import type { UpdateAiToolInput } from '../types';

export const updateAiTool = (key: string, patch: UpdateAiToolInput) => api.updateAiTool(key, patch);

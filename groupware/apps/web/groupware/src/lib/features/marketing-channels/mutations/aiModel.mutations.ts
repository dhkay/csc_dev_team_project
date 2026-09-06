// 개인 AI 모델 선택 변경 레이어: 교체 저장(PUT). 성공 시 내 AI 모델 invalidate.
import type { QueryClient } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { AiModelSelection } from '../types';
import * as api from '../apis/aiModelApi';
import { aiModelKeys } from '../queries/aiModel.query';

export function setMyAiModelMutationOptions(queryClient: QueryClient, version: VersionMode) {
  return {
    // 이 화면은 자체 에러 배너를 띄운다. 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (selection: AiModelSelection): Promise<AiModelSelection> => {
      const res = await api.setMyAiModel(version, selection);
      if (!res.success) throw new Error(res.error ?? 'AI 모델을 저장하지 못했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiModelKeys.mine(version) });
    },
  };
}

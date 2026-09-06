// 기획서 생성 프롬프트 편집 지침 저장(PUT). 성공 시 그 채널 프롬프트 invalidate.
import type { QueryClient } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { PlanPromptView } from '../types';
import * as api from '../apis/planApi';
import { planPromptKeys } from '../queries/planPrompt.query';

interface SetPlanPromptVars {
  channelId: number;
  instructions: string;
}

export function setPlanPromptMutationOptions(queryClient: QueryClient, version: VersionMode) {
  return {
    // 모달이 자체 에러 문구를 띄운다(PlanPromptModal): 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (vars: SetPlanPromptVars): Promise<PlanPromptView> => {
      const res = await api.setPlanPrompt(version, vars.channelId, vars.instructions);
      if (!res.success) throw new Error(res.error ?? '기획서 프롬프트를 저장하지 못했습니다.');
      return res.data;
    },
    onSuccess: (_data: PlanPromptView, vars: SetPlanPromptVars) => {
      void queryClient.invalidateQueries({
        queryKey: planPromptKeys.view(version, vars.channelId),
      });
    },
  };
}

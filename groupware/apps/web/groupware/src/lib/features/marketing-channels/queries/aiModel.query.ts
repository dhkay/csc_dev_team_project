// 개인 AI 모델 선택 조회 레이어: TanStack Query.
// 채널 키가 없다(선택이 채널에 매달려 있지 않다) → enabled 가드도 필요 없다: 로그인해 있으면 항상 조회
import { queryOptions } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { AiModelSelection } from '../types';
import * as api from '../apis/aiModelApi';

/** 쿼리 키 팩토리: 이 버전 슬롯의 내 AI 모델 선택. 버전마다 다른 모델을 고를 수 있다. */
export const aiModelKeys = {
  mine: (version: VersionMode) => ['marketing-my-ai-model', version] as const,
};

export function myAiModelQueryOptions(version: VersionMode) {
  return queryOptions({
    queryKey: aiModelKeys.mine(version),
    queryFn: async (): Promise<AiModelSelection> => {
      const res = await api.getMyAiModel(version);
      if (!res.success) {
        throw new Error(res.error ?? 'AI 모델을 불러오지 못했습니다.');
      }
      return res.data;
    },
  });
}

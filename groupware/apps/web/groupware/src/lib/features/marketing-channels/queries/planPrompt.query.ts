// 기획서 생성 프롬프트 조회 레이어: TanStack Query. 채널별 고정 머리/꼬리 + 편집 지침
import { queryOptions } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { PlanPromptView } from '../types';
import * as api from '../apis/planApi';

/**
 * 쿼리 키 팩토리: 채널 × 버전 기획서 프롬프트
 *
 * 버전이 들어가는 이유: 지침 저장이 버전별이고, 화면에 함께 뜨는 이미지 안전 제약도 그 버전에서
 * 고른 이미지 모델에 달렸다. 키가 같으면 버전을 옮겨도 이전 버전의 지침이 그대로 보인다.
 */
export const planPromptKeys = {
  view: (version: VersionMode, channelId: number | null) =>
    ['marketing-plan-prompt', version, channelId] as const,
};

export function planPromptQueryOptions(version: VersionMode, channelId: number | null) {
  return queryOptions({
    queryKey: planPromptKeys.view(version, channelId),
    enabled: channelId != null,
    queryFn: async (): Promise<PlanPromptView> => {
      const res = await api.getPlanPrompt(version, channelId as number);
      if (!res.success) {
        throw new Error(res.error ?? '기획서 프롬프트를 불러오지 못했습니다.');
      }
      return res.data;
    },
  });
}

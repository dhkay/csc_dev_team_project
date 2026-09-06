// 공용 API 자격증명 조회 레이어: TanStack Query. org 는 BFF 가 세션에서 주입하므로 정적 키
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/apiCredentialApi';
import type { ApiCredentialView } from '../types';

export const apiCredentialsKeys = {
  list: () => ['api-credentials'] as const,
  // list() 의 하위 key: 저장/삭제가 list() 를 무효화하면 이 조회도 함께 갱신된다(부분 매칭)
  configured: () => ['api-credentials', 'configured'] as const
};

export function apiCredentialsQueryOptions() {
  return queryOptions({
    queryKey: apiCredentialsKeys.list(),
    queryFn: async (): Promise<ApiCredentialView[]> => {
      const res = await api.listApiCredentials();
      if (!res.success) {
        throw new Error(res.error ?? '자격증명을 불러오지 못했습니다.');
      }
      return res.data;
    }
  });
}

/** 등록된 프로바이더 key 목록(논-시크릿): 마케팅 AI 모델 게이팅용. org-member 조회 가능 */
export function configuredProvidersQueryOptions() {
  return queryOptions({
    queryKey: apiCredentialsKeys.configured(),
    queryFn: async (): Promise<string[]> => {
      const res = await api.listConfiguredProviders();
      if (!res.success) {
        throw new Error(res.error ?? '등록된 API 정보를 불러오지 못했습니다.');
      }
      return res.data;
    }
  });
}

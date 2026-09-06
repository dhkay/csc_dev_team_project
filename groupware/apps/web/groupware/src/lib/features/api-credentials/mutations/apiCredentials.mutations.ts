// 공용 API 자격증명 변경 레이어: TanStack mutation. 성공 시 조회 무효화
import type { QueryClient } from '@tanstack/svelte-query';
import * as api from '../apis/apiCredentialApi';
import type { ApiCredentialView } from '../types';
import { apiCredentialsKeys } from '../queries/apiCredentials.query';

export interface SaveApiCredentialInput {
  provider: string;
  credentials: Record<string, string>;
}

export function saveApiCredentialMutationOptions(queryClient: QueryClient) {
  return {
    // 이 화면은 자체 에러 배너를 띄운다. 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (input: SaveApiCredentialInput): Promise<ApiCredentialView> => {
      const res = await api.saveApiCredential(input.provider, input.credentials);
      if (!res.success) {
        throw new Error(res.error ?? '자격증명을 저장하지 못했습니다.');
      }
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiCredentialsKeys.list() });
    }
  };
}

export function deleteApiCredentialMutationOptions(queryClient: QueryClient) {
  return {
    // 이 화면은 자체 에러 배너를 띄운다. 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (provider: string): Promise<void> => {
      const res = await api.deleteApiCredential(provider);
      if (!res.success) {
        throw new Error(res.error ?? '자격증명을 삭제하지 못했습니다.');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiCredentialsKeys.list() });
    }
  };
}

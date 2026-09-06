// 스토리지 변경 뮤테이션 옵션
//
// 실패 토스트는 MutationCache 가 전역으로 띄우므로(mutationErrorToast) 여기서는 meta.errorTitle 만 채운다.
import type { QueryClient } from '@tanstack/svelte-query';
import * as api from '../apis/storageApi';
import { storageKeys } from '../queries/storage.query';
import type { StorageListing, StorageScope } from '../types';

/** 목록 캐시 전체를 다시 읽는다(정렬/검색/휴지통 조합이 여럿이라 접두사로 한 번에) */
function invalidateStorage(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: storageKeys.all });
}

interface RenameInput {
  id: string;
  fileName: string;
}

export function renameFileMutationOptions(
  queryClient: QueryClient,
  scope: StorageScope,
  listingKey: readonly unknown[]
) {
  return {
    meta: { errorTitle: '이름을 바꾸지 못했습니다.' },
    mutationFn: async (input: RenameInput): Promise<void> => {
      const res = await api.renameFile(scope, input.id, input.fileName);
      if (!res.success) throw new Error(res.error ?? '이름을 바꾸지 못했습니다.');
    },
    // 낙관적 반영: 이름은 사용자가 방금 입력한 값이라 서버 응답을 기다릴 이유가 없다.
    onMutate: async (input: RenameInput): Promise<{ prev?: StorageListing }> => {
      await queryClient.cancelQueries({ queryKey: listingKey });
      const prev = queryClient.getQueryData<StorageListing>(listingKey);
      if (prev) {
        queryClient.setQueryData<StorageListing>(listingKey, {
          ...prev,
          files: prev.files.map((f) =>
            f.id === input.id ? { ...f, fileName: input.fileName } : f
          )
        });
      }
      return { prev };
    },
    onError: (_e: unknown, _input: RenameInput, ctx?: { prev?: StorageListing }) => {
      if (ctx?.prev) queryClient.setQueryData(listingKey, ctx.prev);
    },
    onSettled: () => invalidateStorage(queryClient)
  };
}

function itemActionOptions(
  queryClient: QueryClient,
  scope: StorageScope,
  listingKey: readonly unknown[],
  action: 'trash' | 'restore' | 'purge',
  errorTitle: string
) {
  return {
    meta: { errorTitle },
    mutationFn: async (ids: string[]): Promise<number> => {
      const res = await api.runItemAction(action, scope, ids);
      if (!res.success) throw new Error(res.error ?? errorTitle);
      return res.data.affected;
    },
    // 선택한 항목은 어느 동작이든 이 목록에서 사라진다(휴지통으로 갔거나, 복원돼 나갔거나,
    //   영구 삭제됐거나). 그래서 세 동작이 같은 낙관적 처리를 공유한다.
    onMutate: async (ids: string[]): Promise<{ prev?: StorageListing }> => {
      await queryClient.cancelQueries({ queryKey: listingKey });
      const prev = queryClient.getQueryData<StorageListing>(listingKey);
      if (prev) {
        const removed = new Set(ids);
        queryClient.setQueryData<StorageListing>(listingKey, {
          ...prev,
          files: prev.files.filter((f) => !removed.has(f.id)),
          total: Math.max(0, prev.total - ids.length)
        });
      }
      return { prev };
    },
    onError: (_e: unknown, _ids: string[], ctx?: { prev?: StorageListing }) => {
      if (ctx?.prev) queryClient.setQueryData(listingKey, ctx.prev);
    },
    onSettled: () => invalidateStorage(queryClient)
  };
}

export function trashItemsMutationOptions(
  queryClient: QueryClient,
  scope: StorageScope,
  listingKey: readonly unknown[]
) {
  return itemActionOptions(
    queryClient,
    scope,
    listingKey,
    'trash',
    '휴지통으로 옮기지 못했습니다.'
  );
}

export function restoreItemsMutationOptions(
  queryClient: QueryClient,
  scope: StorageScope,
  listingKey: readonly unknown[]
) {
  return itemActionOptions(queryClient, scope, listingKey, 'restore', '복원하지 못했습니다.');
}

export function purgeItemsMutationOptions(
  queryClient: QueryClient,
  scope: StorageScope,
  listingKey: readonly unknown[]
) {
  return itemActionOptions(
    queryClient,
    scope,
    listingKey,
    'purge',
    '영구 삭제하지 못했습니다.'
  );
}

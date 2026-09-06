<script lang="ts">
  import { onMount } from 'svelte';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import SyncStatusBar from '$lib/widgets/SyncStatusBar/SyncStatusBar.svelte';
  import { onSyncStatus } from '$lib/infrastructure/sync';
  import { syncStore } from '$lib/shared/lib/stores/syncStore/syncStore.svelte';
  import '../app.css';

  let { children } = $props();

  /**
   * 이 앱의 TanStack Query 는 네트워크를 한 번도 만지지 않는다.
   * 역할이 갈린다. Query 는 메모리 뷰 캐시와 재렌더 오케스트레이터, SQLite 는 영속 캐시다.
   *
   * 그래서 기존 web 앱(staleTime 30초, retry 1)과 기본값이 다르다.
   *   - staleTime 0 : 로컬 읽기는 싸고, 정확도가 항상 이긴다. 30초는 네트워크 억제가
   *                   목적이었으므로 여기서는 근거가 없다.
   *   - retry false : 로컬 읽기 실패는 일시적 장애가 아니라 버그다. 재시도로 감추면 안 된다.
   *
   * 쿼리 캐시 영속화 플러그인은 쓰지 않는다. SQLite 가 이미 영속 계층이고, 둘을 함께 두면
   * 진실의 출처가 두 개가 되어 어긋났을 때 디버깅이 불가능해진다.
   */
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  onMount(() => {
    let unsubscribe: (() => void) | undefined;
    void onSyncStatus((status) => syncStore.apply(status)).then((fn) => {
      unsubscribe = fn;
    });
    return () => unsubscribe?.();
  });
</script>

<QueryClientProvider client={queryClient}>
  <div class="flex h-full flex-col">
    <main class="min-h-0 flex-1 overflow-auto">
      {@render children()}
    </main>
    <SyncStatusBar />
  </div>
</QueryClientProvider>

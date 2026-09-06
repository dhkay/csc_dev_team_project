<script lang="ts">
  // 컨트롤타워(플랫폼 운영사) 웹 루트 레이아웃 셸
  import '../app.css'; // Tailwind 진입: 전역 1회 로드
  import { browser } from '$app/environment';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';

  let { children } = $props();

  // 앱 전역 단일 QueryClient(서버 데이터 캐시/동기화 표준)
  //  - enabled: browser → SSR 중 네트워크 미발생(초기 데이터는 각 쿼리의 initialData 로 시드)
  //  - staleTime 30s 기본, 포커스 재페치 off. 개별 쿼리가 refetchInterval/staleTime 으로 오버라이드
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
</QueryClientProvider>

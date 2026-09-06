<script lang="ts">
  // 루트 레이아웃 셸
  import '../app.css'; // Tailwind 진입: 전역 1회 로드
  import { browser } from '$app/environment';
  import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { mutationErrorToast } from '$lib/infrastructure/query/mutationErrorToast';
  import ToastHost from '$lib/shared/ui/overlays/ToastHost.svelte';

  let { children } = $props();

  // 앱 전역 단일 QueryClient(서버 데이터 캐시/동기화 표준)
  //  - enabled: browser → SSR 중에는 네트워크 미발생(요청 간 캐시 공유, 하이드레이션 이슈 회피),
  //    클라이언트 하이드레이션 후 자동 페치
  //  - staleTime: 30s 동안 fresh 로 간주(불필요 재요청 억제), 포커스 재페치는 off(과요청 방지)
  //  - mutationCache.onError: 뮤테이션(사용자가 누른 행동) 실패를 기본으로 전역 알림한다.
  //    호출부마다 onError 를 붙이는 방식은 빠뜨린 곳이 조용히 남는다. 배포 재시작 중 요청이 죽으면
  //    화면에 아무 표시도 없이 성공처럼 보였다. 예외/문구/재시도는 각 뮤테이션의 meta 로 선언한다.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false
      }
    },
    mutationCache: new MutationCache({ onError: mutationErrorToast })
  });
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}

  <!-- 전역 알림: 앱 전체에 한 번만. 특정 셸에 두면 그 라우트에서만 보여서, 다른 화면에서
       toastStore 를 호출한 사람은 아무것도 못 본 채 자기 배너를 새로 만들게 된다.
       테마는 ToastHost 가 스스로 스코프한다(루트에는 ThemeScope 가 없다) -->
  <ToastHost />
</QueryClientProvider>

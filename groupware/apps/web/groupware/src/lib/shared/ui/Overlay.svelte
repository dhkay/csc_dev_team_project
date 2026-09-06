<script lang="ts">
  import type { Snippet } from 'svelte';
  import { blockScroll, unblockScroll } from '$lib/shared/lib/utils/scrollBlocker';

  // ※ 작업을 막지 않는 통보(성공/실패 알림)를 찾는다면 이 컴포넌트가 아니라
  //   `overlays/ToastHost` + `stores/toastStore` 다(전역 우하단, 루트에 이미 마운트됨). 여기에
  //   배너를 새로 만들지 말 것. 위치/수명/접근성이 화면마다 갈린다.
  //
  // 전역 오버레이: 뷰포트 전체를 덮는 배경 딤 + 배경 스크롤 잠금. 형태 비종속(어디에도 종속 X):
  //   중앙 모달(CenterModal), 바텀시트, 드로어, 확인창 등 무엇이든 이 위에 얹어 재사용한다.
  // 위에 표시할 내용(패널 등)은 children 으로 주입하고, 정렬/패딩은 소비자가 class 로 지정한다.
  //   예: 중앙='items-center justify-center p-4', 바텀='items-end', 사이드='justify-end'
  // 렌더 위치: 테마(ThemeScope) 서브트리 안에서 렌더한다(body portal 금지: 다크테마 스코프)
  //   fixed inset-0 이라 DOM 위치와 무관하게 뷰포트 전체를 덮는다.
  // 스크롤 잠금은 공용 scrollBlocker(ref-count, Esc 허용, data-scroll-allowed 내부 스크롤 허용)를 재사용
  interface Props {
    // 표시 여부
    open?: boolean;
    // 배경 컨테이너 정렬/패딩 등 추가 클래스
    class?: string;
    // 위에 얹을 내용(패널 등)
    children: Snippet;
  }
  let { open = false, class: className = '', children }: Props = $props();

  // 열려 있는 동안 배경 스크롤 잠금(닫히면 자동 해제)
  $effect(() => {
    if (!open) return;
    blockScroll();
    return () => unblockScroll();
  });
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex bg-black/50 {className}">
    {@render children()}
  </div>
{/if}

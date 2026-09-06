<script lang="ts">
  // 전역 토스트 호스트. 화면 우하단에 알림을 쌓는다. 루트 레이아웃에 한 번만 마운트한다.
  //
  // Overlay.svelte 와 다른 물건이다. 배경을 딤 처리하지 않고 스크롤도 잠그지 않는다(작업을 막지
  // 않는 통보). fixed 로 뷰포트에 붙고 z-index 는 Overlay(z-50) 위다.
  //
  // 스스로 ThemeScope 로 감싼다. 특정 셸 안에 두면 그 라우트에서만 알림이 보이고, 다른 화면에서
  // 스토어를 호출한 사람은 아무것도 못 본 채 자기 배너를 새로 만들게 된다.
  //
  // 화면 방향의 기준은 앱 SSOT(viewportModeStore) 다. Tailwind 의 sm: 로 가르면 640~1024px 에서
  // CenterModal 은 세로 전체화면인데 토스트만 가로 카드로 갈린다.
  //
  // 접근성: 실패는 role=alert(assertive), 나머지는 role=status(polite). hover/focus 중에는
  // 자동 소멸을 멈춘다.
  //
  // 셸 하단 크롬 회피는 bottomInsetStore 의 합만 읽는다. 여기서 관리자면 얼마인지를 알면 셸이 늘
  // 때마다 이 파일이 따라 바뀐다. 점유하는 쪽이 등록한다.
  import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
  import type { ToastVariant } from '$lib/shared/lib/stores/toastStore/toast.types';
  import ThemeScope from '$lib/shared/ui/ThemeScope.svelte';
  import { viewportModeStore } from '$lib/shared/lib/stores/viewport/viewportModeStore/viewportModeStore.svelte';
  import { bottomInsetStore } from '$lib/shared/lib/stores/viewport/bottomInsetStore/bottomInsetStore.svelte';

  /**
   * variant → 색/아이콘/라벨. 색은 의미 토큰만 쓴다(app.css). 팔레트 리터럴(bg-red-500)은 다크에서
   * 라이트 값을 그대로 써 가독성이 깨지고, "새 테마 = 값 블록 하나" 보장도 무너진다.
   */
  const STYLE: Record<ToastVariant, { accent: string; icon: string; label: string }> = {
    error: { accent: 'bg-danger-fg', icon: '!', label: '오류' },
    warning: { accent: 'bg-warning-fg', icon: '!', label: '주의' },
    success: { accent: 'bg-success-fg', icon: '✓', label: '완료' },
    info: { accent: 'bg-accent-fg', icon: 'i', label: '알림' },
  };

  const items = $derived(toastStore.items);
  const isPortrait = $derived(viewportModeStore.isPortrait);
  /** 하단 크롬이 점유한 높이(px). 아래 패딩 계산에 더한다. 등록이 없으면 0(기존과 동일) */
  const bottomInset = $derived(bottomInsetStore.px);
</script>

<ThemeScope>
  {#if items.length > 0}
    <!-- pointer-events-none: 컨테이너는 클릭을 통과시키고, 카드만 받는다(뒤 화면 조작을 막지 않음) -->
    <div
    class="toast-host pointer-events-none fixed bottom-0 z-[60] flex flex-col gap-2
           {isPortrait ? 'inset-x-0 items-stretch p-3' : 'right-0 items-end p-4'}"
    style="--toast-bottom-inset: {bottomInset}px"
    onmouseenter={() => toastStore.pauseAutoDismiss()}
    onmouseleave={() => toastStore.resumeAutoDismiss()}
    onfocusin={() => toastStore.pauseAutoDismiss()}
    onfocusout={(e) => {
      // 스택 안에서 버튼을 오가는 건 이탈이 아니다. 그때마다 재개하면 타이머가 요동친다.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) toastStore.resumeAutoDismiss();
    }}
    role="region"
    aria-label="알림"
  >
    {#each items as toast (toast.id)}
      <div
        class="toast-card pointer-events-auto flex gap-3 overflow-hidden rounded-lg border border-line
               bg-elevated shadow-lg {isPortrait ? 'w-full' : 'w-[26rem] max-w-[calc(100vw-2rem)]'}"
        role={toast.variant === 'error' ? 'alert' : 'status'}
        aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      >
        <!-- 좌측 색 띠: 색만으로 구분하지 않도록 아이콘/라벨을 함께 둔다(색각 접근성) -->
        <div class="w-1 shrink-0 {STYLE[toast.variant].accent}" aria-hidden="true"></div>
        <div class="flex min-w-0 flex-1 gap-2 py-3 pr-2">
          <span
            class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-surface
                   {STYLE[toast.variant].accent}"
            aria-hidden="true">{STYLE[toast.variant].icon}</span
          >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-fg">
              <span class="sr-only">{STYLE[toast.variant].label}: </span>{toast.title}
              {#if toast.count > 1}
                <span class="ml-1 rounded bg-hover px-1.5 py-0.5 text-xs font-normal text-fg-muted"
                  >{toast.count}회</span
                >
              {/if}
            </p>
            {#if toast.detail}
              <p class="mt-1 text-xs leading-relaxed break-words text-fg-muted">{toast.detail}</p>
            {/if}
            {#if toast.action}
              <button
                type="button"
                class="mt-2 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-fg transition
                       hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                onclick={() => {
                  toast.action?.run();
                  toastStore.dismiss(toast.id);
                }}>{toast.action.label}</button
              >
            {/if}
          </div>
          <button
            type="button"
            class="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition
                   hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
            aria-label="알림 닫기"
            onclick={() => toastStore.dismiss(toast.id)}>×</button
          >
        </div>
      </div>
    {/each}
    </div>
  {/if}
</ThemeScope>

<style>
  /* 노치/홈바 회피: 세로에서는 하단, 가로에서는 하단+우측 안전영역을 더한다.
     여기에 셸 하단 크롬 높이(--toast-bottom-inset)를 더해 공지 바 위에 뜨게 한다(기본 0px) */
  .toast-host {
    padding-bottom: calc(
      0.75rem + var(--toast-bottom-inset, 0px) + env(safe-area-inset-bottom, 0px)
    );
    padding-left: calc(0.75rem + env(safe-area-inset-left, 0px));
    padding-right: calc(0.75rem + env(safe-area-inset-right, 0px));
  }

  /* 아래에서 살짝 올라오며 등장. 모션 최소화 설정에서는 즉시 표시한다. */
  .toast-card {
    animation: toast-in 160ms ease-out;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast-card {
      animation: none;
    }
  }
</style>

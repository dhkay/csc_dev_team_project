<script lang="ts" module>
  // 인스턴스별 안정 id(제목 aria-labelledby용): 렌덤 대신 모듈 카운터로 SSR/hydration 안전
  let uid = 0;
  // 열린 모달 스택: 중첩 시 최상단(가장 나중에 열린) 모달만 Esc/Tab 처리(하위 모달까지 닫히지 않게)
  const openModals: symbol[] = [];
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { viewportModeStore } from '$lib/shared/lib/stores/viewport/viewportModeStore/viewportModeStore.svelte';
  import Overlay from './Overlay.svelte';

  // CenterModal: 중앙 정렬 재사용 모달. 공용 Overlay(전역 오버레이 + 스크롤 잠금) 위에 "중앙 패널"만 얹는다.
  //   (배경 딤/스크롤 잠금은 Overlay 담당: 형태 비종속. 이 컴포넌트는 패널+다이얼로그 동작만.)
  //   바텀시트/드로어/확인 다이얼로그 등 다른 형태는 같은 Overlay 를 재사용해 별도 컴포넌트로 만든다.
  // portrait 에서는 화면을 꽉 채우고(fullscreen), landscape 는 가운데 정렬 다이얼로그
  //
  // 렌더 위치 주의: 테마는 ThemeScope 클래스로 스코프되므로 이 컴포넌트는 반드시 ThemeScope 서브트리(=페이지)
  //   안에서 렌더한다(Overlay 도 동일: body portal 금지, 다크테마 스코프)
  type Size = 'md' | 'lg' | 'xl';
  interface Props {
    // 표시 여부(bindable). 닫힘 트리거 시 내부에서 false 로 설정한다.
    open?: boolean;
    // 헤더 제목(있으면 aria-labelledby 로 연결)
    title?: string;
    // landscape 패널 최대폭
    size?: Size;
    // portrait 에서 화면을 꽉 채울지(기본 true)
    fullscreenOnPortrait?: boolean;
    // 헤더 우상단 닫힘 버튼 모양(기본 'close' = X/"닫기")
    // 'back' = 왼쪽 화살표/"뒤로가기": 목록에서 상세로 들어온 세부조회처럼 뒤로 나가는 맥락에 쓴다.
    // 동작(Esc/버튼 클릭 시 open=false)은 동일, 아이콘/라벨만 바뀐다.
    closeMode?: 'close' | 'back';
    // 닫힘 콜백(Esc/배경/X 공통)
    onClose?: () => void;
    // 헤더 우상단 닫힘 버튼 "왼쪽"에 놓을 액션 영역(옵션): 프롬프트 보기 등 보조 액션 슬롯
    headerActions?: Snippet;
    // 본문: 여기에 실제 작업 UI 를 채운다.
    children: Snippet;
    // 하단 액션 영역(옵션)
    footer?: Snippet;
  }
  let {
    open = $bindable(false),
    title,
    size = 'lg',
    fullscreenOnPortrait = true,
    closeMode = 'close',
    onClose,
    headerActions,
    children,
    footer,
  }: Props = $props();

  const isPortrait = $derived(viewportModeStore.isPortrait);
  const fullscreen = $derived(isPortrait && fullscreenOnPortrait);
  // 닫힘 버튼 라벨: back 이면 "뒤로가기", 기본이면 "닫기"(아이콘도 아래에서 함께 분기)
  const closeLabel = $derived(closeMode === 'back' ? '뒤로가기' : '닫기');

  const MAX_W: Record<Size, string> = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  const titleId = `csc-modal-title-${(uid += 1)}`;
  const selfToken = Symbol('center-modal');
  let panel = $state<HTMLDivElement>();
  let restoreFocusTo: HTMLElement | null = null;

  function requestClose(): void {
    open = false;
    onClose?.();
  }

  // 패널 내부 포커서블(가시) 목록: 경량 focus trap 용
  function focusables(): HTMLElement[] {
    if (!panel) return [];
    const sel =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(panel.querySelectorAll<HTMLElement>(sel)).filter(
      (el) => el.getClientRects().length > 0,
    );
  }

  function onKeydown(e: KeyboardEvent): void {
    // 중첩 모달: 최상단(가장 나중에 열린)만 키보드를 처리한다.
    if (openModals[openModals.length - 1] !== selfToken) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      requestClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) {
      e.preventDefault();
      panel?.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !panel?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // 열려 있을 때만: 포커스 이동 + 키보드 트랩. 닫히면 자동 정리 + 포커스 복원
  // (배경 스크롤 잠금은 Overlay 가 담당한다.)
  $effect(() => {
    if (!open) return;
    openModals.push(selfToken);
    restoreFocusTo = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      (focusables()[0] ?? panel)?.focus();
    });
    window.addEventListener('keydown', onKeydown, true);
    return () => {
      const i = openModals.indexOf(selfToken);
      if (i >= 0) openModals.splice(i, 1);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeydown, true);
      restoreFocusTo?.focus?.();
      restoreFocusTo = null;
    };
  });
</script>

<!-- 공용 Overlay(배경 딤 + 스크롤 잠금) 위에 중앙 패널만 얹는다. 배경 클릭으로는 닫지 않음(Esc/X 만) -->
<Overlay {open} class={fullscreen ? '' : 'items-center justify-center p-4'}>
  <!-- 패널: portrait=꽉 채움 / landscape=가운데 다이얼로그 -->
  <div
    bind:this={panel}
    class="flex flex-col overflow-hidden border border-line bg-elevated text-fg shadow-xl dark:shadow-black/40 {fullscreen
      ? 'h-dvh w-full rounded-none'
      : `w-full ${MAX_W[size]} h-[80dvh] rounded-xl`}"
    role="dialog"
    aria-modal="true"
    aria-labelledby={title ? titleId : undefined}
    tabindex="-1"
  >
      <!-- 헤더 -->
      <div class="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div class="flex min-w-0 items-center gap-2">
          <h2 id={titleId} class="truncate text-base font-semibold">{title ?? ''}</h2>
        </div>
        <!-- 우측 액션 그룹: (옵션)보조 액션 + 닫힘 버튼. 보조 액션은 닫힘 버튼 왼쪽에 온다. -->
        <div class="flex shrink-0 items-center gap-1">
          {#if headerActions}
            {@render headerActions()}
          {/if}
          <button
            type="button"
            onclick={requestClose}
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              {#if closeMode === 'back'}
                <!-- 뒤로가기(왼쪽 화살표): MarketingVideoNav 와 동일 아이콘 -->
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              {:else}
                <path d="M18 6 6 18M6 6l12 12" />
              {/if}
            </svg>
          </button>
        </div>
      </div>

      <!-- 본문(스크롤 허용): 실제 작업 UI 는 children 으로 주입 -->
      <div class="min-h-0 flex-1 overflow-auto p-4" data-scroll-allowed="true">
        {@render children()}
      </div>

      <!-- 하단 액션(옵션) -->
      {#if footer}
        <div class="shrink-0 border-t border-line px-4 py-3">
          {@render footer()}
        </div>
      {/if}
  </div>
</Overlay>

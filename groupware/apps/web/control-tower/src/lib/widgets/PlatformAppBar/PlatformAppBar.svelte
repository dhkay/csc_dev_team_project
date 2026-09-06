<script lang="ts">
  import { sidebarStore } from '$lib/shared/lib/stores/sidebar/sidebarStore.svelte';
  import { authService } from '$lib/features/account/services/auth.service';

  // 상단 앱바: 화면 전체 폭, 셸 최상단 고정. 햄버거(모바일), 타이틀, 사용자/로그아웃
  let { userName = '관리자' }: { userName?: string } = $props();

  let loggingOut = $state(false);

  async function logout(): Promise<void> {
    if (loggingOut) return;
    loggingOut = true;
    try {
      await authService.logout();
    } finally {
      // 전체 새로고침으로 클라이언트 상태까지 초기화
      window.location.href = '/login';
    }
  }
</script>

<header
  class="flex h-14 w-full shrink-0 items-center gap-3 bg-brand px-3 text-white sm:px-4"
>
  <!-- 좌측: 햄버거(모바일) + 로고/타이틀 -->
  <button
    type="button"
    onclick={sidebarStore.toggleMobile}
    aria-label="메뉴 열기"
    aria-controls="platform-sidebar"
    aria-expanded={sidebarStore.mobileOpen}
    class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/15 lg:hidden"
  >
    <svg
      class="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  </button>

  <div class="flex items-center gap-2">
    <div
      class="flex h-8 w-8 items-center justify-center rounded-md bg-white/15 text-sm font-bold"
      aria-hidden="true"
    >
      C
    </div>
    <span class="text-base font-semibold tracking-tight">CSC Partners</span>
  </div>

  <!-- 가운데: 스페이서 -->
  <div class="flex-1"></div>

  <!-- 우측: 사용자명 + 로그아웃 -->
  <!-- 프로필 이미지 영역은 추후 도입(플랫폼 관리자 프로필이미지 관리): 지금은 미표시 -->
  <div class="flex items-center gap-2 sm:gap-3">
    <span class="hidden text-sm text-white/80 sm:inline">{userName}</span>
    <button
      type="button"
      onclick={logout}
      disabled={loggingOut}
      class="rounded-md px-2 py-1 text-sm text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-50"
    >
      로그아웃
    </button>
  </div>
</header>

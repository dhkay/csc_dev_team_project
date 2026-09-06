<script lang="ts">
  import { page } from '$app/stores';
  import { navItems } from '$lib/app/config/navigation';
  import { hasAdminFeature, isPlatformRoot } from '$lib/shared/lib/auth/platform';
  import { sidebarStore } from '$lib/shared/lib/stores/sidebar/sidebarStore.svelte';
  import type { CurrentUser } from '$lib/shared/types/common.types';
  import NavItem from './NavItem.svelte';

  // 좌측 사이드바: 한 컴포넌트가 두 모드를 Tailwind variant 로 표현한다.
  // - < lg : fixed 오프캔버스 드로어(+백드롭). mobileOpen 으로 슬라이드
  // - ≥ lg : 정상 플로우(static). collapsed 로 펼침(w-60) ↔ 아이콘 레일(w-16) 전환

  let { user }: { user?: CurrentUser | null } = $props();

  /** 현재 경로 기준 활성 메뉴 판별: '/'는 정확히, 그 외는 하위 경로 포함 */
  function isActive(href: string, pathname: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }

  const pathname = $derived($page.url.pathname);

  // 권한 기반 노출(접근 차단): rootOnly → ROOT 만, feature → ROOT/해당 옵션 ADMIN, 무조건 → 전체
  const visibleItems = $derived(
    navItems.filter((item) => {
      if (item.rootOnly) return isPlatformRoot(user);
      if (item.feature) return hasAdminFeature(user, item.feature);
      return true;
    })
  );
</script>

<!-- 모바일 드로어 백드롭 (lg 이상에서는 비활성) -->
{#if sidebarStore.mobileOpen}
  <div
    class="fixed inset-0 z-30 bg-black/40 lg:hidden"
    role="presentation"
    onclick={sidebarStore.closeMobile}
  ></div>
{/if}

<aside
  id="platform-sidebar"
  class="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-gray-200 bg-white
    transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0
    {sidebarStore.mobileOpen ? 'translate-x-0' : '-translate-x-full'}
    {sidebarStore.collapsed ? 'lg:w-16' : 'lg:w-60'}"
>
  <nav class="flex-1 space-y-1 overflow-y-auto p-3" aria-label="플랫폼 메뉴">
    {#each visibleItems as item (item.id)}
      <NavItem
        {item}
        collapsed={sidebarStore.collapsed}
        active={isActive(item.href, pathname)}
        onnavigate={sidebarStore.closeMobile}
      />
    {/each}
  </nav>

  <!-- 데스크톱 레일 접기 토글 (모바일에서는 숨김) -->
  <div class="hidden border-t border-gray-200 p-3 lg:block">
    <button
      type="button"
      onclick={sidebarStore.toggleCollapsed}
      title={sidebarStore.collapsed ? '펼치기' : '접기'}
      aria-label={sidebarStore.collapsed ? '사이드바 펼치기' : '사이드바 접기'}
      class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500
        transition-colors hover:bg-gray-100 hover:text-gray-900
        {sidebarStore.collapsed ? 'lg:justify-center lg:px-0' : ''}"
    >
      <svg
        class="h-5 w-5 shrink-0 transition-transform {sidebarStore.collapsed ? 'rotate-180' : ''}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
      <span class={sidebarStore.collapsed ? 'lg:hidden' : ''}>접기</span>
    </button>
  </div>
</aside>

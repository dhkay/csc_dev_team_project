<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { CurrentUser } from '$lib/shared/types/common.types';
  import { sidebarStore } from '$lib/shared/lib/stores/sidebar/sidebarStore.svelte';
  import PlatformAppBar from '../PlatformAppBar/PlatformAppBar.svelte';
  import PlatformSidebar from '../PlatformSidebar/PlatformSidebar.svelte';
  import ContentRegion from '$lib/shared/ui/layout/ContentRegion.svelte';

  // 플랫폼 셸: 상단 앱바(전체 폭) + 아래 좌측 사이드바 + 콘텐츠 영역
  // 보조 창은 인페이지 플로팅이 아니라 네이티브 팝아웃(window.open)으로 띄운다. 셸은 창을 마운트하지 않는다.
  let {
    user,
    children
  }: { user?: CurrentUser | null; children: Snippet } = $props();

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && sidebarStore.mobileOpen) {
      sidebarStore.closeMobile();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-dvh flex-col">
  <PlatformAppBar userName={user?.name ?? '관리자'} />

  <div class="flex min-h-0 flex-1">
    <PlatformSidebar {user} />

    <ContentRegion contentClass="bg-gray-50 p-4">
      {@render children()}
    </ContentRegion>
  </div>
</div>

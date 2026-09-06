<script lang="ts">
  import type { NavItem } from '$lib/app/config/navigation';
  import Icon from './Icon.svelte';

  // 사이드바 단일 메뉴 링크
  // - collapsed(데스크톱 레일): 라벨 숨기고 아이콘만, title 로 툴팁. 모바일 드로어에선 항상 라벨 표시
  // - active: 현재 경로 강조 + aria-current.
  let {
    item,
    collapsed = false,
    active = false,
    onnavigate
  }: {
    item: NavItem;
    collapsed?: boolean;
    active?: boolean;
    onnavigate?: () => void;
  } = $props();
</script>

<a
  href={item.href}
  title={collapsed ? item.label : undefined}
  aria-current={active ? 'page' : undefined}
  onclick={() => onnavigate?.()}
  class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors
    {active
    ? 'bg-brand/10 font-semibold text-brand'
    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
    {collapsed ? 'lg:justify-center lg:px-0' : ''}"
>
  <Icon name={item.icon} class="h-5 w-5 shrink-0" />
  <span class={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
</a>

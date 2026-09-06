<script lang="ts">
  // 앱바 프로필 드롭다운: 아바타(트리거) 클릭 시 메뉴를 연다.
  // 순수 표현 컴포넌트: 항목(items)은 상위(레이아웃/페이지)가 소유해 내려준다 → 페이지마다 다른 메뉴 구성 가능
  // 외부 클릭 / Escape 로 닫히고, 항목 선택 시 닫은 뒤 onSelect 를 호출한다.
  import ProfileAvatar from '$lib/shared/ui/ProfileAvatar.svelte';
  import type { ProfileMenuIcon, ProfileMenuItem } from './profileMenu.types';

  interface Props {
    userName?: string;
    profileImageUrl?: string | null;
    items: ProfileMenuItem[];
  }

  let { userName = '관리자', profileImageUrl = null, items }: Props = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement>();

  const close = (): void => {
    open = false;
  };

  function onPointerDown(e: PointerEvent): void {
    if (root && !root.contains(e.target as Node)) close();
  }
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  // 열려 있을 때만 전역 리스너 부착(닫히면 자동 정리)
  $effect(() => {
    if (!open) return;
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeydown);
    };
  });

  function select(item: ProfileMenuItem): void {
    if (item.disabled) return;
    close();
    item.onSelect?.();
  }
</script>

{#snippet icon(name: ProfileMenuIcon)}
  <svg
    class="h-4 w-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {#if name === 'settings'}
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
      />
    {:else if name === 'logout'}
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    {:else}
      <!-- home -->
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9 21v-6h6v6" />
    {/if}
  </svg>
{/snippet}

<div class="relative" bind:this={root}>
  <!-- 트리거: 아바타 + 이름 + 셰브론 -->
  <button
    type="button"
    onclick={() => (open = !open)}
    class="flex items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="내 계정 메뉴"
  >
    <ProfileAvatar
      src={profileImageUrl}
      sizeClass="h-8 w-8"
      iconClass="h-5 w-5"
      alt={`${userName} 프로필`}
    />
    <span class="max-w-[8rem] truncate text-sm text-fg-muted">{userName}</span>
    <svg
      class="h-4 w-4 shrink-0 text-fg-subtle transition-transform {open ? 'rotate-180' : ''}"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>

  {#if open}
    <div
      role="menu"
      class="absolute right-0 top-full z-50 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-line bg-elevated py-1 shadow-lg dark:shadow-black/40"
    >
      {#each items as item (item.id)}
        {#if item.separatorBefore}
          <div class="my-1 h-px bg-line" role="separator"></div>
        {/if}

        {#if item.href}
          <a
            role="menuitem"
            href={item.href}
            onclick={close}
            class="flex items-center gap-2.5 px-3 py-2 text-sm transition {item.danger
              ? 'text-danger-fg hover:bg-danger-bg'
              : 'text-fg-muted hover:bg-hover'}"
          >
            {#if item.icon}{@render icon(item.icon)}{/if}
            <span class="truncate">{item.label}</span>
          </a>
        {:else}
          <button
            role="menuitem"
            type="button"
            disabled={item.disabled}
            onclick={() => select(item)}
            class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 {item.danger
              ? 'text-danger-fg hover:bg-danger-bg'
              : 'text-fg-muted hover:bg-hover'}"
          >
            {#if item.icon}{@render icon(item.icon)}{/if}
            <span class="truncate">{item.label}</span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

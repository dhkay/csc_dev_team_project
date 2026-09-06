<script lang="ts">
  // 테마 토글: 해/달 아이콘 버튼. themeStore 를 직접 소비(프롭 불필요)해 어디서든 배치 가능
  // 현재 다크면 해(→라이트로), 라이트면 달(→다크로) 아이콘을 보여준다. AppBar 아이콘 버튼 스펙과 정렬
  import { themeStore } from '$lib/shared/lib/stores/theme/themeStore.svelte';

  const isDark = $derived(themeStore.isDark);
</script>

<button
  type="button"
  onclick={() => themeStore.toggle()}
  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
  aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
  title={isDark ? '라이트 모드' : '다크 모드'}
  aria-pressed={isDark}
>
  {#if isDark}
    <!-- 해(라이트로 전환) -->
    <svg
      class="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  {:else}
    <!-- 달(다크로 전환) -->
    <svg
      class="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  {/if}
</button>

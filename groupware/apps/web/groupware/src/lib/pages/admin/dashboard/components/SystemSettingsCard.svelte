<script lang="ts">
  // 시스템 환경설정 카드. 내정보 우측 타일(2x2)이고 루트 권한자(ROOT/대표) 전용이다.
  // 노출 게이팅은 TileGrid(requireRootAuthority)가 담당하며, 이 카드는 레이아웃(2x2 그리드)만 그린다.
  // 현재 실제 동작하는 항목은 API 등록과 AI 어시스턴트 둘이고, 각각 /[orgSlug]/admin/{href} 로 이동한다.
  // 나머지 칸은 어떤 설정이 들어올지 드러내지 않고 익명 '준비중' 자리로만 채운다.
  import { page } from '$app/stores';

  /** 아이콘 종류. 실제 path 는 아래 icon 스니펫이 그린다. */
  type SettingIcon = 'key' | 'chat';

  interface SettingItem {
    key: string;
    label: string;
    description: string;
    // /{orgSlug}/admin/{href} 로 이동한다.
    href: string;
    icon: SettingIcon;
  }

  const slug = $derived($page.params.orgSlug);

  // 실제 동작하는 설정 항목. 새 설정이 준비되면 여기에 추가하면 준비중 자리가 자동으로 줄어든다.
  const readyItems: SettingItem[] = [
    { key: 'api', label: 'API 등록', description: '외부 API 키', href: 'api-credentials', icon: 'key' },
    { key: 'assistant', label: 'AI 어시스턴트', description: '조직 프롬프트/모델', href: 'ai-assistant', icon: 'chat' }
  ];

  // 2x2 = 4칸을 채우기 위한 익명 '준비중' 자리 개수(동작 항목이 늘면 자동 감소)
  const GRID_CELLS = 4;
  const placeholders = $derived(
    Array.from({ length: Math.max(0, GRID_CELLS - readyItems.length) }, (_, i) => i)
  );
</script>

{#snippet icon(name: SettingIcon)}
  <!-- 인라인 SVG. 앱의 다른 아이콘과 같은 방식이고, 폰트에 따라 모양이 달라지지 않는다. -->
  <svg
    class="h-4 w-4 text-[#1868db]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {#if name === 'key'}
      <circle cx="8" cy="15" r="4" />
      <path d="m10.85 12.15 8.15-8.15" />
      <path d="m18 6 2 2" />
      <path d="m15 9 2 2" />
    {:else}
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    {/if}
  </svg>
{/snippet}

<article
  class="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
>
  <h2 class="text-lg font-bold text-gray-900">시스템 환경설정</h2>

  <!-- 2x2 그리드: 동작 항목(링크)만 정체를 드러내고, 나머지는 익명 '준비중' 자리 -->
  <div class="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2">
    {#each readyItems as item (item.key)}
      <a
        href={slug ? `/${slug}/admin/${item.href}` : undefined}
        class="flex min-h-0 flex-col items-start justify-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-colors hover:border-gray-300 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/60"
      >
        <div class="flex w-full items-center gap-2">
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#1868db]/10"
            aria-hidden="true"
          >
            {@render icon(item.icon)}
          </span>
          <span class="truncate text-sm font-semibold text-gray-900">{item.label}</span>
        </div>
        <span class="truncate text-xs text-gray-500">{item.description}</span>
      </a>
    {/each}

    {#each placeholders as i (i)}
      <div
        class="flex min-h-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50/60 px-3 py-2"
      >
        <span
          class="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-400"
        >
          준비중
        </span>
      </div>
    {/each}
  </div>
</article>

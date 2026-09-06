<script lang="ts">
  import { page } from '$app/stores';
  import type { PlaceholderTile } from '$lib/shared/lib/stores/tilesStore/tile.types';

  // 플레이스홀더 타일 카드("모달식" = 카드 외관). 레이아웃 전용
  // 크기/높이는 부모 슬롯(TileGrid)이 결정 → 카드는 컨테이너를 가득 채우기만 한다.
  // 일러스트(iconName)는 레퍼런스처럼 카드 우하단에 살짝 블리드되게 깔고, 텍스트는 좌상단
  interface Props {
    tile: PlaceholderTile;
  }
  let { tile }: Props = $props();

  // href 가 있으면 /{orgSlug}/admin/{href} 로 이동하는 클릭 가능 카드가 된다.
  const slug = $derived($page.params.orgSlug);
  const linkHref = $derived(tile.href ? `/${slug}/admin/${tile.href}` : undefined);

  // static/assets/icon/dashboard/{iconName}.svg → 루트 기준 URL.
  const iconSrc = $derived(tile.iconName ? `/assets/icon/dashboard/${tile.iconName}.svg` : undefined);
  // 일러스트는 타일 크기와 무관하게 동일 크기로 우하단 블리드(2x2라고 더 키우지 않는다)
  const illoClass = 'h-[5.5rem] w-[5.5rem] -bottom-1 -right-1';

  // 우하단 코너 틴트: 일러스트가 흰 배경에서 튀지 않게 같은 색 계열의 은은한 영역을 깐다.
  // 아이콘 색 계열별 옅은 틴트(레퍼런스의 따뜻한 코너 배경과 동일한 역할)
  // 따뜻한 hero(콘텐츠, 결제)는 살구, 나머지 블루 hero 는 옅은 블루
  const TILE_TINT: Record<string, string> = {
    users: '#eef4ff',
    org: '#eef4ff',
    roles: '#eef4ff',
    content: '#fff1e8',
    stats: '#eef4ff',
    settings: '#eef4ff',
    logs: '#eef4ff',
    billing: '#fff1e8',
    storage: '#eef4ff'
  };
  const tint = $derived(tile.iconName ? (TILE_TINT[tile.iconName] ?? '#eef2f8') : undefined);
  const tintClass = 'h-32 w-32';
</script>

{#snippet body()}
  <div class="relative z-10 flex flex-col pr-12">
    {#if !iconSrc}
      <div
        class="mb-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#1868db]/10 text-lg"
        aria-hidden="true"
      >
        {tile.icon ?? '▩'}
      </div>
    {/if}
    <h3 class="truncate text-base font-semibold text-gray-900">{tile.title}</h3>
    {#if tile.subtitle}
      <p class="mt-1 truncate text-sm text-gray-500">{tile.subtitle}</p>
    {/if}
  </div>
  {#if iconSrc}
    <div
      class="pointer-events-none absolute bottom-0 right-0 {tintClass}"
      style="background: radial-gradient(120% 120% at 100% 100%, {tint} 0%, {tint} 30%, transparent 72%);"
      aria-hidden="true"
    ></div>
    <img
      src={iconSrc}
      alt=""
      aria-hidden="true"
      draggable="false"
      class="pointer-events-none absolute select-none {illoClass}"
      style="opacity:.95; filter:saturate(.9);"
    />
  {/if}
{/snippet}

{#if linkHref}
  <a
    href={linkHref}
    class="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/60"
  >
    {@render body()}
  </a>
{:else}
  <article
    class="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
  >
    {@render body()}
  </article>
{/if}

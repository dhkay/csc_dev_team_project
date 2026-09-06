<script lang="ts">
  import { page } from '$app/stores';
  import { tilesStore } from '$lib/shared/lib/stores/tilesStore/tilesStore.svelte';
  import { canManageOrg, hasRootAuthority } from '$lib/shared/lib/auth/access';
  import {
    packTilesIntoSlots,
    SLOT_HEIGHT_REM,
    SLOT_ROW_UNITS,
    MIN_COLUMN_REM
  } from '../tileLayout';
  import Tile from './Tile.svelte';
  import MyInfoCard from './MyInfoCard.svelte';
  import SystemSettingsCard from './SystemSettingsCard.svelte';

  // 배치/패킹 로직은 feature lib(tileLayout)에 위임. 이 컴포넌트는 렌더링만 담당한다.
  // 콘텐츠는 타일 kind로 분기(현재 2종 → {#if}로 충분. 늘면 kind→컴포넌트 레지스트리로)
  // 열 개수는 순수 CSS auto-fill 로 창 폭에 따라 자동 조정된다.

  // 타일 게이팅: requireOrgManage 면 조직 관리 가능자(ROOT/시스템관리), requireRootAuthority 면
  // 루트 권한자(ROOT/대표)에게만 노출(UX 가시성). user(role/permissions/position)는
  // [orgSlug]/admin/+layout.server.ts 가 data.user 로 내려준다. 인가는 서버 가드 담당
  const orgManager = $derived(canManageOrg($page.data?.user));
  const rootAuthority = $derived(hasRootAuthority($page.data?.user));
  const visibleTiles = $derived(
    tilesStore.tiles.filter(
      (t) =>
        !t.hidden &&
        (!t.requireOrgManage || orgManager) &&
        (!t.requireRootAuthority || rootAuthority)
    )
  );
  const slots = $derived(packTilesIntoSlots(visibleTiles));
</script>

<div
  class="grid gap-3"
  style="grid-template-columns: repeat(auto-fill, minmax({MIN_COLUMN_REM}rem, 1fr));"
>
  {#each slots as slot (slot.key)}
    <div class="flex flex-col gap-3" style="height: {SLOT_HEIGHT_REM}rem;">
      {#each slot.items as item (item.tile.id)}
        <div class="min-h-0" style="flex: {item.rowSpan} 1 0;">
          {#if item.tile.kind === 'myInfo'}
            <MyInfoCard />
          {:else if item.tile.kind === 'systemSettings'}
            <SystemSettingsCard />
          {:else}
            <Tile tile={item.tile} />
          {/if}
        </div>
      {/each}
      {#if slot.usedUnits < SLOT_ROW_UNITS}
        <!-- 남는 세로 공간: 비율 유지용 스페이서 -->
        <div
          class="min-h-0"
          style="flex: {SLOT_ROW_UNITS - slot.usedUnits} 1 0;"
          aria-hidden="true"
        ></div>
      {/if}
    </div>
  {/each}
</div>

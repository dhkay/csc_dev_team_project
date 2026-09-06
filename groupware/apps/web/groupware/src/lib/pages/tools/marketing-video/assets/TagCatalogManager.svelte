<script lang="ts">
  // 조직 태그 관리 모달(카테고리 1개): 자산 탭(BGM/효과음)에서 "태그 관리" 로 연다.
  //   공통(플랫폼) 축/태그는 읽기 전용, 우리 조직 축/태그는 편집. 공통 축 아래에도 우리 조직 태그를 더할 수 있다.
  //   축, 태그 모두 키(영문, AI 매칭용) + 표시명(한글, 작업자용)을 갖는다. 변경 후 invalidateAll()
  import { invalidateAll } from '$app/navigation';
  import { assetCatalogService } from '$lib/features/marketing-assets/services/assetCatalog.service';
  import {
    MARKETING_ASSET_CATEGORY_META,
    type AssetAxisView,
    type MarketingAssetCategory,
  } from '$lib/features/marketing-assets/types';

  interface Props {
    category: MarketingAssetCategory;
    axes: AssetAxisView[];
    onClose: () => void;
  }
  let { category, axes, onClose }: Props = $props();

  const label = $derived(MARKETING_ASSET_CATEGORY_META[category].label);
  const categoryAxes = $derived(axes.filter((a) => a.category === category));

  let busy = $state(false);
  let error = $state('');
  // 축별 태그 초안(키+표시명), 새 축 초안(키+표시명)
  let tagDraft = $state<Record<number, { key: string; label: string }>>({});
  let newAxis = $state<{ key: string; label: string }>({ key: '', label: '' });

  const isOrg = (scope: string): boolean => scope === 'organization';
  const draftOf = (axisId: number) => tagDraft[axisId] ?? { key: '', label: '' };

  async function run(fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
      await invalidateAll();
    } catch (e) {
      error = e instanceof Error ? e.message : '작업에 실패했습니다.';
    } finally {
      busy = false;
    }
  }

  function addAxis(): void {
    if (!newAxis.key.trim() || !newAxis.label.trim()) {
      error = '축 키(영문)와 표시명을 입력하세요.';
      return;
    }
    void run(async () => {
      await assetCatalogService.createAxis({ category, key: newAxis.key.trim(), label: newAxis.label.trim() });
      newAxis = { key: '', label: '' };
    });
  }
  function deleteAxis(id: number, name: string): void {
    if (!confirm(`'${name}' 축과 그 태그를 삭제할까요? 자산에 붙은 해당 태그도 함께 제거됩니다.`)) return;
    void run(() => assetCatalogService.deleteAxis(id));
  }
  function addTag(axisId: number): void {
    const d = draftOf(axisId);
    const key = d.key.trim();
    if (!key) {
      error = '태그 키(영문)를 입력하세요.';
      return;
    }
    void run(async () => {
      // value=키(AI 매칭), label=표시명(한글, 비우면 키로 대체)
      await assetCatalogService.createTag({ axisId, value: key, label: d.label.trim() || key });
      tagDraft[axisId] = { key: '', label: '' };
    });
  }
  function deleteTag(id: number): void {
    void run(() => assetCatalogService.deleteTag(id));
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <button type="button" onclick={onClose} aria-label="닫기" class="absolute inset-0 bg-black/50"></button>
  <div class="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-2xl">
    <div class="flex shrink-0 items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-fg">{label} 태그 관리</h3>
      <button type="button" onclick={onClose} aria-label="닫기" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-subtle transition hover:bg-hover hover:text-fg">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>

    <p class="shrink-0 text-[11px] text-fg-subtle">
      키(영문)는 AI 매칭에, 표시명(한글)은 작업자에게 보입니다.
      <span class="rounded-full border border-line px-1.5 py-0.5">공통</span> 은 읽기 전용,
      <span class="rounded-full bg-accent-bg px-1.5 py-0.5 text-accent-fg">우리 조직</span> 은 편집 가능.
    </p>
    {#if error}
      <p class="shrink-0 text-sm text-danger-fg" role="alert">{error}</p>
    {/if}

    <!-- 축 목록: 대략 5개까지 보이고 나머지는 스크롤(헤더/축추가는 고정) -->
    <div class="flex max-h-[26rem] min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
      {#if categoryAxes.length === 0}
        <p class="text-sm text-fg-subtle">아직 축이 없습니다. 아래에서 우리 조직 축을 추가하세요.</p>
      {/if}

      {#each categoryAxes as axis (axis.id)}
        <div class="flex flex-col gap-2 rounded-md border border-line bg-elevated p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium text-fg">{axis.label}</span>
            <span class="rounded bg-hover px-1.5 py-0.5 font-mono text-[11px] text-fg-subtle">{axis.key}</span>
            {#if isOrg(axis.scope)}
              <span class="rounded-full bg-accent-bg px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">우리 조직</span>
              <button type="button" onclick={() => deleteAxis(axis.id, axis.label)} disabled={busy} class="ml-auto text-xs text-danger-fg hover:opacity-80 disabled:opacity-50">축 삭제</button>
            {:else}
              <span class="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-fg-subtle">공통</span>
            {/if}
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            {#each axis.tags as tag (tag.id)}
              <span class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs {isOrg(tag.scope) ? 'border-accent-bg bg-accent-bg/40 text-fg' : 'border-line text-fg-subtle'}">
                {tag.label}
                {#if tag.value !== tag.label}<span class="font-mono text-[10px] opacity-70">{tag.value}</span>{/if}
                {#if isOrg(tag.scope)}
                  <button type="button" onclick={() => deleteTag(tag.id)} disabled={busy} aria-label={`${tag.label} 삭제`} class="text-fg-subtle hover:text-danger-fg disabled:opacity-50">
                    <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                {/if}
              </span>
            {/each}
          </div>

          <!-- 우리 조직 태그 추가(키 + 표시명) -->
          <div class="flex flex-wrap items-center gap-1.5">
            <input
              value={draftOf(axis.id).key}
              oninput={(e) => (tagDraft[axis.id] = { key: e.currentTarget.value, label: draftOf(axis.id).label })}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(axis.id); } }}
              disabled={busy}
              placeholder="키(영문)"
              class="w-32 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
            />
            <input
              value={draftOf(axis.id).label}
              oninput={(e) => (tagDraft[axis.id] = { key: draftOf(axis.id).key, label: e.currentTarget.value })}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(axis.id); } }}
              disabled={busy}
              placeholder="표시명(한글)"
              class="min-w-[8rem] flex-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
            />
            <button type="button" onclick={() => addTag(axis.id)} disabled={busy} aria-label="태그 추가" title="태그 추가" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-fg-subtle transition hover:bg-hover hover:text-fg disabled:opacity-40">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
        </div>
      {/each}
    </div>

    <!-- 우리 조직 전용 축 추가(키 + 표시명) -->
    <div class="flex shrink-0 flex-wrap items-end gap-2 border-t border-line pt-3">
      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-fg-subtle">축 키 (영문)</span>
        <input bind:value={newAxis.key} disabled={busy} placeholder="" class="w-28 rounded-md border border-line bg-elevated px-2 py-1 font-mono text-xs text-fg focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-fg-subtle">축 표시명 (한글)</span>
        <input bind:value={newAxis.label} disabled={busy} placeholder="" class="w-32 rounded-md border border-line bg-elevated px-2 py-1 text-xs text-fg focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15" />
      </label>
      <button type="button" onclick={addAxis} disabled={busy} class="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-hover disabled:opacity-50">우리 조직 축 추가</button>
    </div>
  </div>
</div>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

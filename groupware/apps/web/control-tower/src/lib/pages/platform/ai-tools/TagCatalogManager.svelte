<script lang="ts">
  // 태그 관리 모달(플랫폼, 카테고리 1개): 자산 탭(BGM/효과음)에서 "태그 관리" 로 연다.
  //   플랫폼은 공통(common) 축/태그를 CRUD. 축, 태그 모두 키(영문, AI 매칭) + 표시명(한글, 작업자) 을 갖는다.
  import { invalidateAll } from '$app/navigation';
  import { assetCatalogService } from '$lib/features/common-assets/services/assetCatalog.service';
  import {
    COMMON_ASSET_CATEGORY_META,
    type AssetAxisView,
    type CommonAssetCategory,
  } from '$lib/features/common-assets/types';

  interface Props {
    category: CommonAssetCategory;
    axes: AssetAxisView[];
    onClose: () => void;
  }
  let { category, axes, onClose }: Props = $props();

  const label = $derived(COMMON_ASSET_CATEGORY_META[category].label);
  const categoryAxes = $derived(axes.filter((a) => a.category === category));

  let busy = $state(false);
  let error = $state('');
  let tagDraft = $state<Record<number, { key: string; label: string }>>({});
  let newAxis = $state<{ key: string; label: string }>({ key: '', label: '' });

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
    if (!confirm(`'${name}' 축과 그 태그를 모두 삭제할까요? 자산에 붙은 해당 태그도 함께 제거됩니다.`)) return;
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
  <div class="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col gap-3 rounded-xl bg-white p-5 shadow-2xl">
    <div class="flex shrink-0 items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-gray-700">{label} 태그 관리 <span class="font-normal text-gray-400">(공통)</span></h3>
      <button type="button" onclick={onClose} aria-label="닫기" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>

    <p class="shrink-0 text-[11px] text-gray-400">키(영문)는 AI 매칭에, 표시명(한글)은 작업자에게 보입니다.</p>
    {#if error}
      <p class="shrink-0 text-sm text-red-600" role="alert">{error}</p>
    {/if}

    <!-- 축 목록: 대략 5개까지 보이고 나머지는 스크롤(헤더/축추가는 고정) -->
    <div class="flex max-h-[26rem] min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
      {#if categoryAxes.length === 0}
        <p class="text-sm text-gray-400">아직 축이 없습니다. 아래에서 축을 추가하세요.</p>
      {/if}

      {#each categoryAxes as axis (axis.id)}
        <div class="flex flex-col gap-2 rounded-md border border-gray-100 bg-gray-50 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium text-gray-800">{axis.label}</span>
            <span class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-500">{axis.key}</span>
            {#if !axis.isActive}
              <span class="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">비활성</span>
            {/if}
            <button type="button" onclick={() => deleteAxis(axis.id, axis.label)} disabled={busy} class="ml-auto text-xs text-red-600 hover:text-red-700 disabled:opacity-50">축 삭제</button>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            {#each axis.tags as tag (tag.id)}
              <span class="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700">
                {tag.label}
                {#if tag.value !== tag.label}<span class="font-mono text-[10px] text-gray-400">{tag.value}</span>{/if}
                <button type="button" onclick={() => deleteTag(tag.id)} disabled={busy} aria-label={`${tag.label} 삭제`} class="text-gray-400 hover:text-red-600 disabled:opacity-50">
                  <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </span>
            {/each}
          </div>

          <!-- 태그 추가(키 + 표시명) -->
          <div class="flex flex-wrap items-center gap-1.5">
            <input
              value={draftOf(axis.id).key}
              oninput={(e) => (tagDraft[axis.id] = { key: e.currentTarget.value, label: draftOf(axis.id).label })}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(axis.id); } }}
              disabled={busy}
              placeholder="키(영문)"
              class="w-32 rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs text-gray-800 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <input
              value={draftOf(axis.id).label}
              oninput={(e) => (tagDraft[axis.id] = { key: draftOf(axis.id).key, label: e.currentTarget.value })}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(axis.id); } }}
              disabled={busy}
              placeholder="표시명(한글)"
              class="min-w-[8rem] flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <button type="button" onclick={() => addTag(axis.id)} disabled={busy} aria-label="태그 추가" title="태그 추가" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
        </div>
      {/each}
    </div>

    <div class="flex shrink-0 flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-gray-500">축 키 (영문)</span>
        <input bind:value={newAxis.key} disabled={busy} placeholder="" class="w-28 rounded-md border border-gray-300 px-2 py-1 font-mono text-xs focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-gray-500">축 표시명 (한글)</span>
        <input bind:value={newAxis.label} disabled={busy} placeholder="" class="w-32 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
      </label>
      <button type="button" onclick={addAxis} disabled={busy} class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">축 추가</button>
    </div>
  </div>
</div>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<script lang="ts">
  // 자산 풀(단일 카테고리): 플랫폼 공통(읽기전용) + 조직(ROOT/대표/팀장 편집). AI 가 영상에 자동 삽입
  //   추가/편집은 모달(파일+이름 / 이름), 이미지 클릭 시 확대. 변경 후 invalidateAll() 로 SSR 재로드
  import { invalidateAll } from '$app/navigation';
  import { marketingAssetsService } from '$lib/features/marketing-assets/services/marketingAssets.service';
  import {
    MARKETING_ASSET_CATEGORY_META,
    type AssetAxisView,
    type CommonAssetView,
    type MarketingAssetCategory,
  } from '$lib/features/marketing-assets/types';
  import TagSelect from './TagSelect.svelte';
  import AudioPlayer from '../shared/AudioPlayer.svelte';
  import TagCatalogManager from './TagCatalogManager.svelte';

  interface Props {
    category: MarketingAssetCategory;
    commonAssets: CommonAssetView[];
    canManage: boolean;
    axes: AssetAxisView[];
  }
  let { category, commonAssets, canManage, axes }: Props = $props();

  const meta = $derived(MARKETING_ASSET_CATEGORY_META[category]);
  const current = $derived(commonAssets.filter((a) => a.category === category));
  // 이 카테고리의 활성 축 + 각 축의 활성 태그(카탈로그, SSR 로드분)
  const categoryAxes = $derived(
    axes
      .filter((ax) => ax.category === category && ax.isActive)
      .map((ax) => ({ ...ax, tags: ax.tags.filter((t) => t.isActive) })),
  );

  // 공통(scope='common') / 우리 조직(scope='organization') / 팩(scope='pack') 그룹 분리. 빈 그룹은 감춘다.
  const groups = $derived(
    [
      { key: 'organization', label: '우리 조직', badge: 'bg-accent-bg text-accent-fg' },
      { key: 'common', label: '공통', badge: 'border border-line text-fg-subtle' },
      { key: 'pack', label: '플러그인 팩', badge: 'border border-line text-fg-subtle' },
    ]
      .map((g) => ({ ...g, items: current.filter((a) => a.scope === g.key) }))
      .filter((g) => g.items.length > 0),
  );

  const manageable = (a: CommonAssetView): boolean => canManage && a.scope === 'organization';

  // 폰트 미리보기: 업로드한 글꼴을 FontFace 로 로드해 샘플 텍스트에 적용(로드 실패 시 기본 폰트로 폴백)
  function fontPreview(node: HTMLElement, param: { url: string; id: number }) {
    const family = `mv-font-${param.id}`;
    const face = new FontFace(family, `url("${param.url}")`);
    face
      .load()
      .then((f) => {
        document.fonts.add(f);
        node.style.fontFamily = `"${family}", sans-serif`;
      })
      .catch(() => {
        /* 폴백: 기본 폰트로 표시 */
      });
    return {
      destroy() {
        try {
          document.fonts.delete(face);
        } catch {
          /* noop */
        }
      },
    };
  }

  let saving = $state(false);
  let busyId = $state<number | null>(null);
  let error = $state('');
  let form = $state<{
    mode: 'add' | 'edit';
    id: number | null;
    file: File | null;
    name: string;
    tagIds: number[];
  } | null>(null);
  let zoom = $state<{ url: string; name: string } | null>(null);
  let tagManagerOpen = $state(false);
  // 태그를 갖는 카테고리(오디오=BGM/효과음)에서만 태그 관리 노출
  const tagsCapable = $derived(meta.kind === 'audio');

  $effect(() => {
    void category;
    form = null;
    error = '';
  });

  function openAdd(): void {
    form = { mode: 'add', id: null, file: null, name: '', tagIds: [] };
    error = '';
  }
  function openEdit(a: CommonAssetView): void {
    form = { mode: 'edit', id: a.id, file: null, name: a.name, tagIds: a.tags.map((t) => t.tagId) };
    error = '';
  }
  function cancelForm(): void {
    form = null;
    error = '';
  }
  function onFormFile(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    if (!f || !form) return;
    form.file = f;
    if (!form.name.trim()) form.name = f.name.replace(/\.[^.]+$/, '');
  }
  async function saveForm(): Promise<void> {
    if (!form || saving) return;
    const f = form;
    if (f.mode === 'add' && !f.file) {
      error = '파일을 선택하세요.';
      return;
    }
    saving = true;
    error = '';
    // 축이 있는 카테고리(BGM/효과음)만 태그를 전송. 없으면 undefined(변경 없음)
    const tagIds = categoryAxes.length > 0 ? f.tagIds : undefined;
    try {
      if (f.mode === 'add' && f.file) {
        await marketingAssetsService.uploadAsset(category, f.name, f.file, tagIds);
      } else if (f.mode === 'edit' && f.id !== null) {
        await marketingAssetsService.updateAsset(f.id, { name: f.name, tagIds });
      }
      await invalidateAll();
      form = null;
    } catch (e) {
      error = e instanceof Error ? e.message : '저장에 실패했습니다.';
    } finally {
      saving = false;
    }
  }
  async function remove(id: number): Promise<void> {
    if (busyId !== null) return;
    busyId = id;
    error = '';
    try {
      await marketingAssetsService.removeAsset(id);
      if (form?.id === id) form = null;
      await invalidateAll();
    } catch (e) {
      error = e instanceof Error ? e.message : '삭제에 실패했습니다.';
    } finally {
      busyId = null;
    }
  }
</script>

<section class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-sm text-fg-subtle">{meta.desc}</p>
    {#if canManage}
      <div class="flex items-center gap-1.5">
        {#if tagsCapable}
          <button
            type="button"
            onclick={() => (tagManagerOpen = true)}
            class="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z" /><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" /></svg>
            태그 관리
          </button>
        {/if}
        <button
          type="button"
          onclick={openAdd}
          class="inline-flex items-center gap-1 rounded-lg bg-fg px-3 py-1.5 text-xs font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          추가
        </button>
      </div>
    {/if}
  </div>

  {#if error && !form}
    <p class="text-sm text-danger-fg" role="alert">{error}</p>
  {/if}

  {#if current.length === 0}
    <div class="flex min-h-[14rem] items-center justify-center">
      <p class="rounded-lg border border-dashed border-line px-6 py-8 text-center text-sm text-fg-subtle">
        아직 등록된 {meta.label} 이(가) 없습니다.
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-5">
      {#each groups as g (g.key)}
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium {g.badge}">{g.label}</span>
            <span class="text-xs text-fg-subtle">{g.items.length}</span>
          </div>
          {#if meta.kind === 'audio'}
            <ul class="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] content-start gap-3">
              {#each g.items as a (a.id)}
                {@render audioItem(a)}
              {/each}
            </ul>
          {:else if meta.kind === 'font'}
            <ul class="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] content-start gap-3">
              {#each g.items as a (a.id)}
                {@render fontItem(a)}
              {/each}
            </ul>
          {:else}
            <div class="grid grid-cols-[repeat(auto-fill,8rem)] content-start gap-3">
              {#each g.items as a (a.id)}
                {@render imageItem(a)}
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<!-- 자산 아이템 스니펫: 공통/우리 조직 두 그룹에서 재사용(스코프 뱃지는 그룹 헤더가 대체) -->
{#snippet audioItem(a: CommonAssetView)}
  <li class="flex flex-col gap-1.5 rounded-lg border border-line bg-elevated px-3 py-2">
    <div class="flex items-center gap-3">
      <span class="min-w-0 flex-1 truncate text-sm text-fg" title={a.name}>{a.name}</span>
      {#if manageable(a)}
        <button type="button" onclick={() => openEdit(a)} aria-label={`${a.name} 편집`} title="편집" class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle transition hover:bg-hover hover:text-fg">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
        <button type="button" onclick={() => remove(a.id)} disabled={busyId === a.id} aria-label={`${a.name} 삭제`} title="삭제" class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle transition hover:bg-danger-bg hover:text-danger-fg disabled:opacity-40">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      {/if}
    </div>
    <AudioPlayer src={a.url} />
    {#if a.tags.length > 0}
      <!-- 태그 칩: 우리 조직(accent) / 공통(muted) 색으로 출처 구분(그룹 헤더 뱃지와 동일 규약) -->
      <div class="flex flex-wrap gap-1">
        {#each a.tags as t (t.tagId)}
          <span
            class="rounded-md px-1.5 py-0.5 text-[10px] {t.scope === 'organization'
              ? 'bg-accent-bg font-medium text-accent-fg'
              : 'border border-line text-fg-subtle'}"
            title={t.scope === 'organization' ? '우리 조직 태그' : '공통 태그'}
          >{t.label}</span>
        {/each}
      </div>
    {/if}
  </li>
{/snippet}

{#snippet fontItem(a: CommonAssetView)}
  <li class="flex flex-col gap-1.5 rounded-lg border border-line bg-elevated px-3 py-2">
    <div class="flex items-center gap-3">
      <span class="min-w-0 flex-1 truncate text-sm text-fg" title={a.name}>{a.name}</span>
      {#if manageable(a)}
        <button type="button" onclick={() => openEdit(a)} aria-label={`${a.name} 편집`} title="편집" class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle transition hover:bg-hover hover:text-fg">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
        <button type="button" onclick={() => remove(a.id)} disabled={busyId === a.id} aria-label={`${a.name} 삭제`} title="삭제" class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle transition hover:bg-danger-bg hover:text-danger-fg disabled:opacity-40">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      {/if}
    </div>
    <!-- 글꼴 미리보기(제목/자막에 쓰일 모양). 로드 실패 시 기본 폰트 -->
    <div use:fontPreview={{ url: a.url, id: a.id }} class="truncate rounded bg-surface px-2 py-1.5 text-lg text-fg" title="글꼴 미리보기">
      가나다 AaBb 123
    </div>
  </li>
{/snippet}

{#snippet imageItem(a: CommonAssetView)}
  <figure class="group relative flex flex-col gap-1">
    <div class="relative aspect-square overflow-hidden rounded-lg border border-line" style="background:repeating-conic-gradient(#eceef1 0 25%, #fff 0 50%) 50% / 16px 16px">
      <img src={a.url} alt={a.name} class="h-full w-full object-contain" loading="lazy" />
      <button type="button" onclick={() => (zoom = { url: a.url, name: a.name })} aria-label={`${a.name} 확대`} class="absolute inset-0 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30"></button>
      {#if manageable(a)}
        <div class="absolute right-1 top-1 z-10 hidden items-center gap-1 group-hover:flex">
          <button type="button" onclick={() => openEdit(a)} aria-label={`${a.name} 편집`} title="편집" class="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
          <button type="button" onclick={() => remove(a.id)} disabled={busyId === a.id} aria-label={`${a.name} 삭제`} title="삭제" class="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 disabled:opacity-40">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      {/if}
    </div>
    <figcaption class="truncate text-[11px] text-fg-subtle" title={a.name}>{a.name}</figcaption>
  </figure>
{/snippet}

<!-- 추가/편집 모달 -->
{#if form}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button type="button" onclick={cancelForm} aria-label="닫기" class="absolute inset-0 bg-black/50"></button>
    <div class="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-2xl">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-fg">
          {form.mode === 'add' ? `새 ${meta.label} 추가` : `${meta.label} 편집`}
        </h3>
        <button type="button" onclick={cancelForm} aria-label="닫기" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-subtle transition hover:bg-hover hover:text-fg">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      {#if form.mode === 'add'}
        <label class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-elevated px-3 py-2 text-sm text-fg-subtle transition hover:bg-hover">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
          </svg>
          <span class="truncate">{form.file ? form.file.name : `${meta.label} 파일 선택`}</span>
          <input type="file" accept={meta.accept} class="hidden" onchange={onFormFile} />
        </label>
      {/if}

      <div>
        <label for="ma-name" class="mb-1 block text-xs font-medium text-fg-subtle">이름</label>
        <input
          id="ma-name"
          bind:value={form.name}
          placeholder="예: 잔잔한 피아노 BGM"
          class="w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
        />
      </div>

      {#if categoryAxes.length > 0}
        <div class="flex flex-col gap-3 border-t border-line pt-3">
          {#each categoryAxes as ax (ax.id)}
            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-fg">{ax.label}</span>
              <TagSelect tags={ax.tags} bind:selected={form.tagIds} disabled={saving} />
            </div>
          {/each}
          <p class="text-[11px] text-fg-subtle">필요한 태그가 없으면 상단 '태그 관리' 에서 우리 조직 태그를 추가하세요.</p>
        </div>
      {/if}

      {#if error}
        <p class="text-sm text-danger-fg" role="alert">{error}</p>
      {/if}

      <div class="flex justify-end gap-2">
        <button type="button" onclick={cancelForm} disabled={saving} class="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-hover disabled:opacity-50">취소</button>
        <button type="button" onclick={saveForm} disabled={saving || (form.mode === 'add' && !form.file)} class="rounded-lg bg-fg px-3 py-1.5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if zoom}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
    <button type="button" onclick={() => (zoom = null)} aria-label="확대 닫기" class="absolute inset-0 cursor-zoom-out bg-black/80"></button>
    <img src={zoom.url} alt={zoom.name} class="pointer-events-none relative max-h-full max-w-full rounded object-contain shadow-2xl" style="background:repeating-conic-gradient(#eceef1 0 25%, #fff 0 50%) 50% / 24px 24px" />
    <button type="button" onclick={() => (zoom = null)} aria-label="닫기" class="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </div>
{/if}

{#if tagManagerOpen}
  <TagCatalogManager {category} {axes} onClose={() => (tagManagerOpen = false)} />
{/if}

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    if (zoom) zoom = null;
    else if (form) cancelForm();
  }}
/>

<script lang="ts">
  // marketing-video 공통 에셋 풀(단일 카테고리): 업로드/편집(이름)/삭제. AI 가 영상에 자동 삽입하는 자산
  //   탭 전환은 상위 라이브러리(MarketingVideoSettings)가 담당: 여기선 넘겨받은 category 하나만 렌더
  //   추가/편집은 모달, 이미지 클릭 시 확대. 추가/수정/삭제 후 invalidateAll()
  import { invalidateAll } from '$app/navigation';
  import { commonAssetsService } from '$lib/features/common-assets/services/commonAssets.service';
  import {
    COMMON_ASSET_CATEGORY_META,
    type AssetAxisView,
    type CommonAsset,
    type CommonAssetCategory,
  } from '$lib/features/common-assets/types';
  import AudioPlayer from './AudioPlayer.svelte';
  import TagSelect from './TagSelect.svelte';
  import TagCatalogManager from './TagCatalogManager.svelte';

  interface Props {
    category: CommonAssetCategory;
    commonAssets: CommonAsset[];
    axes?: AssetAxisView[];
  }
  let { category, commonAssets, axes = [] }: Props = $props();

  const meta = $derived(COMMON_ASSET_CATEGORY_META[category]);
  const current = $derived(commonAssets.filter((a) => a.category === category));
  // 이 카테고리의 활성 축 + 각 축의 활성 태그(카탈로그, SSR 로드분)
  const categoryAxes = $derived(
    axes
      .filter((ax) => ax.category === category && ax.isActive)
      .map((ax) => ({ ...ax, tags: ax.tags.filter((t) => t.isActive) })),
  );

  let saving = $state(false);
  let busyId = $state<number | null>(null);
  let error = $state('');

  // 추가/편집 폼(모달). add=파일+이름+태그, edit=이름+태그(대상 id)
  let form = $state<{
    mode: 'add' | 'edit';
    id: number | null;
    file: File | null;
    name: string;
    tagIds: number[];
  } | null>(null);
  // 이미지 확대(라이트박스)
  let zoom = $state<{ url: string; name: string } | null>(null);
  let tagManagerOpen = $state(false);
  // 태그를 갖는 카테고리(오디오=BGM/효과음)에서만 태그 관리 노출
  const tagsCapable = $derived(meta.kind === 'audio');

  // 폰트 미리보기: 업로드한 글꼴을 FontFace 로 로드해 샘플 텍스트에 적용(로드 실패 시 기본 폰트로 폴백)
  function fontPreview(node: HTMLElement, param: { url: string; id: number }) {
    const family = `cta-font-${param.id}`;
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

  // 카테고리 전환 시 열린 폼/에러 초기화
  $effect(() => {
    void category;
    form = null;
    error = '';
  });

  function openAdd(): void {
    form = { mode: 'add', id: null, file: null, name: '', tagIds: [] };
    error = '';
  }
  function openEdit(a: CommonAsset): void {
    form = { mode: 'edit', id: a.id, file: null, name: a.name, tagIds: (a.tags ?? []).map((t) => t.tagId) };
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
        await commonAssetsService.upload(category, f.name, f.file, tagIds);
      } else if (f.mode === 'edit' && f.id !== null) {
        await commonAssetsService.update(f.id, { name: f.name, tagIds });
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
      await commonAssetsService.remove(id);
      if (form?.id === id) form = null;
      await invalidateAll();
    } catch (e) {
      error = e instanceof Error ? e.message : '삭제에 실패했습니다.';
    } finally {
      busyId = null;
    }
  }
</script>

<section class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-sm text-gray-500">{meta.desc}</p>
    <div class="flex items-center gap-1.5">
      {#if tagsCapable}
        <button
          type="button"
          onclick={() => (tagManagerOpen = true)}
          class="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z" /><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" /></svg>
          태그 관리
        </button>
      {/if}
      <button
        type="button"
        onclick={openAdd}
        class="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        추가
      </button>
    </div>
  </div>

  {#if error && !form}
    <p class="text-sm text-red-600">{error}</p>
  {/if}

  <!-- 목록 -->
  {#if current.length === 0}
    <div class="flex min-h-[14rem] items-center justify-center">
      <p class="rounded-lg border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
        아직 추가한 항목이 없습니다.
      </p>
    </div>
  {:else if meta.kind === 'audio'}
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] content-start gap-3">
      {#each current as a (a.id)}
        <li class="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <div class="flex items-center gap-2">
            <svg class="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            <span class="min-w-0 flex-1 truncate text-sm text-gray-800" title={a.name}>{a.name}</span>
            <button type="button" onclick={() => openEdit(a)} aria-label={`${a.name} 편집`} title="편집" class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
            <button type="button" onclick={() => remove(a.id)} disabled={busyId === a.id} aria-label={`${a.name} 삭제`} title="삭제" class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:opacity-40">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <AudioPlayer src={a.accessUrl} />
          {#if (a.tags ?? []).length > 0}
            <!-- 태그 칩: 우리 조직(brand) / 공통(muted) 색으로 출처 구분(플랫폼 관리는 보통 공통만) -->
            <div class="flex flex-wrap gap-1">
              {#each a.tags ?? [] as t (t.tagId)}
                <span
                  class="rounded-md px-1.5 py-0.5 text-[10px] {t.scope === 'organization'
                    ? 'bg-brand/10 font-medium text-brand'
                    : 'border border-gray-200 text-gray-500'}"
                  title={t.scope === 'organization' ? '우리 조직 태그' : '공통 태그'}
                >{t.label}</span>
              {/each}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if meta.kind === 'font'}
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] content-start gap-3">
      {#each current as a (a.id)}
        <li class="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-sm text-gray-800" title={a.name}>{a.name}</span>
            <button type="button" onclick={() => openEdit(a)} aria-label={`${a.name} 편집`} title="편집" class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
            <button type="button" onclick={() => remove(a.id)} disabled={busyId === a.id} aria-label={`${a.name} 삭제`} title="삭제" class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:opacity-40">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <!-- 글꼴 미리보기(제목/자막에 쓰일 모양). 로드 실패 시 기본 폰트 -->
          <div use:fontPreview={{ url: a.accessUrl, id: a.id }} class="truncate rounded bg-gray-50 px-2 py-1.5 text-lg text-gray-800" title="글꼴 미리보기">
            가나다 AaBb 123
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="grid grid-cols-[repeat(auto-fill,8rem)] content-start gap-3">
      {#each current as a (a.id)}
        <figure class="group relative flex flex-col gap-1">
          <div class="relative aspect-square overflow-hidden rounded-lg border border-gray-200" style="background:repeating-conic-gradient(#eceef1 0 25%, #fff 0 50%) 50% / 16px 16px">
            <img src={a.accessUrl} alt={a.name} class="h-full w-full object-contain" loading="lazy" />
            <button type="button" onclick={() => (zoom = { url: a.accessUrl, name: a.name })} aria-label={`${a.name} 확대`} class="absolute inset-0 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"></button>
            <div class="absolute right-1 top-1 z-10 hidden items-center gap-1 group-hover:flex">
              <button type="button" onclick={() => openEdit(a)} aria-label={`${a.name} 편집`} title="편집" class="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
              <button type="button" onclick={() => remove(a.id)} disabled={busyId === a.id} aria-label={`${a.name} 삭제`} title="삭제" class="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </div>
          <figcaption class="truncate text-[11px] text-gray-500" title={a.name}>{a.name}</figcaption>
        </figure>
      {/each}
    </div>
  {/if}
</section>

<!-- 추가/편집 모달 -->
{#if form}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button type="button" onclick={cancelForm} aria-label="닫기" class="absolute inset-0 bg-black/50"></button>
    <div class="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-gray-700">
          {form.mode === 'add' ? `새 ${meta.label} 추가` : `${meta.label} 편집`}
        </h3>
        <button type="button" onclick={cancelForm} aria-label="닫기" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      {#if form.mode === 'add'}
        <label class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100">
          <svg class="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
          </svg>
          <span class="truncate">{form.file ? form.file.name : `${meta.label} 파일 선택`}</span>
          <input type="file" accept={meta.accept} class="hidden" onchange={onFormFile} />
        </label>
      {/if}

      <div>
        <label for="ca-name" class="mb-1 block text-xs font-medium text-gray-600">이름</label>
        <input
          id="ca-name"
          bind:value={form.name}
          placeholder="예: 잔잔한 피아노 BGM"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {#if categoryAxes.length > 0}
        <div class="flex flex-col gap-3 border-t border-gray-200 pt-3">
          {#each categoryAxes as ax (ax.id)}
            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-gray-700">{ax.label}</span>
              <TagSelect tags={ax.tags} bind:selected={form.tagIds} disabled={saving} />
            </div>
          {/each}
          <p class="text-[11px] text-gray-400">태그 선택지는 상단 '태그 관리' 에서 추가/편집합니다.</p>
        </div>
      {/if}

      {#if error}
        <p class="text-sm text-red-600">{error}</p>
      {/if}

      <div class="flex justify-end gap-2">
        <button type="button" onclick={cancelForm} disabled={saving} class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">취소</button>
        <button type="button" onclick={saveForm} disabled={saving || (form.mode === 'add' && !form.file)} class="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50">
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
    <button type="button" onclick={() => (zoom = null)} aria-label="닫기" class="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
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

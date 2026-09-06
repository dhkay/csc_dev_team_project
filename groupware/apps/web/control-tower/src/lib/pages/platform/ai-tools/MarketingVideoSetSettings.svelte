<script lang="ts">
  // 에셋 세트 관리(자기완결): 배경프레임(이미지) + 아웃트로(mp4)를 세트가 직접 소유
  //   생성은 모달에서 이름 + 프레임 + 아웃트로를 메모리에 스테이징 후 한 번에 생성/업로드
  //   편집(이름/슬롯 교체, 비우기/삭제)은 별도 모달에서 즉시 반영. 변경 후 invalidateAll() 로 SSR 재로드
  import { invalidateAll } from '$app/navigation';
  import { assetSetsService } from '$lib/features/asset-sets/services/assetSets.service';
  import {
    SET_SLOTS,
    SET_SLOT_META,
    type AssetSet,
    type SetSlot,
    type SetOverlays,
    type TextOverlayStyle,
  } from '$lib/features/asset-sets/types';
  import type { CommonAsset } from '$lib/features/common-assets/types';

  interface Props {
    assetSets: AssetSet[];
    // 폰트 드롭다운용 공통 에셋(FONT 만 사용)
    commonAssets: CommonAsset[];
  }
  let { assetSets, commonAssets }: Props = $props();

  const CHECKER = 'background:repeating-conic-gradient(#eceef1 0 25%, #fff 0 50%) 50% / 12px 12px';

  // 구역별 오버레이 스타일(타이틀/하단자막): 배경색 + 폰트
  const fonts = $derived(commonAssets.filter((a) => a.category === 'FONT'));
  function fontUrl(uploadId: string): string | null {
    return uploadId ? (fonts.find((f) => f.uploadId === uploadId)?.accessUrl ?? null) : null;
  }
  /** 미리보기 텍스트 외곽선(최종 렌더의 ASS 외곽선 모사): 어떤 글자색도 배경 위에서 읽히게 */
  const TEXT_OUTLINE = '-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000';

  /** 구역 편집 폼(배경 사용/배경색/글자색/폰트 uploadId) */
  interface RegionForm {
    bgOn: boolean;
    bgColor: string;
    textColor: string;
    fontUploadId: string;
  }
  // 기본값 = 렌더 기본(defaultFinalOverlays)과 일치: 제목은 외곽선(배경 off), 자막은 검정 밴드(배경 on). 글자색 흰색
  const defaultTitleRegion = (): RegionForm => ({ bgOn: false, bgColor: '#000000', textColor: '#ffffff', fontUploadId: '' });
  const defaultSubRegion = (): RegionForm => ({ bgOn: true, bgColor: '#000000', textColor: '#ffffff', fontUploadId: '' });

  function regionToStyle(r: RegionForm): TextOverlayStyle {
    // 밴드 = 구역 뒷배경 직사각형(색만 지정, 기하는 렌더러 기본: 완성 영상에서 리사이즈)
    return {
      fontUploadId: r.fontUploadId || null,
      color: r.textColor,
      band: r.bgOn ? { color: r.bgColor } : null,
    };
  }
  function overlaysFromForms(title: RegionForm, sub: RegionForm): SetOverlays {
    return { title: regionToStyle(title), subtitle: regionToStyle(sub) };
  }
  function styleToRegion(s: TextOverlayStyle | undefined | null, fallback: () => RegionForm): RegionForm {
    if (!s) return fallback();
    const band = s.band ?? null;
    return {
      bgOn: !!band,
      bgColor: band?.color ?? '#000000',
      textColor: s.color ?? '#ffffff',
      fontUploadId: s.fontUploadId ?? '',
    };
  }

  /** 선택 폰트를 로드해 미리보기 노드에 적용(FontFace). param 변경 시 재로드 */
  function fontPreview(node: HTMLElement, param: { url: string | null; key: string }) {
    let applied = '';
    function apply(p: { url: string | null; key: string }) {
      if (!p.url) {
        node.style.fontFamily = '';
        applied = '';
        return;
      }
      const family = `set-font-${p.key}`;
      if (family === applied) return;
      applied = family;
      new FontFace(family, `url("${p.url}")`)
        .load()
        .then((f) => {
          document.fonts.add(f);
          node.style.fontFamily = `"${family}", sans-serif`;
        })
        .catch(() => {});
    }
    apply(param);
    return { update: apply };
  }

  let error = $state('');
  let busy = $state(false);

  // 생성 모달: 이름 + 스테이징된 프레임/아웃트로 파일(제출 시 한 번에 생성/업로드). 미리보기는 objectURL.
  let createOpen = $state(false);
  let cName = $state('');
  let cFrame = $state<File | null>(null);
  let cOutro = $state<File | null>(null);
  let cFrameUrl = $state<string | null>(null);
  let cOutroUrl = $state<string | null>(null);
  let cTitle = $state<RegionForm>(defaultTitleRegion());
  let cSub = $state<RegionForm>(defaultSubRegion());

  // 편집 모달: 세트 id(신선한 데이터는 assetSets 에서 파생). 이름/스타일은 로컬 폼
  let editingId = $state<number | null>(null);
  const editingSet = $derived(assetSets.find((s) => s.id === editingId) ?? null);
  let editName = $state('');
  let eTitle = $state<RegionForm>(defaultTitleRegion());
  let eSub = $state<RegionForm>(defaultSubRegion());

  function slotUrl(set: AssetSet, slot: SetSlot): string | null {
    return slot === 'frame' ? set.frameUrl : set.outroUrl;
  }
  function slotCount(set: AssetSet): number {
    return SET_SLOTS.filter((s) => slotUrl(set, s)).length;
  }

  async function run(fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
      await invalidateAll();
    } catch (e) {
      error = e instanceof Error ? e.message : '처리에 실패했습니다.';
    } finally {
      busy = false;
    }
  }

  // 생성 모달
  function revoke(url: string | null): void {
    if (url) URL.revokeObjectURL(url);
  }
  function stageError(slot: SetSlot, file: File): string | null {
    const m = SET_SLOT_META[slot];
    if (file.size > m.maxBytes) return `파일이 너무 큽니다(최대 ${Math.round(m.maxBytes / 1024 / 1024)}MB).`;
    if (file.type && !file.type.startsWith(`${m.kind}/`)) {
      return `${m.kind === 'video' ? '영상' : '이미지'} 파일만 올릴 수 있습니다.`;
    }
    return null;
  }
  function openCreate(): void {
    closeCreate();
    createOpen = true;
    error = '';
  }
  function closeCreate(): void {
    createOpen = false;
    revoke(cFrameUrl);
    revoke(cOutroUrl);
    cName = '';
    cFrame = null;
    cOutro = null;
    cFrameUrl = null;
    cOutroUrl = null;
    cTitle = defaultTitleRegion();
    cSub = defaultSubRegion();
  }
  function pickCreate(e: Event, slot: SetSlot): void {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    if (!f) return;
    const invalid = stageError(slot, f);
    if (invalid) {
      error = invalid;
      return;
    }
    error = '';
    const url = URL.createObjectURL(f);
    if (slot === 'frame') {
      revoke(cFrameUrl);
      cFrame = f;
      cFrameUrl = url;
    } else {
      revoke(cOutroUrl);
      cOutro = f;
      cOutroUrl = url;
    }
  }
  function clearCreateSlot(slot: SetSlot): void {
    if (slot === 'frame') {
      revoke(cFrameUrl);
      cFrame = null;
      cFrameUrl = null;
    } else {
      revoke(cOutroUrl);
      cOutro = null;
      cOutroUrl = null;
    }
  }
  async function submitCreate(): Promise<void> {
    if (!cName.trim()) {
      error = '세트 이름을 입력하세요.';
      return;
    }
    await run(() =>
      assetSetsService.create(
        { name: cName.trim(), overlays: overlaysFromForms(cTitle, cSub) },
        cFrame,
        cOutro,
      ),
    );
    if (!error) closeCreate();
  }
  // 언마운트 시 스테이징 objectURL 정리(모달 열린 채 탭 전환 대비)
  $effect(() => () => {
    revoke(cFrameUrl);
    revoke(cOutroUrl);
  });

  // 편집 모달
  function openEdit(set: AssetSet): void {
    editingId = set.id;
    editName = set.name;
    eTitle = styleToRegion(set.overlays?.title, defaultTitleRegion);
    eSub = styleToRegion(set.overlays?.subtitle, defaultSubRegion);
    error = '';
  }
  function closeEdit(): void {
    editingId = null;
    error = '';
  }
  async function saveName(): Promise<void> {
    if (editingId === null) return;
    const id = editingId;
    await run(() => assetSetsService.update(id, { name: editName }));
  }
  async function saveStyle(): Promise<void> {
    if (editingId === null) return;
    const id = editingId;
    await run(() => assetSetsService.update(id, { overlays: overlaysFromForms(eTitle, eSub) }));
  }
  async function deleteSet(id: number): Promise<void> {
    await run(() => assetSetsService.remove(id));
    if (editingId === id) editingId = null;
  }
  function onSlotFile(e: Event, setId: number, slot: SetSlot): void {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    if (!f) return;
    void run(() => assetSetsService.uploadSlot(setId, slot, f));
  }
  async function clearSlot(setId: number, slot: SetSlot): Promise<void> {
    await run(() => assetSetsService.clearSlot(setId, slot));
  }

  function cStaged(slot: SetSlot): { file: File | null; url: string | null } {
    return slot === 'frame' ? { file: cFrame, url: cFrameUrl } : { file: cOutro, url: cOutroUrl };
  }
</script>

<!-- 구역 스타일 편집기(타이틀/하단자막 공용): 배경 사용 토글 + 배경색 + 폰트 + 미리보기 -->
{#snippet regionEditor(region: RegionForm, label: string)}
  <div class="rounded-lg border border-gray-200 p-3">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-gray-700">{label}</span>
      <label class="flex items-center gap-1.5 text-xs text-gray-500">
        <input type="checkbox" bind:checked={region.bgOn} class="h-3.5 w-3.5 rounded border-gray-300 text-brand focus:ring-brand/30" />
        배경 사용
      </label>
    </div>
    <div class="flex items-end gap-3">
      <label class="flex flex-col gap-1 text-xs text-gray-600">
        글자색
        <input type="color" bind:value={region.textColor} class="h-8 w-10 cursor-pointer rounded border border-gray-300" />
      </label>
      {#if region.bgOn}
        <label class="flex flex-col gap-1 text-xs text-gray-600">
          배경색
          <input type="color" bind:value={region.bgColor} class="h-8 w-10 cursor-pointer rounded border border-gray-300" />
        </label>
      {/if}
      <label class="min-w-0 flex-1 text-xs text-gray-600">
        <span class="mb-1 block">폰트</span>
        <select bind:value={region.fontUploadId} class="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30">
          <option value="">기본 폰트</option>
          {#each fonts as f (f.id)}
            <option value={f.uploadId}>{f.name}</option>
          {/each}
        </select>
      </label>
    </div>
    <!-- 미리보기: 배경 직사각형이 텍스트 폭에 맞춰 조금 크게(기본 반응형). 완성 영상에서 크기 조정 가능 -->
    <div class="mt-2 rounded border border-gray-100 bg-gray-50 p-2 text-center">
      <p
        class="inline-block text-base leading-relaxed"
        style="color:{region.textColor};text-shadow:{TEXT_OUTLINE};{region.bgOn
          ? `background:${region.bgColor};padding:4px 12px;border-radius:4px`
          : ''}"
        use:fontPreview={{ url: fontUrl(region.fontUploadId), key: region.fontUploadId || 'none' }}
      >
        가나다 AaBb 123
      </p>
    </div>
  </div>
{/snippet}

<section class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-gray-500">배경프레임 + 아웃트로(mp4)를 묶은 세트. 사용자가 영상 제작 마지막에 직접 선택합니다.</span>
    </div>
    <button
      type="button"
      onclick={openCreate}
      class="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
    >
      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      세트 추가
    </button>
  </div>

  {#if error && editingId === null && !createOpen}
    <p class="text-sm text-red-600">{error}</p>
  {/if}

  {#if assetSets.length === 0}
    <div class="flex min-h-[14rem] items-center justify-center">
      <p class="rounded-lg border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
        아직 세트가 없습니다. '세트 추가'로 만들어 보세요.
      </p>
    </div>
  {:else}
    <div class="grid gap-3 sm:grid-cols-2">
      {#each assetSets as set (set.id)}
        <div class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="flex items-start gap-3">
            <div class="h-14 w-14 shrink-0 overflow-hidden rounded border border-gray-200" style={CHECKER}>
              {#if set.frameUrl}
                <img src={set.frameUrl} alt="" class="h-full w-full object-contain" loading="lazy" />
              {/if}
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-gray-900" title={set.name}>{set.name}</p>
              <p class="text-xs text-gray-400">{slotCount(set)}/{SET_SLOTS.length} 슬롯</p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button type="button" onclick={() => openEdit(set)} class="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">편집</button>
              <button type="button" onclick={() => deleteSet(set.id)} disabled={busy} aria-label={`${set.name} 삭제`} title="삭제" class="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </div>
          <div class="mt-2 space-y-0.5 text-[11px]">
            {#each SET_SLOTS as slot (slot)}
              <div class="flex gap-1">
                <span class="shrink-0 text-gray-400">{SET_SLOT_META[slot].label}:</span>
                <span class="{slotUrl(set, slot) ? 'text-emerald-600' : 'text-gray-300'}">
                  {slotUrl(set, slot) ? '있음' : '없음'}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<!-- 세트 생성 모달: 이름 + 프레임/아웃트로 스테이징 후 한 번에 생성 -->
{#if createOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button type="button" onclick={closeCreate} aria-label="닫기" class="absolute inset-0 bg-black/50"></button>
    <div class="relative z-10 flex w-full max-w-lg flex-col gap-3 rounded-xl bg-white p-5 shadow-2xl">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-gray-700">세트 추가</h3>
        <button type="button" onclick={closeCreate} aria-label="닫기" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div>
        <label for="create-set-name" class="mb-1 block text-xs font-medium text-gray-600">세트 이름</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          id="create-set-name"
          bind:value={cName}
          onkeydown={(e) => { if (e.key === 'Enter') submitCreate(); }}
          placeholder="예: 브랜드A 키트"
          autofocus
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      <div class="space-y-3 border-t border-gray-100 pt-3">
        <p class="text-xs font-medium text-gray-600">슬롯 <span class="text-gray-400">(선택: 나중에 편집에서 추가 가능)</span></p>
        {#each SET_SLOTS as slot (slot)}
          {@const m = SET_SLOT_META[slot]}
          {@const staged = cStaged(slot)}
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 shrink-0 overflow-hidden rounded border border-gray-200" style={CHECKER}>
              {#if staged.url && m.kind === 'image'}
                <img src={staged.url} alt="" class="h-full w-full object-contain" />
              {:else if staged.url}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video src={staged.url} preload="metadata" class="h-full w-full bg-black object-contain"></video>
              {:else}
                <div class="flex h-full w-full items-center justify-center text-gray-300">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4h16v16H4z" /></svg>
                </div>
              {/if}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-700">{m.label}</p>
              <p class="truncate text-[11px] text-gray-400">{staged.file ? staged.file.name : m.desc}</p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <label class="cursor-pointer rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 {busy ? 'pointer-events-none opacity-50' : ''}">
                {staged.file ? '변경' : '선택'}
                <input type="file" accept={m.accept} class="hidden" onchange={(e) => pickCreate(e, slot)} disabled={busy} />
              </label>
              {#if staged.file}
                <button type="button" onclick={() => clearCreateSlot(slot)} disabled={busy} aria-label={`${m.label} 제거`} title="제거" class="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <div class="space-y-3 border-t border-gray-100 pt-3">
        <p class="text-xs font-medium text-gray-600">오버레이 스타일 <span class="text-gray-400">(최종 영상의 제목/자막 표현)</span></p>
        {@render regionEditor(cTitle, '타이틀')}
        {@render regionEditor(cSub, '하단자막')}
      </div>

      {#if error}
        <p class="text-sm text-red-600">{error}</p>
      {/if}

      <div class="flex justify-end gap-2 border-t border-gray-100 pt-3">
        <button type="button" onclick={closeCreate} disabled={busy} class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">취소</button>
        <button type="button" onclick={submitCreate} disabled={busy || !cName.trim()} class="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? '만드는 중…' : '만들기'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- 세트 편집 모달 -->
{#if editingSet}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button type="button" onclick={closeEdit} aria-label="닫기" class="absolute inset-0 bg-black/50"></button>
    <div class="relative z-10 flex w-full max-w-lg flex-col gap-3 rounded-xl bg-white p-5 shadow-2xl">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-gray-700">세트 편집</h3>
        <button type="button" onclick={closeEdit} aria-label="닫기" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div class="flex items-end gap-2">
        <div class="flex-1">
          <label for="set-name" class="mb-1 block text-xs font-medium text-gray-600">세트 이름</label>
          <input id="set-name" bind:value={editName} class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
        <button type="button" onclick={saveName} disabled={busy} class="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">이름 저장</button>
      </div>

      <!-- 슬롯(배경프레임/아웃트로): 파일 업로드/미리보기/비우기 -->
      <div class="space-y-3 border-t border-gray-100 pt-3">
        <p class="text-xs font-medium text-gray-600">슬롯</p>
        {#each SET_SLOTS as slot (slot)}
          {@const m = SET_SLOT_META[slot]}
          {@const url = slotUrl(editingSet, slot)}
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 shrink-0 overflow-hidden rounded border border-gray-200" style={CHECKER}>
              {#if url && m.kind === 'image'}
                <img src={url} alt="" class="h-full w-full object-contain" loading="lazy" />
              {:else if url}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video src={url} preload="metadata" class="h-full w-full bg-black object-contain"></video>
              {:else}
                <div class="flex h-full w-full items-center justify-center text-gray-300">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4h16v16H4z" /></svg>
                </div>
              {/if}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-700">{m.label} <span class="text-xs text-gray-400">{url ? '(등록됨)' : '(비어있음)'}</span></p>
              <p class="truncate text-[11px] text-gray-400">{m.desc}</p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <label class="cursor-pointer rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 {busy ? 'pointer-events-none opacity-50' : ''}">
                {url ? '교체' : '업로드'}
                <input type="file" accept={m.accept} class="hidden" onchange={(e) => onSlotFile(e, editingSet.id, slot)} disabled={busy} />
              </label>
              {#if url}
                <button type="button" onclick={() => clearSlot(editingSet.id, slot)} disabled={busy} aria-label={`${m.label} 비우기`} title="비우기" class="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- 오버레이 스타일(타이틀/하단자막): 배경색+폰트. 저장은 별도 버튼(슬롯과 달리 여러 필드 스테이징) -->
      <div class="space-y-3 border-t border-gray-100 pt-3">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium text-gray-600">오버레이 스타일 <span class="text-gray-400">(제목/자막 표현)</span></p>
          <button type="button" onclick={saveStyle} disabled={busy} class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">스타일 저장</button>
        </div>
        {@render regionEditor(eTitle, '타이틀')}
        {@render regionEditor(eSub, '하단자막')}
      </div>

      {#if error}
        <p class="text-sm text-red-600">{error}</p>
      {/if}

      <div class="flex justify-between border-t border-gray-100 pt-3">
        <button type="button" onclick={() => deleteSet(editingSet.id)} disabled={busy} class="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">세트 삭제</button>
        <button type="button" onclick={closeEdit} class="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90">완료</button>
      </div>
    </div>
  </div>
{/if}

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    if (createOpen) closeCreate();
    else if (editingId !== null) closeEdit();
  }}
/>

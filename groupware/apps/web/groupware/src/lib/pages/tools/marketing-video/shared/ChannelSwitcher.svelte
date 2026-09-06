<script lang="ts">
  // 앱바 채널 드롭다운: 앱바 타이틀("마케팅 영상 제작") 우측에 배치
  //  - 채널 선택 = URL 이동(/{org}/{tool}/{channelSlug}) → 서버가 현재 채널을 확정(워크스페이스/키워드/기획서가 이를 따름)
  //  - 채널 추가/편집(이름)/삭제를 이 드롭다운에서 전담. URL 은 이름에서 파생
  //  - 채널은 개인 소유다: 목록에 자기 것만 오고 관리 권한 게이트가 없다(자기 채널을 자기가 다룬다)
  //    마지막 채널 삭제는 백엔드가 400 으로 막는다(채널이 최소 하나는 있어야 한다)
  // 데이터: TanStack Query → marketingChannelsService → BFF(/api/marketing/channels) → csc-marketing.
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import { channelsKeys } from '$lib/features/marketing-channels/queries/channels.query';
  import type { Channel } from '$lib/features/marketing-channels/types';
  import { channelPathSlug } from '$lib/features/marketing-channels/slugify';
  import { workspaceBasePath } from '$lib/pages/tools/marketing-video/workspaceUrl';
  import { asVersionMode } from '$lib/shared/lib/versionMode/versionMode';

  const qc = useQueryClient();

  const channelsQuery = createQuery(() => svc.channelsQueryOptions());
  const channels = $derived(channelsQuery.data ?? []);

  // 현재 채널 = URL 의 channelSlug 로 확정(서버가 라우트에서 resolve). 드롭다운은 이를 표시/전환한다.
  const currentChannelId = $derived(
    channels.find((c) => channelPathSlug(c) === $page.params.channelSlug)?.id ?? null,
  );
  const currentChannel = $derived(channels.find((c) => c.id === currentChannelId) ?? null);
  // 표시 이름: 목록이 오기 전에는 서버가 확정해 내려준 이름을 쓴다(자리표시자 깜빡임 방지)
  //   채널 라우트 밖(도구 랜딩 = 채널 없음)에서는 둘 다 없어 '채널 선택'이 맞는 표시다.
  const currentName = $derived(
    currentChannel?.name ?? ($page.data.currentChannelName as string | undefined) ?? null,
  );
  // 도구 랜딩(버전 세그먼트 없음)으로 돌아갈 주소: 거기서 진입 버전 + 진입 채널을 다시 정한다.
  const toolUrl = $derived(`/${$page.params.orgSlug}/${$page.params.toolSlug}`);
  /**
   * 채널 전환 링크. 버전을 그대로 들고 간다: 채널을 옮겨도 보던 버전은 유지되어야 한다.
   * 버전이 채널보다 위 세그먼트라 여기 한 줄로 끝난다(채널 아래였다면 링크마다 이어붙여야 했다)
   * 버전 세그먼트가 없는 자리라면 도구 랜딩으로 보낸다(거기서 진입 버전과 채널을 정한다)
   */
  function channelUrl(ch: { name: string }): string {
    const { orgSlug = '', toolSlug = '' } = $page.params;
    const version = asVersionMode($page.params.version);
    if (!version) return toolUrl;
    return workspaceBasePath({ orgSlug, toolSlug, version, channelSlug: channelPathSlug(ch) });
  }

  const createMut = createMutation(() => svc.createChannelMutationOptions(qc));
  const updateMut = createMutation(() => svc.updateChannelMutationOptions(qc));
  const deleteMut = createMutation(() => svc.deleteChannelMutationOptions(qc));
  const reorderMut = createMutation(() => svc.reorderChannelMutationOptions(qc));
  // 진입 채널(개인): 도구에 들어왔을 때 먼저 열릴 채널. 무엇을 먼저 볼지는 각자의 작업 습관이라
  // 조직 공유가 아니라 본인에게만 적용된다.
  const myDefaultQuery = createQuery(() => svc.myDefaultChannelQueryOptions());
  const myDefaultId = $derived(myDefaultQuery.data ?? null);
  const setDefaultMut = createMutation(() => svc.setMyDefaultChannelMutationOptions(qc));

  /** 별 클릭: 지정 / 이미 내 진입 채널이면 해제(첫 채널로 돌아간다) */
  function toggleMyDefault(id: number): void {
    if (setDefaultMut.isPending) return;
    setDefaultMut.mutate(myDefaultId === id ? null : id);
  }

  let open = $state(false);
  let container = $state<HTMLElement | null>(null);

  // 드래그앤드롭 재정렬(본인 목록)
  // 드래그 중에는 채널 목록 캐시를 낙관적으로 재정렬(즉각 시각 피드백), 드롭 시 서버에 순서를 저장
  let draggingId = $state<number | null>(null);
  let dragStartOrder: number[] = [];

  function onDragStart(e: DragEvent, id: number): void {
    draggingId = id;
    dragStartOrder = channels.map((c) => c.id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(id));
    }
  }
  function onDragOver(e: DragEvent, overId: number): void {
    if (draggingId === null || draggingId === overId) return;
    e.preventDefault();
    // 대상 행의 중간선 기준으로 앞/뒤 삽입을 결정한다. 이렇게 하면 드래그 중 목록이
    // 되돌아가며 떨리는 오실레이션이 없어진다(단순 인덱스 교체는 커서 밑 항목이 바뀌며 진동)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    const cur = channels.map((c) => c.id);
    const from = cur.indexOf(draggingId);
    if (from < 0) return;
    const next = [...cur];
    next.splice(from, 1);
    const targetIdx = next.indexOf(overId);
    if (targetIdx < 0) return;
    const insertIdx = targetIdx + (after ? 1 : 0);
    next.splice(insertIdx, 0, draggingId);
    if (next.join(',') === cur.join(',')) return;
    const byId = new Map(channels.map((c) => [c.id, c]));
    qc.setQueryData<Channel[]>(
      channelsKeys.list(),
      next.map((id) => byId.get(id)!),
    );
  }
  function endDrag(): void {
    if (draggingId === null) return;
    draggingId = null;
    const now = channels.map((c) => c.id);
    // 실제로 순서가 바뀐 경우에만 저장
    if (now.join(',') !== dragStartOrder.join(',')) reorderMut.mutate(now);
  }

  // 추가 폼 상태
  let adding = $state(false);
  let addName = $state('');

  // 편집 폼 상태
  let editingId = $state<number | null>(null);
  let editName = $state('');

  let confirmDeleteId = $state<number | null>(null);

  const actionError = $derived.by(() => {
    const e = createMut.isError
      ? createMut.error
      : updateMut.isError
        ? updateMut.error
        : deleteMut.isError
          ? deleteMut.error
          : reorderMut.isError
            ? reorderMut.error
            : setDefaultMut.isError
              ? setDefaultMut.error
              : null;
    if (!e) return null;
    return e instanceof Error ? e.message : '작업에 실패했습니다.';
  });

  function resetForms(): void {
    adding = false;
    addName = '';
    editingId = null;
    confirmDeleteId = null;
  }
  function toggle(): void {
    open = !open;
    if (!open) resetForms();
  }
  function close(): void {
    open = false;
    resetForms();
  }

  // 바깥 클릭 시 닫기
  $effect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (container && !container.contains(e.target as Node)) close();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  });

  function selectChannel(ch: { id: number; name: string }): void {
    close();
    if (ch.id !== currentChannelId) void goto(channelUrl(ch));
  }

  function startAdd(): void {
    adding = true;
    editingId = null;
    addName = '';
  }
  function submitAdd(): void {
    const name = addName.trim();
    if (!name || createMut.isPending) return;
    createMut.mutate(
      { name },
      {
        onSuccess: (channel) => {
          // 새 채널로 이동(서버가 라우트에서 현재 채널로 확정)
          close();
          void goto(channelUrl(channel));
        }
      }
    );
  }

  function startEdit(id: number, name: string): void {
    editingId = id;
    editName = name;
    adding = false;
    confirmDeleteId = null;
  }
  function submitEdit(): void {
    const id = editingId;
    const name = editName.trim();
    if (id === null || !name || updateMut.isPending) return;
    const wasCurrent = id === currentChannelId;
    updateMut.mutate(
      { id, name },
      {
        onSuccess: (channel) => {
          editingId = null;
          // 현재 채널의 이름이 바뀌면 URL(이름 파생)도 새 경로로 맞춘다(같으면 no-op)
          if (wasCurrent) {
            close();
            void goto(channelUrl(channel));
          }
        }
      }
    );
  }
  function cancelEdit(): void {
    editingId = null;
  }

  function removeChannel(id: number): void {
    const wasCurrent = id === currentChannelId;
    deleteMut.mutate(id, {
      onSuccess: () => {
        // 현재 채널을 지웠으면 도구 랜딩으로(거기서 내 진입 채널/첫 채널로 재이동)
        if (wasCurrent) {
          close();
          void goto(toolUrl);
        }
      },
      onSettled: () => (confirmDeleteId = null)
    });
  }

  function onAddKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      adding = false;
    }
  }
  function onEditKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }
</script>

<div class="relative" bind:this={container}>
  <!-- 트리거: 현재 채널명 표시 -->
  <button
    type="button"
    onclick={toggle}
    aria-haspopup="menu"
    aria-expanded={open}
    class="flex max-w-[12rem] items-center gap-1 rounded-md border border-line bg-elevated px-2 py-1 text-sm text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
  >
    <svg class="h-3.5 w-3.5 shrink-0 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10 3 8 21M16 3l-2 18M3 9h18M3 15h18" />
    </svg>
    <span class="truncate">{currentName ?? '채널 선택'}</span>
    <svg class="h-4 w-4 shrink-0 text-fg-subtle transition {open ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>

  {#if open}
    <div
      role="menu"
      class="absolute left-0 top-full z-50 mt-1 flex max-h-[70vh] w-72 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
    >
      <div class="flex items-center justify-between px-3 py-2">
        <span class="text-xs font-medium text-fg-subtle">채널</span>
        <span class="text-xs text-fg-subtle">{channels.length}</span>
      </div>
      <div class="border-t border-line"></div>

      {#if actionError}
        <p class="px-3 py-1.5 text-xs text-danger-fg" role="alert">{actionError}</p>
      {/if}

      <!-- 채널 목록 -->
      <div class="min-h-0 flex-1 overflow-auto p-1">
        {#if channelsQuery.isPending}
          <p class="px-3 py-4 text-center text-sm text-fg-subtle">불러오는 중…</p>
        {:else if channelsQuery.isError}
          <p class="px-3 py-4 text-center text-sm text-danger-fg" role="alert">채널을 불러오지 못했습니다.</p>
        {:else if channels.length === 0}
          <p class="px-3 py-4 text-center text-sm text-fg-subtle">채널을 추가하세요.</p>
        {:else}
          {#each channels as ch (ch.id)}
            {#if editingId === ch.id}
              <!-- 편집 폼(이름) -->
              <div class="flex flex-col gap-1.5 rounded-lg bg-elevated p-2">
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  type="text"
                  bind:value={editName}
                  onkeydown={onEditKeydown}
                  autofocus
                  placeholder="채널 이름"
                  aria-label="채널 이름"
                  class="w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
                />
                <div class="flex justify-end gap-1">
                  <button type="button" onclick={cancelEdit} class="rounded-md px-2 py-1 text-xs text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25">취소</button>
                  <button type="button" onclick={submitEdit} disabled={!editName.trim() || updateMut.isPending} class="rounded-md bg-fg px-2 py-1 text-xs font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:opacity-50">저장</button>
                </div>
              </div>
            {:else}
              <div
                class="group flex items-center gap-1 rounded-lg px-1 transition {currentChannelId === ch.id
                  ? 'bg-accent-bg'
                  : 'hover:bg-hover'} {draggingId === ch.id ? 'opacity-50' : ''}"
                role="listitem"
                ondragover={(e) => onDragOver(e, ch.id)}
                ondrop={(e) => {
                  e.preventDefault();
                  endDrag();
                }}
              >
                  <!-- 드래그 핸들: 순서 변경(본인 목록) -->
                  <span
                    draggable="true"
                    ondragstart={(e) => onDragStart(e, ch.id)}
                    ondragend={endDrag}
                    class="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-fg-subtle/60 transition hover:text-fg-subtle active:cursor-grabbing"
                    title="드래그하여 순서 변경"
                    aria-hidden="true"
                  >
                    <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" /></svg>
                  </span>
                <button
                  type="button"
                  onclick={() => selectChannel(ch)}
                  role="menuitemradio"
                  aria-checked={currentChannelId === ch.id}
                  class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                >
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-1.5">
                      <span class="truncate {currentChannelId === ch.id ? 'font-medium' : ''}">{ch.name}</span>
                      {#if myDefaultId === ch.id}<span class="shrink-0 rounded-full bg-warning-bg px-1.5 py-0.5 text-[10px] font-medium leading-none text-warning-fg">진입</span>{/if}
                    </span>
                  </span>
                </button>
                  {#if confirmDeleteId === ch.id}
                    <button type="button" onclick={() => removeChannel(ch.id)} disabled={deleteMut.isPending} class="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-danger-fg transition hover:bg-danger-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-fg/40 disabled:opacity-50" aria-label={`${ch.name} 삭제 확인`}>삭제</button>
                    <button type="button" onclick={() => (confirmDeleteId = null)} class="shrink-0 rounded-md px-1.5 py-1 text-xs text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25" aria-label="삭제 취소">취소</button>
                  {:else}
                    <!-- 진입 채널(별): 내 진입 채널이면 채워진 노란 별(항상 표시), 아니면 hover 시 노출 -->
                    {@const isMine = myDefaultId === ch.id}
                    <button type="button" onclick={() => toggleMyDefault(ch.id)} disabled={setDefaultMut.isPending} aria-label={isMine ? `${ch.name} 진입 채널 해제` : `${ch.name} 을 진입 채널로`} title={isMine ? '내 진입 채널(눌러 해제)' : '들어올 때 이 채널부터 열기'} class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:cursor-default {isMine ? 'text-warning-fg' : 'text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-black/5 hover:text-fg focus-visible:opacity-100 dark:hover:bg-white/[0.08]'}">
                      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill={isMine ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.6-5 4.3 1.5 6.4L12 17l-5.9 3.3 1.5-6.4-5-4.3 6.6-.6z" /></svg>
                    </button>
                    <button type="button" onclick={() => startEdit(ch.id, ch.name)} aria-label={`${ch.name} 편집`} class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle opacity-0 transition group-hover:opacity-100 hover:bg-black/5 hover:text-fg focus:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-fg/25 dark:hover:bg-white/[0.08]">
                      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                    <button type="button" onclick={() => (confirmDeleteId = ch.id)} aria-label={`${ch.name} 삭제`} class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle opacity-0 transition group-hover:opacity-100 hover:bg-black/5 hover:text-fg focus:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-fg/25 dark:hover:bg-white/[0.08]">
                      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                    </button>
                  {/if}
              </div>
            {/if}
          {/each}
        {/if}
      </div>

        <div class="border-t border-line"></div>
        <!-- 채널 추가 -->
        {#if adding}
          <div class="flex flex-col gap-1.5 p-2">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            bind:value={addName}
            onkeydown={onAddKeydown}
            autofocus
            placeholder="채널 이름"
            aria-label="새 채널 이름"
            class="w-full rounded-md border border-line bg-elevated px-2 py-1 text-sm text-fg focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
          />
          <div class="flex justify-end gap-1">
            <button type="button" onclick={() => (adding = false)} class="rounded-md px-2 py-1 text-xs text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25">취소</button>
            <button type="button" onclick={submitAdd} disabled={!addName.trim() || createMut.isPending} class="rounded-md bg-fg px-2 py-1 text-xs font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:opacity-50">추가</button>
          </div>
        </div>
      {:else}
        <button type="button" onclick={startAdd} class="flex items-center gap-2 px-3 py-2.5 text-sm text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25">
          <svg class="h-4 w-4 shrink-0 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          채널 추가
        </button>
      {/if}
    </div>
  {/if}
</div>

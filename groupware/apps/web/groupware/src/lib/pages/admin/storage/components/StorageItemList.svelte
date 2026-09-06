<script lang="ts">
  // 파일 목록(표): 이름, 유형, 크기, 올린 사람, 수정한 날짜, 동작
  //
  // 사람 이름은 id 로 조인해 렌더 시점에 만든다. 이름을 레코드에 굳히면 개명이 과거 기록을
  // 낡게 만든다. 넓은 자리라 이메일을 함께 적는다(동명이인이 허용되므로)
  import { formatBytes, formatDate } from '$lib/features/storage/lib/bytes';
  import { FILE_KIND_LABEL, fileKindOf } from '$lib/features/storage/lib/mime';
  import { checkItemName, splitExtension } from '$lib/features/storage/lib/naming';
  import { canModifyFile, canRestoreFile } from '$lib/features/storage/lib/permissions';
  import { publicFileUrl } from '$lib/features/storage/lib/publicUrl';
  import { formatMemberLabel, type MemberIdentity } from '$lib/features/members/lib/roster';
  import type { StorageActor, StorageFile, StorageScope } from '$lib/features/storage/types';

  interface Props {
    files: readonly StorageFile[];
    actor: StorageActor;
    scope: StorageScope;
    trashed: boolean;
    pending: boolean;
    ownerOf: (id: number) => MemberIdentity;
    // 다운로드는 같은 origin 링크다(BFF 가 인가 후 서명 주소로 302). fetch 하지 않는다.
    downloadHref: (file: StorageFile) => string;
    onRename: (file: StorageFile, name: string) => void;
    onTrash: (file: StorageFile) => void;
    onRestore: (file: StorageFile) => void;
    onPurge: (file: StorageFile) => void;
  }
  let {
    files,
    actor,
    scope,
    trashed,
    pending,
    ownerOf,
    downloadHref,
    onRename,
    onTrash,
    onRestore,
    onPurge
  }: Props = $props();

  // 인라인 이름 변경: 편집 중인 파일 id 와 입력값
  let editingId = $state<string | null>(null);
  let draft = $state('');
  let draftError = $state('');

  function startRename(file: StorageFile): void {
    editingId = file.id;
    draft = file.fileName;
    draftError = '';
  }

  function commitRename(file: StorageFile): void {
    // Enter 로 커밋하면 입력이 사라지면서 blur 도 뒤따를 수 있다. 편집 중이 아니면 조용히 나간다.
    //   (그러지 않으면 같은 변경이 두 번 나간다)
    if (editingId !== file.id) return;
    const checked = checkItemName(draft);
    if (!checked.ok) {
      draftError = checked.reason;
      return;
    }
    editingId = null;
    draftError = '';
    if (checked.value !== file.fileName) onRename(file, checked.value);
  }

  function cancelRename(): void {
    editingId = null;
    draftError = '';
  }

  /** 편집 진입 시 확장자를 뺀 본문만 선택한다(드라이브 관용) */
  function selectBaseName(node: HTMLInputElement): void {
    node.focus();
    const { base } = splitExtension(node.value);
    node.setSelectionRange(0, base.length);
  }

  /**
   * 좁은 화면에서는 이름만 남기고 나머지 열을 접는다. 여섯 열을 그대로 두면 폰 폭에서 이름이
   * 몇 글자만 남는다. 접은 값은 사라지지 않고 이름 아래 한 줄로 다시 나온다.
   *
   * 접는 일을 조건부 렌더가 아니라 CSS(`hidden lg:table-cell`)로 하는 이유: 서버가 방향을 모르는
   * 채로 그려도 브라우저가 곧바로 맞는 배치를 잡고, 관리자 영역의 다른 화면과 같은 관용이 된다.
   */
  const columns = [
    { label: '이름', wide: false },
    { label: '유형', wide: true },
    { label: '크기', wide: true },
    { label: '올린 사람', wide: true },
    { label: '수정한 날짜', wide: true }
  ];
  /**
   * 공개 주소 복사. 공통 파일의 주소는 로그인 없이 열리므로 그대로 밖에 붙여 넣을 수 있다.
   *
   * 클립보드가 막힌 브라우저에서는 조용히 실패한다. 그때도 파일 이름 링크가 같은 주소를
   * 가리키므로 우클릭으로 복사할 수 있다(두 번째 길을 따로 만들지 않는다)
   */
  let copiedId = $state<string | null>(null);
  async function copyAddress(file: StorageFile): Promise<void> {
    try {
      await navigator.clipboard.writeText(publicFileUrl(window.location.origin, file.id));
      copiedId = file.id;
      setTimeout(() => (copiedId = null), 1500);
    } catch {
      copiedId = null;
    }
  }

  const WIDE_CELL = 'hidden lg:table-cell';
</script>

<table class="w-full table-auto text-left text-sm">
  <thead class="border-b border-line bg-elevated text-xs text-fg-subtle">
    <tr>
      {#each columns as column (column.label)}
        <th scope="col" class="px-4 py-2 font-medium {column.wide ? WIDE_CELL : ''}">
          {column.label}
        </th>
      {/each}
      <th scope="col" class="px-4 py-2 font-medium"><span class="sr-only">동작</span></th>
    </tr>
  </thead>
  <tbody class:opacity-60={pending}>
    {#each files as file (file.id)}
      {@const owner = file.ownerUserId === null ? null : ownerOf(file.ownerUserId)}
      {@const modify = canModifyFile(actor, scope, file)}
      {@const restore = canRestoreFile(actor, scope, file)}
      <tr class="border-b border-line/60 last:border-b-0 hover:bg-hover">
        <td class="max-w-0 px-4 py-2">
          {#if editingId === file.id}
            <input
              use:selectBaseName
              bind:value={draft}
              onkeydown={(e) => {
                if (e.key === 'Enter') commitRename(file);
                if (e.key === 'Escape') cancelRename();
              }}
              onblur={() => commitRename(file)}
              class="w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg focus:border-fg focus:outline-none"
            />
            {#if draftError}
              <p class="mt-1 text-xs text-danger-fg">{draftError}</p>
            {/if}
          {:else}
            <div class="flex min-w-0 items-center gap-1.5">
              <a
                href={downloadHref(file)}
                target="_blank"
                rel="noopener"
                class="min-w-0 truncate text-fg hover:underline"
                title={file.fileName}
              >
                {file.fileName}
              </a>
            </div>
            <!-- 접은 열을 한 줄로 되돌려 준다(좁은 화면 전용). 사람은 좁은 자리라 이름만 적고
                 이메일은 툴팁에 둔다(넓은 자리에만 이메일을 함께 적는다는 규칙) -->
            <p class="mt-0.5 truncate text-xs text-fg-subtle lg:hidden">
              {FILE_KIND_LABEL[fileKindOf(file.mimeType, file.fileName)]}
              · {formatBytes(file.size)}
              · <span title={owner ? formatMemberLabel(owner) : undefined}>
                {owner ? owner.name : '-'}
              </span>
              · {formatDate(trashed ? file.deletedAt : (file.updatedAt ?? file.createdAt))}
            </p>
          {/if}
        </td>
        <td class="whitespace-nowrap px-4 py-2 text-fg-subtle {WIDE_CELL}">
          {FILE_KIND_LABEL[fileKindOf(file.mimeType, file.fileName)]}
        </td>
        <td class="whitespace-nowrap px-4 py-2 text-fg-subtle {WIDE_CELL}">
          {formatBytes(file.size)}
        </td>
        <td class="max-w-0 truncate px-4 py-2 text-fg-subtle {WIDE_CELL}">
          {owner ? formatMemberLabel(owner) : '-'}
        </td>
        <td class="whitespace-nowrap px-4 py-2 text-fg-subtle {WIDE_CELL}">
          {formatDate(trashed ? file.deletedAt : (file.updatedAt ?? file.createdAt))}
        </td>
        <td class="px-4 py-2 text-right lg:whitespace-nowrap">
          <div class="flex flex-wrap items-center justify-end gap-1 lg:flex-nowrap">
            {#if trashed}
              <button
                type="button"
                class="rounded-md px-2 py-1 text-xs text-fg-subtle transition hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!restore.allowed}
                title={restore.reason}
                onclick={() => onRestore(file)}
              >
                복원
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-1 text-xs text-danger-fg transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!restore.allowed}
                title={restore.reason}
                onclick={() => onPurge(file)}
              >
                영구 삭제
              </button>
            {:else}
              <a
                href={downloadHref(file)}
                target="_blank"
                rel="noopener"
                class="rounded-md px-2 py-1 text-xs text-fg-subtle transition hover:bg-hover hover:text-fg"
              >
                다운로드
              </a>
              <button
                type="button"
                class="rounded-md px-2 py-1 text-xs text-fg-subtle transition hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!modify.allowed}
                title={modify.reason}
                onclick={() => startRename(file)}
              >
                이름 변경
              </button>
              <!-- 공통 파일의 주소는 로그인 없이 열린다. 그래서 "공유하기" 가 아니라 그냥
                   주소를 복사한다(다른 페이지에 이미지로 붙여 넣는 것이 이 버튼의 쓰임이다) -->
              {#if scope.area === 'COMMON'}
                <button
                  type="button"
                  class="rounded-md px-2 py-1 text-xs text-fg-subtle transition hover:bg-hover hover:text-fg"
                  onclick={() => copyAddress(file)}
                >
                  {copiedId === file.id ? '복사됨' : '주소 복사'}
                </button>
              {/if}
              <button
                type="button"
                class="rounded-md px-2 py-1 text-xs text-danger-fg transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!modify.allowed}
                title={modify.reason}
                onclick={() => onTrash(file)}
              >
                삭제
              </button>
            {/if}
          </div>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

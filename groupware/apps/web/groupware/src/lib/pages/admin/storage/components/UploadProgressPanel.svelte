<script lang="ts">
  // 업로드 진행 패널: 우하단 고정
  //
  // 하단 가운데는 앞으로 선택 액션바가 쓰므로(2단계) 자리를 겹치지 않게 처음부터 오른쪽에 둔다.
  // 실패한 작업은 스스로 사라지지 않는다. 무엇이 안 올라갔는지는 사용자가 알아야 한다.
  import { formatBytes } from '$lib/features/storage/lib/bytes';
  import { bottomInsetStore } from '$lib/shared/lib/stores/viewport/bottomInsetStore/bottomInsetStore.svelte';
  import type { UploadJob } from '$lib/features/storage/lib/uploadQueue.svelte';

  interface Props {
    jobs: readonly UploadJob[];
    onCancel: (jobId: string) => void;
    onDismiss: () => void;
  }
  let { jobs, onCancel, onDismiss }: Props = $props();

  // 하단 크롬이 점유한 높이. 이 화면은 공지 바를 감추므로 보통 0 이지만, 값을 읽어 두면
  //   나중에 다른 화면에서 이 패널을 쓰거나 하단 바가 돌아와도 겹치지 않는다.
  //   (bottomInsetStore 의 계약: 하단 고정 오버레이는 px 만 읽는다)
  const bottomInset = $derived(bottomInsetStore.px);

  const active = $derived(jobs.filter((j) => j.status === 'waiting' || j.status === 'uploading'));
  const failed = $derived(jobs.filter((j) => j.status === 'failed'));
  const done = $derived(jobs.filter((j) => j.status === 'done'));
</script>

{#if jobs.length > 0}
  <!--
    좁은 화면은 좌우 여백만 두고 화면 폭을, 넓은 화면은 우하단 고정 폭을 쓴다.
    아래 여백은 하단 크롬 높이를 더해 띄운다. 그 값만 동적이라 CSS 변수로 넘기고 나머지는 클래스로 둔다.
  -->
  <aside
    class="fixed inset-x-3 z-40 overflow-hidden rounded-xl border border-line bg-surface shadow-lg
           bottom-[calc(0.75rem+var(--bottom-inset))]
           lg:inset-x-auto lg:right-6 lg:w-80 lg:bottom-[calc(1.5rem+var(--bottom-inset))]"
    style="--bottom-inset: {bottomInset}px"
    aria-live="polite"
  >
    <header class="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
      <p class="text-sm font-medium text-fg">
        {#if active.length > 0}
          업로드 {done.length}/{jobs.length}
        {:else if failed.length > 0}
          업로드 {failed.length}건 실패
        {:else}
          업로드 완료
        {/if}
      </p>
      <button
        type="button"
        class="rounded-md px-2 py-0.5 text-xs text-fg-subtle transition hover:bg-hover hover:text-fg"
        onclick={onDismiss}
      >
        닫기
      </button>
    </header>
    <ul class="max-h-64 overflow-y-auto">
      {#each jobs as job (job.id)}
        <li class="border-b border-line/60 px-3 py-2 last:border-b-0">
          <div class="flex items-baseline justify-between gap-2">
            <span class="truncate text-xs text-fg" title={job.fileName}>{job.fileName}</span>
            <span class="shrink-0 text-[11px] text-fg-subtle">{formatBytes(job.size)}</span>
          </div>
          {#if job.status === 'failed'}
            <p class="mt-1 text-[11px] text-danger-fg">{job.error}</p>
          {:else if job.status === 'cancelled'}
            <p class="mt-1 text-[11px] text-fg-subtle">취소됨</p>
          {:else if job.status === 'done'}
            <p class="mt-1 text-[11px] text-success-fg">완료</p>
          {:else}
            <!-- 진행 막대와 취소를 한 줄에 둔다. 취소는 다 올린 뒤가 아니라 보내는 도중에
                 눌러야 의미가 있으므로, 막대가 보이는 동안 늘 함께 보여야 한다. -->
            <div class="mt-1 flex items-center gap-2">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
                <div
                  class="h-full rounded-full bg-brand transition-[width]"
                  style="width: {job.size > 0 ? Math.min(100, (job.loaded / job.size) * 100) : 0}%"
                ></div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-fg-subtle transition hover:bg-hover hover:text-fg"
                onclick={() => onCancel(job.id)}
              >
                취소
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </aside>
{/if}

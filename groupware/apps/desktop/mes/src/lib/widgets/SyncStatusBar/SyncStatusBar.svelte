<script lang="ts">
  import { syncStore } from '$lib/shared/lib/stores/syncStore/syncStore.svelte';
  import type { Connectivity } from '$lib/infrastructure/sync';

  interface Props {
    // 진단 화면으로 이동하는 링크를 보일지
    showDiagnosticsLink?: boolean;
  }
  let { showDiagnosticsLink = true }: Props = $props();

  // 상태를 색으로만 표현하지 않는다. 색약과 형광등 아래 색 왜곡을 동시에 고려한 결정이고,
  // 흑백 인쇄된 작업 지시서에 화면 캡처가 붙는 일도 흔하다.
  const CONNECTIVITY_LABEL: Record<Connectivity, string> = {
    online: '연결됨',
    degraded: '지연',
    offline: '오프라인',
    unknown: '확인 중',
  };

  let status = $derived(syncStore.status);
  let unsent = $derived(syncStore.unsentCount);
  let needsAttention = $derived(syncStore.needsAttentionCount);

  function formatTime(iso: string | null): string {
    if (!iso) return '없음';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '없음' : d.toLocaleTimeString('ko-KR');
  }
</script>

<!--
  연결 상태, 미전송 건수, 마지막 동기화 시각 셋을 상시 노출한다.
  이 셋이 화면에 없으면 조용한 실패를 아무도 눈치채지 못한다.
-->
<div
  class="flex items-center gap-6 border-t border-neutral-300 bg-neutral-100 px-4 py-2 text-sm"
  data-testid="sync-status-bar"
>
  <span class="flex items-center gap-2">
    <span class="font-medium">연결</span>
    <span data-testid="connectivity">{CONNECTIVITY_LABEL[status.connectivity]}</span>
  </span>

  <span class="flex items-center gap-2">
    <span class="font-medium">미전송</span>
    <span data-testid="unsent-count">{unsent}건</span>
    {#if needsAttention > 0}
      <!-- 사람이 손대야 하는 건수는 따로 센다. 방치되면 그 실적은 서버에 영영 안 간다. -->
      <span data-testid="attention-count">(확인 필요 {needsAttention}건)</span>
    {/if}
  </span>

  <span class="flex items-center gap-2">
    <span class="font-medium">마지막 동기화</span>
    <span data-testid="last-pull-at">{formatTime(status.lastPullAt)}</span>
  </span>

  {#if showDiagnosticsLink}
    <a class="ml-auto underline" href="/diagnostics">진단</a>
  {/if}
</div>

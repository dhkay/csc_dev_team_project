<script lang="ts">
  // 빈 상태 셋: 검색 결과 없음 / 올릴 수 있는 빈 영역 / 읽기만 되는 빈 영역
  // 셋을 한 문장으로 뭉뚱그리면 "내가 못 올리는 것인지 아무것도 없는 것인지" 를 구분할 수 없다.
  interface Props {
    searching: boolean;
    trashed: boolean;
    canUpload: boolean;
    uploadReason?: string;
  }
  let { searching, trashed, canUpload, uploadReason }: Props = $props();
</script>

<div
  class="flex min-h-[16rem] flex-col items-center justify-center gap-2 px-6 py-10 text-center"
>
  {#if searching}
    <p class="text-sm text-fg">검색 결과가 없습니다.</p>
    <p class="text-xs text-fg-subtle">다른 검색어로 찾아보세요.</p>
  {:else if trashed}
    <p class="text-sm text-fg">휴지통이 비어 있습니다.</p>
    <p class="text-xs text-fg-subtle">삭제한 파일이 여기에 모입니다.</p>
  {:else if canUpload}
    <p class="text-sm text-fg">아직 파일이 없습니다.</p>
    <p class="text-xs text-fg-subtle">파일을 끌어다 놓거나 업로드 버튼을 누르세요.</p>
  {:else}
    <p class="text-sm text-fg">아직 파일이 없습니다.</p>
    <p class="text-xs text-fg-subtle">{uploadReason ?? '이 영역은 읽기만 할 수 있습니다.'}</p>
  {/if}
</div>

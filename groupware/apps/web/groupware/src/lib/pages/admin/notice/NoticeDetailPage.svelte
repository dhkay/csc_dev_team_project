<script lang="ts">
  import { footerNotices } from '$lib/shared/lib/constants/footerNotices';

  // 공지 상세: 팝아웃(window.open) 페이지 내용(읽기전용). 하단 공지 바의 더보기(+)로 열린다.
  interface Props {
    noticeId: string;
  }
  let { noticeId }: Props = $props();

  const notice = $derived(footerNotices.find((n) => n.id === noticeId));
</script>

<div class="p-5">
  {#if !notice}
    <p class="text-sm text-gray-500">공지를 찾을 수 없습니다.</p>
  {:else}
    <div class="flex items-center gap-2">
      {#if notice.badge}
        <span class="shrink-0 rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-white">
          {notice.badge}
        </span>
      {/if}
      <h3 class="text-base font-semibold text-gray-900">공지</h3>
    </div>

    <p class="mt-3 text-sm leading-relaxed text-gray-800">{notice.text}</p>

    <p class="mt-4 text-xs text-gray-400">상세 본문은 준비중입니다.</p>
  {/if}
</div>

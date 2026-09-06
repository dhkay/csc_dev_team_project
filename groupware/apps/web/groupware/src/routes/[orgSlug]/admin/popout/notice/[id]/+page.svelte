<script lang="ts">
  // 공지 상세 팝아웃 페이지: 라우트 param(id)을 noticeId 로 전달
  import { page } from '$app/stores';
  import NoticeDetail from '$lib/pages/admin/notice/NoticeDetailPage.svelte';
</script>

<NoticeDetail noticeId={$page.params.id ?? ''} />

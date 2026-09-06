<script lang="ts">
  // AI 챗봇 팝아웃 페이지: 상위 admin/+layout.server.ts 가드(인증/역할/슬러그)에 더해
  // +page.server.ts 가 접근 정책(canUseAiAssistant)을 확인한다. AI 어시스턴트는 기본 제공 도구라
  // 현재는 인증된 조직 유저면 통과(엔타이틀먼트 불요)
  import ChatbotPage from '$lib/pages/tools/chatbot/ChatbotPage.svelte';
</script>

<ChatbotPage />

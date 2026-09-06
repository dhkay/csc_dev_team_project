<script lang="ts">
  // 도구 랜딩: 채널이 있으면 +page.server.ts 가 채널 경로로 리다이렉트하므로, 여기가 렌더되는 경우 =
  // 채널이 아직 없을 때. 워크스페이스(기획서 생성/저장본/영상)는 채널 스코프라, 여기선 채널 추가를 유도한다.
  // 채널 추가는 상단 앱바의 채널 드롭다운(ChannelSwitcher)에서 한다.
</script>

<div class="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center">
  <svg
    class="h-12 w-12 text-fg-subtle opacity-60"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="6" width="12" height="12" rx="2" />
    <path d="M15 10.5 21 7v10l-6-3.5" />
  </svg>
  <h2 class="text-base font-semibold text-fg">채널을 추가해 시작하세요</h2>
  <p class="max-w-sm text-sm text-fg-subtle">
    마케팅 영상 워크스페이스는 채널 단위로 동작합니다. 상단의 채널 드롭다운에서 채널을 추가하면
    기획서 생성과 영상 제작을 시작할 수 있습니다.
  </p>
</div>

<script lang="ts">
  // 메인 앱바 아래 얇은 서브 툴바. 두 가지 모드로 동작한다.
  //
  // 1) 도구 모드(tools): 페이지가 자기 load 에서 `page.data.subAppBar.items`(좌측 버튼 목록)를
  //    주입한 경우. 현재는 관리자 대시보드(/[orgSlug]/admin)가 AI 도구 바로 쓴다.
  //    항목 버튼은 `href` 가 있으면 이동, 없으면 '기능 준비중' 토스트
  // 2) 경로 모드(breadcrumb): subAppBar 주입이 없는 모든 페이지(대시보드 외 admin 하위 전부)
  //    현재 URL 에서 `관리자 › … › 현재` 크럼을 만들고, 각 크럼 클릭 시 그 경로로 이동한다.
  //
  // 즉 대시보드만 명시적으로 도구 모드를 켜고, 나머지는 자동으로 경로 모드가 된다.
  import { page } from '$app/stores';
  import { openPopout } from '@csc/shared-ui/popout';
  import { buildAdminBreadcrumbs } from '$lib/shared/lib/breadcrumb/breadcrumb';
  import { canUseAiAssistant } from '$lib/shared/lib/auth/access';
  import { popouts } from '$lib/shared/lib/popout/popouts';
  import { aiToolTabName } from '$lib/shared/lib/navigation/aiWorkspaceTabs';
  import type { SubAppBarData, SubAppBarItem } from './subAppBar.types';

  // 조직 slug: 유저의 조직값을 먼저 쓰고 URL 파라미터로 폴백한다. slug 는 가변이라
  //   조직 개명 직후에는 주소창 값이 낡을 수 있고(가드가 다음 네비게이션에 교정), 그 사이에 만든
  //   링크가 없는 조직을 가리키면 새 탭이 열리자마자 실패한다.
  const orgSlug = $derived($page.data?.user?.organization?.slug ?? $page.params.orgSlug ?? '');
  function openChatbot(): void {
    if (orgSlug) openPopout(popouts.chatbot(orgSlug));
  }

  // 챗봇 버튼 가시성: AI 어시스턴트는 기본 제공 도구라 인증된 조직 유저 누구나 노출(엔타이틀먼트 불요)
  //  정책 SSOT = canUseAiAssistant. 서버 집행(팝아웃 +page.server.ts + BFF requireIdentity)도 같은 헬퍼 공유
  const canUseChatbot = $derived(canUseAiAssistant($page.data?.user));

  // AI 도구: 홈에서 누르면 그 도구를 새 탭으로 띄운다(홈 탭은 그대로 남는다). 도구는 로비의
  //   한 화면이 아니라 그 자체로 작업 공간이라, 둘을 탭으로 나눠 오가며 쓴다.
  //   target 에 도구별 탭 이름을 주므로 다시 눌러도 탭이 쌓이지 않고 그 탭으로 전환된다.
  //   이름 규칙 SSOT = aiWorkspaceTabs. rel="noopener" 금지(그쪽 주석 참고: 붙이면 도구
  //   앱바 로고가 로비 탭을 못 찾는다)
  //
  // page.data 는 라우트마다 형태가 달라 타입이 없다. 계약(subAppBar.types)으로 여기서 한 번만 좁힌다.
  const subAppBar = $derived(($page.data as { subAppBar?: SubAppBarData }).subAppBar);
  // 도구 모드 여부: 페이지가 subAppBar 를 주입했으면(빈 items 포함) 도구 모드
  const isToolsMode = $derived(subAppBar !== undefined);
  const items = $derived<SubAppBarItem[]>(subAppBar?.items ?? []);
  // 경로 모드일 때만 크럼을 계산한다.
  const crumbs = $derived(isToolsMode ? [] : buildAdminBreadcrumbs($page.url.pathname));

  // '준비중' 토스트: 도구 모드에서 slug 없는 항목 클릭 시 잠깐 떴다 사라진다.
  let notice = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function showComingSoon(label: string): void {
    notice = `${label} 기능 준비중입니다.`;
    clearTimeout(timer);
    timer = setTimeout(() => {
      notice = null;
    }, 2000);
  }

  // 바 컨테이너: 공통 골격(base)에 모드별 배경/구분선만 살짝 다르게 얹는다.
  // 도구 모드는 액션 바라 또렷하게(gray-50), 경로 모드는 길찾기라 가볍게(white)
  const barBase = 'relative flex h-10 w-full shrink-0 items-center gap-1 border-b px-3';
  const toolsBarClass = `${barBase} border-gray-200 bg-gray-50`;
  const crumbBarClass = `${barBase} border-gray-100 bg-white`;
  // 항목 버튼 스타일(두 모드 공유)
  const itemClass =
    'shrink-0 rounded-md px-2.5 py-1 text-sm font-medium text-gray-700 transition ' +
    'hover:bg-[#eeeff0] hover:text-gray-900 focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-[#1868db]/40';
  // AI 챗봇 버튼: 우측 구역 전용 액션. 좌→우 그라데이션 배경 + 흰 글씨로 도구 목록과 구분한다.
  const chatbotClass =
    'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0f8ef0] to-[#5822f4] ' +
    'px-3.5 py-1 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5822f4]/40';
</script>

{#if isToolsMode}
  <!-- 도구 모드: 좌/우 두 구역. 좌측은 AI 도구 목록, 우측은 AI 챗봇(항상 우측 끝 고정) -->
  <div class={toolsBarClass}>
    <!-- 좌측 구역: AI 도구 목록. 넘치면 이 구역 안에서 가로 스크롤하며,
         우측 챗봇 버튼을 밀어내지 않는다(min-w-0 + flex-1) -->
    <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {#each items as item, i (i)}
        {#if item.slug && orgSlug}
          <a href={`/${orgSlug}/${item.slug}`} target={aiToolTabName(item.slug)} class={itemClass}>
            {item.label}
          </a>
        {:else}
          <button type="button" class={itemClass} onclick={() => showComingSoon(item.label)}>
            {item.label}
          </button>
        {/if}
      {/each}
    </div>

    <!-- 우측 구역: 준비중 토스트 + AI 챗봇 버튼. 좌측 목록 길이와 무관하게 우측 끝 고정 -->
    <div class="flex shrink-0 items-center gap-2 pl-2">
      {#if notice}
        <span
          role="status"
          aria-live="polite"
          class="shrink-0 rounded-full bg-gray-800/90 px-3 py-1 text-xs font-medium text-white"
        >
          {notice}
        </span>
      {/if}
      {#if canUseChatbot}
        <button type="button" class={chatbotClass} onclick={openChatbot}>
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          AI 어시스턴트
        </button>
      {/if}
    </div>
  </div>
{:else if crumbs.length > 0}
  <!-- 경로 모드: 클릭 가능한 브레드크럼(현재 위치는 강조 텍스트) -->
  <nav class={crumbBarClass} aria-label="페이지 경로">
    {#each crumbs as crumb, i (crumb.href)}
      {#if i > 0}
        <span class="shrink-0 select-none px-0.5 text-gray-300" aria-hidden="true">›</span>
      {/if}
      {#if crumb.current}
        <span aria-current="page" class="shrink-0 px-2.5 py-1 text-sm font-semibold text-gray-900">
          {crumb.label}
        </span>
      {:else}
        <a href={crumb.href} class={itemClass}>{crumb.label}</a>
      {/if}
    {/each}
  </nav>
{/if}

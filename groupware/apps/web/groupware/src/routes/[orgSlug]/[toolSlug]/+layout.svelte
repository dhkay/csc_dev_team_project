<script lang="ts">
  // /[orgSlug]/[toolSlug] 셸: 상단 앱바(우측 프로필 드롭다운) + 전체 콘텐츠 영역
  // 관리자 셸(AdminShell)과 달리 서브 앱바/하단 바 없이 상단 앱바만 둔다(도구 랜딩 UI)
  // 콘텐츠 내부 레이아웃(사이드바/그리드/방향 전환)은 각 도구 페이지가 직접 구성한다.
  // 직원조회(조직 아이콘)는 도구 셸에 불필요 → onOrgClick 미전달로 앱바에서 미노출
  // 프로필 드롭다운: 환경설정(관리자만) + 공통 로그아웃(+페이지 항목)
  //   '관리자 페이지로 이동'은 두지 않는다. 이 도구는 새 탭으로 열리므로(홈의 aiToolTabName)
  //   이 탭을 로비로 바꾸면 작업 공간이 사라진다. 로비로는 앱바 로고가 데려가는데, 제자리 이동이
  //   아니라 로비 탭으로의 전환이다(homeTarget)
  // user 는 +layout.server.ts 가드에서 내려온 값(앱바 로고/아바타/이름/role)
  import { AiToolKey } from '@csc/entitlements';
  import AppBar from '$lib/widgets/AppBar/AppBar.svelte';
  import ThemeScope from '$lib/shared/ui/ThemeScope.svelte';
  import ThemeToggle from '$lib/shared/ui/ThemeToggle.svelte';
  import ChannelSwitcher from '$lib/pages/tools/marketing-video/shared/ChannelSwitcher.svelte';
  import VersionModeToggle from '$lib/pages/tools/marketing-video/shared/VersionModeToggle.svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { createMutation } from '@tanstack/svelte-query';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import { asVersionMode, type VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import { hasSection } from '$lib/pages/tools/marketing-video/versionProfile';
  import {
    swapVersion,
    type WorkspaceRoute,
  } from '$lib/pages/tools/marketing-video/workspaceUrl';
  import { AI_WORKSPACE_TAB_NAME } from '$lib/shared/lib/navigation/aiWorkspaceTabs';
  import { isAdmin } from '$lib/shared/lib/auth/access';
  import { profileMenuStore } from '$lib/shared/lib/stores/profileMenu/profileMenuStore.svelte';
  import { accountMenuItems, composePageMenu } from '$lib/shared/lib/profileMenu/accountMenu';
  import type { ProfileMenuItem } from '$lib/widgets/AppBar/profileMenu.types';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const orgSlug = $derived(data.user.organization?.slug ?? '');
  const admin = $derived(isAdmin(data.user));
  // 마케팅 영상 제작 도구에서만 앱바 타이틀 우측에 모드/채널 드롭다운을 노출한다.
  const isMarketingVideo = $derived(data.tool.key === AiToolKey.MarketingVideo);

  /**
   * 지금 보고 있는 버전: 주소가 말한다(`/{org}/{tool}/{version}/{channel}`)
   *
   * 전역 스토어를 쓰지 않는 이유: 버전이 URL 에 있으면 고르는 자리(앱바)와 반응하는 자리(자식 셸
   * 사이드바)가 모두 `page.params` 를 읽어, prop 경로가 없어도 스토어가 필요하지 않다.
   * (URL 옆에 사는 가변 사본도 없어진다)
   *
   * 도구 랜딩(버전 세그먼트가 없는 자리)에서는 null 이라 토글을 그리지 않는다.
   */
  const version = $derived(asVersionMode(page.params.version));

  // 진입 기본값 기록: 전환의 부수효과다. 실패해도 화면은 이미 옳다(다음 진입만 낡는다)
  const rememberEntry = createMutation(() => svc.setMyEntryVersionMutationOptions());

  /**
   * 버전 전환 = URL 이동(상태 변경이 아니다). 채널/섹션/쿼리를 그대로 들고 간다.
   *
   * pushState 인 이유: 버전은 이제 페이지의 정체성이라 "뒤로 = 아까 보던 버전" 이 옳다.
   * 캐시는 무효화하지 않는다: 쿼리 키에 버전이 들어 있어 서로 다른 키 공간이다.
   */
  function changeVersion(next: VersionMode): void {
    const route = routeOf();
    if (route) void goto(swapVersion(page.url, route, next, hasSection), { noScroll: true });
    rememberEntry.mutate(next);
  }

  /** 주소의 네 조각. 채널이 없는 자리(도구 랜딩)에서는 null. */
  function routeOf(): WorkspaceRoute | null {
    const { orgSlug: org, toolSlug: tool, version: v, channelSlug } = page.params;
    const parsed = asVersionMode(v);
    if (!org || !tool || !parsed || !channelSlug) return null;
    return { orgSlug: org, toolSlug: tool, version: parsed, channelSlug };
  }

  const profileMenuItems = $derived.by(() => {
    const account = accountMenuItems(orgSlug); // [환경설정, 로그아웃]
    // 관리자: 환경설정 + 로그아웃 / 비관리자: 로그아웃만(환경설정 라우트가 관리자 가드 하위라서)
    const base: ProfileMenuItem[] = admin ? account : account.slice(1);
    return composePageMenu(base, profileMenuStore.pageItems);
  });
</script>

<!-- ThemeScope: 이 셸 서브트리(앱바 포함)에 테마를 한정 적용(themeStore 테마 클래스) -->
<ThemeScope class="flex h-dvh flex-col bg-surface">
  <AppBar
    title={data.tool.name}
    homeHref={`/${orgSlug}/admin`}
    homeTarget={AI_WORKSPACE_TAB_NAME}
    userName={data.user.name}
    organization={data.user.organization}
    profileImageUrl={data.user.profileImageUrl}
    {profileMenuItems}
  >
    {#snippet leadingActions()}
      <ThemeToggle />
    {/snippet}
    {#snippet titleTrailing()}
      {#if isMarketingVideo && version}
        <!-- 모드 → 채널 순서: 모드가 화면 구성을 가르는 더 넓은 축이라 좌측에 둔다. -->
        <VersionModeToggle value={version} onChange={changeVersion} />
        <ChannelSwitcher />
      {/if}
    {/snippet}
  </AppBar>

  <!-- 전체 콘텐츠 영역: 내부 레이아웃은 도구 페이지가 구성(사이드바/보조앱바 + 콘텐츠) -->
  <div class="min-h-0 flex-1 overflow-hidden bg-surface">
    {@render children()}
  </div>
</ThemeScope>

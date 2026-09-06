<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/stores';
  import AppBar from '../AppBar/AppBar.svelte';
  import SubAppBar from '../SubAppBar/SubAppBar.svelte';
  import BottomBar from '../BottomBar/BottomBar.svelte';
  import ContentRegion from '$lib/shared/ui/layout/ContentRegion.svelte';
  import type { Organization } from '$lib/shared/types/common.types';
  import type { ProfileMenuItem } from '../AppBar/profileMenu.types';
  import { shouldShowBottomBar, type ShellChrome } from './shellChrome';

  // 관리자 셸: 메인 앱바 + 서브 앱바를 영속시키고 라우트 콘텐츠를 콘텐츠 영역에 렌더한다.
  // 보조 창은 인페이지 플로팅이 아니라 네이티브 팝아웃(window.open)으로 띄운다. 셸은 창을 마운트하지 않는다.
  // organization/profileImageUrl: 레이아웃 data(SSR findData)에서 그대로 전달하는 reactive prop.
  //   환경설정 저장 후 invalidateAll 시 data 가 갱신되며 앱바 로고/아바타가 자동 반영된다.
  // onOrgClick: 앱바 조직 아이콘 클릭 핸들러(직원조회 팝아웃 진입점): 레이아웃에서 주입
  // profileMenuItems: 앱바 프로필 드롭다운 항목: 레이아웃이 공통+페이지 항목을 합성해 주입
  // 서브 앱바 내용은 각 페이지가 page.data.subAppBar 로 주입한다(SubAppBar 가 직접 읽음): 셸은 관여하지 않음
  let {
    userName = '관리자',
    organization,
    profileImageUrl = null,
    onOrgClick,
    profileMenuItems,
    children
  }: {
    userName?: string;
    organization?: Organization;
    profileImageUrl?: string | null;
    onOrgClick?: () => void;
    profileMenuItems?: ProfileMenuItem[];
    children: Snippet;
  } = $props();

  // 하단 공지 바는 기본으로 띄우고, 페이지가 `chrome.bottomBar: false` 로 선언했을 때만 감춘다.
  //   (계약: shellChrome.ts). 감추면 그 높이는 콘텐츠 영역이 그대로 가져간다.
  //   하단 고정 오버레이(토스트, 업로드 패널)는 bottomInsetStore 를 읽으므로, 바가 사라지면
  //   예약도 함께 사라져 인셋이 0 으로 돌아간다. 여기서 따로 알릴 것이 없다.
  const chrome = $derived(($page.data as { chrome?: ShellChrome }).chrome);
  const showBottomBar = $derived(shouldShowBottomBar(chrome));
</script>

<div class="flex h-dvh flex-col">
  <AppBar {userName} {organization} {profileImageUrl} {onOrgClick} {profileMenuItems} />
  <SubAppBar />

  <ContentRegion contentClass="bg-white p-4">
    {@render children()}
  </ContentRegion>

  {#if showBottomBar}
    <BottomBar />
  {/if}
</div>

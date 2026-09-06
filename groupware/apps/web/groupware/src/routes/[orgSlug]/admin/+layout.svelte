<script lang="ts">
  // /[orgSlug]/admin 세그먼트 레이아웃: 관리자 셸(앱바 + 서브 앱바)을 영속시킨다.
  // 하위 모든 페이지는 이 셸 안의 <main> 콘텐츠로 렌더된다.
  // user 는 +layout.server.ts 가드에서 내려온 값(이름을 앱바에 표시)
  import { onMount } from 'svelte';
  import AdminShell from '$lib/widgets/AdminShell/AdminShell.svelte';
  import { openPopout } from '@csc/shared-ui/popout';
  import { popouts } from '$lib/shared/lib/popout/popouts';
  import { markAiWorkspaceTab } from '$lib/shared/lib/navigation/aiWorkspaceTabs';
  import { profileMenuStore } from '$lib/shared/lib/stores/profileMenu/profileMenuStore.svelte';
  import { accountMenuItems, composePageMenu } from '$lib/shared/lib/profileMenu/accountMenu';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const orgSlug = $derived(data.user.organization?.slug ?? '');

  // 이 탭이 곧 AI 워크스페이스다. 이름을 심어 두면 도구 탭의 앱바 로고가 이 탭을 지목해 전환한다.
  //   (이름이 없으면 로고가 로비를 새 탭에 또 띄운다). 관리자 화면 사이를 옮겨도 유지된다.
  onMount(markAiWorkspaceTab);

  // 앱바 조직 아이콘 → '직원조회' 팝아웃(window.open). 같은 name 으로 단일 창
  const openEmployeeDirectory = () => openPopout(popouts.employeeDirectory(orgSlug));

  // 프로필 드롭다운 = 공통 계정 항목(환경설정/로그아웃) + 페이지 항목(profileMenuStore)
  // 페이지는 profileMenuStore.setPageItems([...]) 로 자기 항목을 얹는다(이탈 시 reset)
  const profileMenuItems = $derived(
    composePageMenu(accountMenuItems(orgSlug), profileMenuStore.pageItems)
  );
</script>

<AdminShell
  userName={data.user.name}
  organization={data.user.organization}
  profileImageUrl={data.user.profileImageUrl}
  onOrgClick={openEmployeeDirectory}
  {profileMenuItems}
>
  {@render children()}
</AdminShell>

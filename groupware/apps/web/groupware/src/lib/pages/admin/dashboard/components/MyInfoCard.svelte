<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import { openPopout } from '@csc/shared-ui/popout';
  import { popouts } from '$lib/shared/lib/popout/popouts';
  import { subscribePopout } from '$lib/shared/lib/popout/popoutChannel';
  import { authService } from '$lib/features/account/services/auth.service';
  import { formatDate, formatDateTime } from '$lib/shared/lib/utils/dateTimeUtils';
  import ProfileAvatar from '$lib/shared/ui/ProfileAvatar.svelte';

  // 내정보 카드: 대시보드 첫 타일(2x2). 실데이터($page.data.user) 기반
  // 환경설정 팝아웃에서 계정/프로필 변경 시 'account:changed' 를 받아 invalidateAll 로 갱신
  // 미연동/폴백 시 '비즈오피스 데모'. (.claude/rules/multi-tenancy.md)
  const user = $derived($page.data?.user);
  const displayName = $derived(user?.name || '관리자');
  const avatarUrl = $derived(user?.profileImageUrl ?? null);
  const orgName = $derived(user?.organization?.name ?? '비즈오피스 데모');
  const orgSlug = $derived(user?.organization?.slug ?? $page.params.orgSlug ?? '');

  // 오늘 날짜, 최종 로그인시간은 한국시간(KST) 기준으로 표시: 해외 접속자도 동일
  const today = formatDate();
  const lastLoginAt = $derived(user?.lastLoginAt ? formatDateTime(user.lastLoginAt) : '-');

  onMount(() =>
    subscribePopout((msg) => {
      if (msg.type === 'account:changed') invalidateAll();
    }),
  );

  /** 환경설정 팝아웃: 본인 계정/프로필 편집(window.open) */
  function openSettings(): void {
    if (orgSlug) openPopout(popouts.accountSettings(orgSlug));
  }

  /** 로그아웃: authService(BFF /api/auth/logout)로 쿠키 삭제 후 로그인 페이지로 이동 */
  async function logout(): Promise<void> {
    await authService.logout();
    window.location.href = '/login';
  }
</script>

<article
  class="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
>
  <h2 class="text-lg font-bold text-gray-900">내정보</h2>

  <!-- 프로필 -->
  <div class="flex items-center gap-3">
    <ProfileAvatar src={avatarUrl} sizeClass="h-12 w-12" iconClass="h-8 w-8" />
    <div class="min-w-0">
      <p class="truncate font-semibold text-gray-900">{displayName}</p>
      <p class="truncate text-sm text-gray-500">{orgName}</p>
    </div>
  </div>

  <!-- 정보 행 -->
  <dl class="flex flex-col gap-2">
    <div class="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
      <dt class="text-sm text-gray-500">Today</dt>
      <dd class="text-sm font-medium text-gray-800">{today}</dd>
    </div>
    <div class="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
      <dt class="text-sm text-gray-500">최종 로그인시간</dt>
      <dd class="text-sm font-medium text-gray-800">{lastLoginAt}</dd>
    </div>
  </dl>

  <!-- 버튼: 왼쪽 환경설정 / 오른쪽 로그아웃 -->
  <div class="mt-auto flex gap-2">
    <button
      type="button"
      onclick={openSettings}
      class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
    >
      환경설정
    </button>
    <button
      type="button"
      onclick={logout}
      class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
    >
      로그아웃
    </button>
  </div>
</article>

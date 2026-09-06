<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Organization } from '$lib/shared/types/common.types';
  import ProfileAvatar from '$lib/shared/ui/ProfileAvatar.svelte';
  import ProfileMenu from './ProfileMenu.svelte';
  import type { ProfileMenuItem } from './profileMenu.types';
  import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';

  // 관리자 상단 앱바(헤더). 레이아웃 전용이고 landscape/portrait 모두 셸 최상단에 고정 높이로 노출된다.
  //
  // prop 중 미지정 시 동작이 갈리는 것만 적는다.
  //   onOrgClick        미지정이면 조직 아이콘 자체를 렌더하지 않는다.
  //   onNotificationClick  미지정이면 전역 토스트로 기능 준비중을 통보한다. 눌러도 아무 반응이
  //                     없으면 버튼이 고장난 것처럼 읽히기 때문이다.
  //   profileMenuItems  있으면 프로필 아바타가 드롭다운 트리거가 되고, 없으면 정적 아바타다.
  //
  // leadingActions 와 titleTrailing 은 범용 슬롯이라 셸이나 페이지가 원하는 것을 얹는다.
  let {
    title = 'AI 워크스페이스',
    userName = '관리자',
    organization,
    profileImageUrl = null,
    onOrgClick,
    onNotificationClick,
    profileMenuItems,
    leadingActions,
    titleTrailing,
    homeHref = '/admin',
    homeTarget
  }: {
    title?: string;
    userName?: string;
    organization?: Organization;
    profileImageUrl?: string | null;
    onOrgClick?: () => void;
    onNotificationClick?: () => void;
    profileMenuItems?: ProfileMenuItem[];
    leadingActions?: Snippet;
    titleTrailing?: Snippet;
    // 조직 로고를 눌렀을 때 갈 곳(AI 워크스페이스 홈)
    homeHref?: string;
    // 로고 링크를 열 탭 이름. 미지정이면 이 탭에서 이동한다.
    // AI 도구 셸은 로비 탭 이름을 준다: 도구 탭이 로비로 바뀌는 대신 로비 탭으로 전환된다.
    homeTarget?: string;
  } = $props();

  /**
   * 알림 버튼 기본 동작: 우하단 전역 토스트로 "준비중"을 통보한다.
   *
   * 알림 원본이 아직 없으므로 "새 알림 없음"이 아니라 기능이 준비중임을 알린다(SubAppBar 의
   * 미구현 항목과 같은 문구 계열). 연달아 눌러도 `n회` 배지가 붙지 않도록 이전 것을 닫고 다시
   * 띄운다. 같은 key 로 갱신만 하면 카드가 그대로라 눌린 건지 알 수 없다.
   */
  let noticeToastId: string | null = null;
  function notifyComingSoon(): void {
    if (noticeToastId) toastStore.dismiss(noticeToastId);
    noticeToastId = toastStore.show({
      variant: 'info',
      title: '알림 기능 준비중입니다.',
      key: 'appbar:notifications',
    });
  }
</script>

<header
  class="flex h-14 w-full shrink-0 items-center gap-3 border-b border-line bg-surface px-4 text-fg"
>
  <!-- 좌측: 로고(조직 이미지)만 관리자 홈(/admin → 현재 조직 /{orgSlug}/admin) 링크. 타이틀 텍스트는 비링크 -->
  <div class="flex items-center gap-2">
    {#if organization?.profileImageUrl}
      <!-- 조직 로고: 클릭 시에만 관리자 홈으로 이동. 높이를 타이틀 글자(text-base, 1rem)에 맞춰 정렬. 비율 유지 -->
      <!-- aria-label 이 타이틀이 아니라 목적지인 이유: 도구 셸에서도 이 로고가 가는 곳은 로비다. -->
      <a
        href={homeHref}
        target={homeTarget}
        class="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        aria-label="AI 워크스페이스 홈"
      >
        <img
          src={organization.profileImageUrl}
          alt=""
          aria-hidden="true"
          class="h-4 w-auto max-w-[150px] shrink-0 object-contain"
        />
      </a>
    {/if}
    <!-- 타이틀 텍스트: 비링크(클릭해도 이동하지 않음). 로고가 없으면 좌측 끝에 배치 -->
    <span class="text-base font-semibold tracking-tight">{title}</span>
    <!-- 타이틀 우측 슬롯(도구별 컨텍스트 선택기 등). 미지정 시 렌더 안 함 -->
    {#if titleTrailing}{@render titleTrailing()}{/if}
  </div>

  <!-- 가운데: 스페이서 -->
  <div class="flex-1"></div>

  <!-- 우측: (선행 액션=테마) + 조직 아이콘 + 알림 아이콘 + 로그인 유저(프로필 이미지 + 이름)
       순서(좌→우): 도구=[테마][알림][프로필] / 관리자=[조직][알림][프로필]. 알림은 프로필 바로 왼쪽 공통 -->
  <div class="flex items-center gap-2">
    <!-- 선행 액션 슬롯: 프로필 좌측(예: 테마 토글). 페이지/셸이 주입 -->
    {#if leadingActions}{@render leadingActions()}{/if}

    <!-- 조직 아이콘: 프로필 이미지 왼쪽. onOrgClick 이 있을 때만 노출(직원조회 진입점) -->
    {#if onOrgClick}
      <button
        type="button"
        onclick={() => onOrgClick?.()}
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        aria-label="조직"
        title="조직"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 21h18" />
          <path d="M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
          <path d="M14 21V9h4a1 1 0 0 1 1 1v11" />
          <path d="M8 7h2M8 11h2M8 15h2" />
        </svg>
      </button>
    {/if}

    <!-- 알림 아이콘: 프로필 이미지 바로 왼쪽(조직/테마 아이콘의 오른쪽). 양쪽 셸 공통으로 항상 노출 -->
    <button
      type="button"
      onclick={() => (onNotificationClick ?? notifyComingSoon)()}
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      aria-label="알림"
      title="알림"
    >
      <svg
        class="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </button>

    {#if profileMenuItems && profileMenuItems.length > 0}
      <!-- 항목이 있으면 아바타가 드롭다운 트리거(클릭 시 메뉴) -->
      <ProfileMenu {userName} {profileImageUrl} items={profileMenuItems} />
    {:else}
      <!-- 항목이 없으면 기존 정적 아바타 + 이름 -->
      <ProfileAvatar src={profileImageUrl} sizeClass="h-8 w-8" iconClass="h-5 w-5" alt={`${userName} 프로필`} />
      <span class="max-w-[8rem] truncate text-sm text-fg-muted">{userName}</span>
    {/if}
  </div>
</header>

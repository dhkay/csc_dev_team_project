<script lang="ts">
  import { organizationStore as org } from '$lib/shared/lib/stores/organizationStore/organizationStore.svelte';
  import { userStore as users } from '$lib/shared/lib/stores/userStore/userStore.svelte';
  import { permissionStore as permissions } from '$lib/shared/lib/stores/permissionStore/permissionStore.svelte';
  import { aiToolDistributionStore as aiTools } from '$lib/shared/lib/stores/aiToolDistributionStore/aiToolDistributionStore.svelte';
  import { positionStore as positions } from '$lib/shared/lib/stores/positionStore/positionStore.svelte';
  import { PERMISSION_LABELS } from '$lib/shared/lib/stores/permissionStore/permissions';
  import {
    ALL_PERMISSION_KEYS,
    isRootOnlyGrantPermission,
    isRootRoleOnlyGrantPermission,
  } from '$lib/features/permissions/types';
  import {
    OrgPosition,
    ORG_POSITION_CATALOG,
    ORG_POSITION_LABELS,
    isRootRoleOnlyPosition,
  } from '$lib/features/positions/types';

  // 선택된 유저 상세: 조직도에서 유저를 선택하면 이 패널이 그 유저 정보를 보여준다.
  // 권한, AI도구 부여는 스테이징(하단 저장 바로 일괄 반영). 페이지가 {#key org.selectionKey} 로 감싸므로 선택이 바뀌면 재생성된다.
  interface Props {
    // 현재 관리자가 루트 권한자(ROOT/대표)인지: 시스템관리 부여는 루트 권한자만
    hasRootAuthority?: boolean;
    // 현재 관리자가 ROOT(개발관리자) 역할인지: 대표 임명은 개발관리자만(대표는 임명 불가)
    isRootRole?: boolean;
  }
  let { hasRootAuthority = false, isRootRole = false }: Props = $props();

  const member = $derived(org.selectedMemberId ? users.user(org.selectedMemberId) : undefined);
  const orgNode = $derived(member?.orgId ? org.node(member.orgId) : undefined);
  const memberChain = $derived(member?.orgId ? org.ancestorIds(member.orgId) : []);
  // 이 유저의 접근 권한: 소속 조직 체인의 상속 권한(읽기 전용 표시)
  const perms = $derived(permissions.inheritedFor(memberChain));
  // 상속 AI도구: 부서 체인의 팀 부여(하위 상속)
  const inheritedAiTools = $derived(aiTools.inheritedFor(memberChain));

  // 직책(대표/팀장): 권한/AI도구와 분리된 별도 차원(멤버당 하나, 상호배제).
  // 직책 선택지: 없음(null) + 카탈로그(대표/팀장). 현재 값은 스테이징 우선
  const positionOptions: { value: OrgPosition | null; label: string }[] = [
    { value: null, label: '없음' },
    ...ORG_POSITION_CATALOG.map((c) => ({ value: c.key, label: ORG_POSITION_LABELS[c.key] })),
  ];
  const currentPosition = $derived(member ? positions.positionOf(member.id) : null);
  // 같은 부서(스테이징 배치 반영)의 다른 팀장: 팀장 부서당 1명 라이브 힌트(백엔드도 강제)
  const otherTeamLeader = $derived(
    member?.orgId
      ? users
          .membersOf(member.orgId)
          .find((u) => u.id !== member.id && positions.positionOf(u.id) === OrgPosition.TeamLeader)
      : undefined,
  );

  /** 선택지 비활성 사유(없으면 null): 대표=개발관리자 전용, 팀장=부서 배치, 부서당 1명 */
  function positionLock(opt: OrgPosition | null): string | null {
    if (!member) return '멤버를 찾을 수 없습니다.';
    // 대표는 임명/해임 모두 개발관리자(ROOT)만. 현재가 대표거나 대표로 바꾸려면 ROOT 필요
    const touchesRepresentative =
      isRootRoleOnlyPosition(opt ?? '') || isRootRoleOnlyPosition(currentPosition ?? '');
    if (touchesRepresentative && !isRootRole) return '대표는 개발관리자(루트)만 지정/해제할 수 있습니다.';
    if (opt === OrgPosition.TeamLeader) {
      if (!member.orgId) return '팀장은 부서에 배치된 멤버만 지정할 수 있습니다.';
      if (otherTeamLeader) return `해당 부서에는 이미 팀장(${otherTeamLeader.name})이 있습니다.`;
    }
    return null;
  }
</script>

<section class="min-h-0 overflow-auto p-5 lg:flex-1">
  {#if member}
    <div class="space-y-6">
      <!-- 유저 헤더 -->
      <div class="flex items-center gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1868db]/10 text-lg font-semibold text-[#1868db]" aria-hidden="true">
          {member.name.charAt(0)}
        </div>
        <div class="min-w-0">
          <p class="truncate text-base font-semibold text-gray-900">{member.name}</p>
          <p class="truncate text-sm text-gray-500">{member.email}</p>
        </div>
      </div>

      <!-- 소속 조직 -->
      <div>
        <h3 class="mb-1 text-sm font-semibold text-gray-900">소속 조직</h3>
        {#if orgNode}
          <button
            type="button"
            onclick={() => org.select(orgNode.id)}
            class="text-sm text-[#1868db] hover:underline"
          >
            {orgNode.name}
          </button>
        {:else}
          <p class="text-sm text-gray-400">미배치</p>
        {/if}
      </div>

      <!-- 직책: 권한/AI도구와 분리된 별도 차원. 단일 선택(대표↔팀장 상호배제) -->
      <div>
        <h3 class="mb-1 text-sm font-semibold text-gray-900">직책</h3>
        <div class="flex flex-wrap gap-2">
          {#each positionOptions as opt (opt.value ?? 'none')}
            {@const active = currentPosition === opt.value}
            {@const lock = active ? null : positionLock(opt.value)}
            <button
              type="button"
              disabled={positions.busy || (!active && lock !== null)}
              title={lock ?? undefined}
              onclick={() => positions.setPosition(member.id, opt.value)}
              class="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed {active
                ? 'border-[#1868db] bg-[#1868db]/10 text-[#1868db]'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'}"
            >
              {opt.label}
            </button>
          {/each}
        </div>
        {#if positions.error}
          <p class="mt-1.5 text-xs text-red-600">{positions.error}</p>
        {/if}
        <p class="mt-1.5 text-xs text-gray-400">
          대표는 개발관리자(루트)만, 팀장은 부서에 배치된 멤버만 지정할 수 있습니다(부서당 1명). 대표와 팀장은 함께 지정할 수 없습니다.
        </p>
      </div>

      <!-- 권한: 미부여 / 직접 부여 / 상속(부서). 상속은 직접 토글 비활성(부서에서 변경) -->
      <div>
        <h3 class="mb-1 text-sm font-semibold text-gray-900">권한</h3>
        <div class="flex flex-wrap gap-2">
          {#each ALL_PERMISSION_KEYS as p (p)}
            {@const inherited = perms.includes(p)}
            <!-- 대표(ROOT 역할 전용): 개발관리자만 임명 / 시스템관리(루트 권한자): 대표, 개발관리자 -->
            {@const rootRoleOnly = isRootRoleOnlyGrantPermission(p)}
            {@const locked = rootRoleOnly ? !isRootRole : isRootOnlyGrantPermission(p) && !hasRootAuthority}
            {@const lockLabel = rootRoleOnly ? '개발관리자 전용' : '대표, 개발관리자 전용'}
            {@const lockMsg = rootRoleOnly
              ? '대표 권한은 개발관리자만 부여할 수 있습니다.'
              : '이 권한은 대표 및 개발관리자만 부여할 수 있습니다.'}
            <button
              type="button"
              disabled={permissions.busy || inherited || locked}
              title={inherited ? '소속 부서에서 상속됨. 부서에서 변경' : locked ? lockMsg : undefined}
              onclick={() => permissions.toggleMember(member.id, p)}
              class="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed {inherited
                ? 'border-[#1868db]/40 bg-[#1868db]/5 text-[#1868db]/70'
                : permissions.hasMember(member.id, p)
                  ? 'border-[#1868db] bg-[#1868db]/10 text-[#1868db]'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'}"
            >
              {PERMISSION_LABELS[p]}{#if inherited}<span class="ml-1 text-[11px] opacity-80">상속</span>{:else if locked}<span class="ml-1 text-[11px] opacity-70">,  {lockLabel}</span>{/if}
            </button>
          {/each}
        </div>
        {#if permissions.error}
          <p class="mt-1.5 text-xs text-red-600">{permissions.error}</p>
        {/if}
        <p class="mt-1.5 text-xs text-gray-400">
          '상속'은 소속 부서(및 상위)에서 부여된 권한입니다(여기선 변경 불가).
        </p>
      </div>

      <!-- AI도구: 미부여 / 직접 부여 / 상속(팀). 조직 보유 도구 -->
      {#if aiTools.tools.length > 0}
        <div>
          <h3 class="mb-1 text-sm font-semibold text-gray-900">AI도구</h3>
          <div class="flex flex-wrap gap-2">
            {#each aiTools.tools as t (t.key)}
              {@const inherited = inheritedAiTools.includes(t.key)}
              <button
                type="button"
                disabled={aiTools.busy || inherited}
                title={inherited ? '소속 부서에서 상속됨. 부서에서 변경' : undefined}
                onclick={() => aiTools.toggleMember(member.id, t.key)}
                class="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed {inherited
                  ? 'border-[#1868db]/40 bg-[#1868db]/5 text-[#1868db]/70'
                  : aiTools.hasMember(member.id, t.key)
                    ? 'border-[#1868db] bg-[#1868db]/10 text-[#1868db]'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'}"
              >
                {t.name}{#if inherited}<span class="ml-1 text-[11px] opacity-80">상속</span>{/if}
              </button>
            {/each}
          </div>
          {#if aiTools.error}
            <p class="mt-1.5 text-xs text-red-600">{aiTools.error}</p>
          {/if}
          <p class="mt-1.5 text-xs text-gray-400">
            '상속'은 소속 부서(및 상위)에서 부여된 도구입니다(여기선 변경 불가).
          </p>
        </div>
      {/if}
    </div>
  {:else}
    <p class="text-sm text-gray-400">유저를 찾을 수 없습니다.</p>
  {/if}
</section>

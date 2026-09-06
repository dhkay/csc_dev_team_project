<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { ProvisioningMode } from '@csc/entitlements';
  import { postPopout } from '$lib/shared/lib/popout/popoutChannel';
  import type {
    OrganizationSummary,
    UpdateOrganizationInput,
    OrgMemberSummary,
    RootAdminSummary
  } from '$lib/features/organizations/types';
  import { formatDate } from '$lib/features/organizations/lib/date';
  import OrganizationStatusBadge from './components/OrganizationStatusBadge.svelte';
  import OrganizationImagePicker from './components/OrganizationImagePicker.svelte';
  import { organizationsService } from '$lib/features/organizations/services/organizations.service';
  import type { AiToolCatalogItem } from '$lib/features/ai-tools/types';
  import { isPasswordValid } from '$lib/shared/lib/utils/passwordPolicy';
  import { accountStatusLabel } from '$lib/shared/lib/utils/accountStatus';
  import { isEmailValid } from '$lib/shared/lib/utils/emailPolicy';
  import PasswordChecklist from '$lib/shared/ui/PasswordChecklist.svelte';

  // 조직 상세/편집: 팝아웃(window.open) 페이지 내용. 이름, slug, 상태 편집 + 삭제
  // org 는 라우트 [orgId] + 서버 load 가 내려준 값. 목록은 테넌트 조직만 노출하므로
  // (운영사 PLATFORM 은 제외, organization.service.listOrganizations) 이 창은 항상 TENANT 조직만 받는다.
  // aiToolsCatalog: 부여 토글에 쓸 AI 도구 카탈로그(표시명은 DB 단일 출처: 서버 load 가 내려줌)
  // 변경 성공 시 여는 창에 알리고(BroadcastChannel) 팝아웃을 닫는다(여는 창이 invalidateAll 수행)
  let {
    org,
    aiToolsCatalog = [],
  }: { org: OrganizationSummary; aiToolsCatalog?: AiToolCatalogItem[] } = $props();

  const isWithdrawn = $derived(org.status === 'WITHDRAWN');

  // AI 도구 = 개별 부여(PER_ORG, 토글) + 공통 제공(COMMON, 읽기전용 배지)로 분리
  const perOrgTools = $derived(aiToolsCatalog.filter((t) => t.provisioning === ProvisioningMode.PerOrg));
  const commonTools = $derived(aiToolsCatalog.filter((t) => t.provisioning === ProvisioningMode.Common));

  // 편집 폼: 원본(초기값)은 변경 여부(dirty) 판정/되돌리기에 쓴다.
  const status0: 'ACTIVE' | 'SUSPENDED' = untrack(() => org.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE');
  // 로고는 uploadId(불변)를 제출/저장한다. image0/profileImageUrl 상태는 uploadId 를 담고,
  // 표시는 org.profileImageUrl(로드 경계가 만든 서명 URL)을 피커 displayUrl 로 넘긴다.
  const image0 = untrack(() => org.profileImageUploadId ?? null);
  let name = $state(untrack(() => org.name));
  let slug = $state(untrack(() => org.slug));
  let profileImageUrl = $state<string | null>(image0);
  let logoFile = $state<File | null>(null); // 선택만 된 미저장 로고(저장 시 업로드)
  let status = $state<'ACTIVE' | 'SUSPENDED'>(status0);
  let saving = $state(false);
  let saveError = $state('');
  let slugError = $state('');

  // AI 도구 부여(라벨): 현재 부여 상태를 로컬에 staged, 저장 시 일괄 동기화
  let grantedAiTools = $state<string[]>([]);
  let initialAiTools = $state<string[]>([]); // 로드 시점 스냅샷(dirty 비교/되돌리기용)
  let aiToolsLoading = $state(true);
  function toggleAiTool(key: string): void {
    grantedAiTools = grantedAiTools.includes(key)
      ? grantedAiTools.filter((k) => k !== key)
      : [...grantedAiTools, key];
  }

  // 집합 동일 여부(순서 무관): AI도구 부여 변경 감지
  function sameSet(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((x) => b.includes(x));
  }

  // 실제 변경이 있을 때만 저장/되돌리기 노출
  const dirty = $derived(
    name !== org.name ||
      slug !== org.slug ||
      status !== status0 ||
      profileImageUrl !== image0 ||
      logoFile !== null ||
      !sameSet(grantedAiTools, initialAiTools),
  );

  // 편집 내용을 로드 시점 상태로 되돌린다(저장 전 취소)
  function revert(): void {
    name = org.name;
    slug = org.slug;
    status = status0;
    profileImageUrl = image0;
    logoFile = null;
    grantedAiTools = [...initialAiTools];
    saveError = '';
    slugError = '';
  }

  // 삭제 / 복구
  let confirming = $state(false);
  let slugInput = $state('');
  let busy = $state(false);
  let deleteError = $state('');
  let recovering = $state(false);

  // ROOT 관리자 (조회 + 이름 수정 + 비밀번호 재설정)
  let rootLoading = $state(true);
  let rootError = $state('');
  let root = $state<RootAdminSummary | null>(null);
  // 이름 수정: 표시 이름이라 세션 무효화 없이 즉시 반영된다(본인도 워크스페이스 환경설정에서 바꿀 수 있다)
  let showNameEdit = $state(false);
  let rootName = $state('');
  let savingName = $state(false);
  let nameError = $state('');
  // 이메일 수정: 로그인 ID 라 저장 전에 중복 확인을 통과해야 한다. 조직유저 전체에서 유일하므로
  // 다른 조직이 쓰는 이메일도 사용할 수 없다. 바꿔도 세션은 유지된다.
  let showEmailEdit = $state(false);
  let rootEmail = $state('');
  let savingEmail = $state(false);
  let emailError = $state('');
  let checkingEmail = $state(false);
  /** 사용 가능으로 확인된 이메일. 입력이 이 값에서 벗어나면 확인은 자동으로 무효가 된다. */
  let checkedEmail = $state('');
  let emailNotice = $state<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const emailDirty = $derived(rootEmail.trim() !== (root?.email ?? ''));
  const emailVerified = $derived(!emailDirty || checkedEmail === rootEmail.trim());

  // 루트 관리자 변경: 이메일 수정과 다른 작업이다. 이메일 수정은 같은 사람의 로그인 ID 를 고치는 것이고,
  // 변경은 루트 자리를 다른 사람에게 넘긴다. 기존 조직원을 올리거나(이양), 계정이 없으면 새로 만든다(교체)
  let showRootChange = $state(false);
  let changeMode = $state<'member' | 'new'>('member');
  let members = $state<OrgMemberSummary[]>([]);
  let membersLoading = $state(false);
  let selectedMemberId = $state<number | null>(null);
  let confirmingChange = $state(false);
  let changing = $state(false);
  let changeError = $state('');
  let changeDone = $state('');
  // 신규 계정 입력(교체)
  let newRootEmail = $state('');
  let newRootName = $state('');
  let newRootPw = $state('');
  let checkingNewEmail = $state(false);
  let checkedNewEmail = $state('');
  let newEmailNotice = $state<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  /** 이양 대상: 그 조직의 활성 일반관리자만(루트 본인과 삭제된 계정 제외) */
  const transferCandidates = $derived(
    members.filter((m) => m.role === 'ADMIN' && m.status === 'ACTIVE'),
  );
  const newEmailVerified = $derived(
    newRootEmail.trim() !== '' && checkedNewEmail === newRootEmail.trim(),
  );
  const canTransfer = $derived(selectedMemberId !== null);
  const canReplace = $derived(
    newEmailVerified && newRootName.trim() !== '' && isPasswordValid(newRootPw),
  );
  let showReset = $state(false);
  let newPw = $state('');
  let newPw2 = $state('');
  let resetting = $state(false);
  let resetError = $state('');
  let resetDone = $state(false);

  const rootStatusLabel = $derived(root ? accountStatusLabel(root.status) : '');

  onMount(async () => {
    const [rootRes, aiRes] = await Promise.all([
      organizationsService.getRootAdmin(org.id),
      organizationsService.getAiTools(org.id),
    ]);
    if (rootRes.success) {
      root = rootRes.data;
    } else {
      rootError = rootRes.error ?? 'ROOT 관리자 정보를 불러오지 못했습니다.';
    }
    rootLoading = false;
    if (aiRes.success) {
      grantedAiTools = aiRes.data;
      initialAiTools = [...aiRes.data];
    }
    aiToolsLoading = false;
  });

  async function doSaveRootName(): Promise<void> {
    if (savingName) return;
    nameError = '';
    const next = rootName.trim();
    if (!next) {
      nameError = '이름을 입력하세요.';
      return;
    }
    if (next === root?.name) {
      showNameEdit = false;
      return;
    }
    savingName = true;
    try {
      const result = await organizationsService.updateRootAdmin(org.id, { name: next });
      if (!result.success) {
        nameError = result.error ?? '이름 수정에 실패했습니다.';
        return;
      }
      root = result.data;
      showNameEdit = false;
    } finally {
      savingName = false;
    }
  }

  function openEmailEdit(): void {
    rootEmail = root?.email ?? '';
    emailError = '';
    emailNotice = null;
    checkedEmail = '';
    showEmailEdit = true;
  }

  function onRootEmailInput(): void {
    // 값이 바뀌면 이전 확인 결과 표시는 지운다(통과 여부는 checkedEmail 비교로 이미 무효화된다)
    emailNotice = null;
    emailError = '';
  }

  async function doCheckRootEmail(): Promise<void> {
    if (checkingEmail) return;
    const value = rootEmail.trim();
    if (!isEmailValid(value)) {
      emailNotice = { tone: 'warn', text: '이메일 형식을 확인하세요.' };
      return;
    }
    checkingEmail = true;
    emailNotice = null;
    try {
      const result = await organizationsService.checkRootAdminEmail(org.id, value);
      if (!result.success) {
        emailNotice = { tone: 'warn', text: result.error ?? '이메일 확인에 실패했습니다.' };
        return;
      }
      if (result.data.available) {
        checkedEmail = value;
        emailNotice = { tone: 'ok', text: '사용할 수 있는 이메일입니다.' };
      } else {
        emailNotice = { tone: 'warn', text: '이미 사용 중인 이메일입니다.' };
      }
    } finally {
      checkingEmail = false;
    }
  }

  async function openRootChange(): Promise<void> {
    showRootChange = true;
    changeMode = 'member';
    changeError = '';
    changeDone = '';
    confirmingChange = false;
    selectedMemberId = null;
    newRootEmail = '';
    newRootName = '';
    newRootPw = '';
    checkedNewEmail = '';
    newEmailNotice = null;
    await loadMembers();
  }

  async function loadMembers(): Promise<void> {
    membersLoading = true;
    try {
      const result = await organizationsService.listOrgMembers(org.id);
      members = result.success ? result.data : [];
      if (!result.success) changeError = result.error ?? '조직 멤버를 불러오지 못했습니다.';
    } finally {
      membersLoading = false;
    }
  }

  async function doCheckNewRootEmail(): Promise<void> {
    if (checkingNewEmail) return;
    const value = newRootEmail.trim();
    if (!isEmailValid(value)) {
      newEmailNotice = { tone: 'warn', text: '이메일 형식을 확인하세요.' };
      return;
    }
    // 현재 루트의 주소는 사전 확인에서 자기 자신으로 취급되어 통과하지만, 새 계정으로는 쓸 수 없다.
    if (value === root?.email) {
      newEmailNotice = { tone: 'warn', text: '현재 루트 관리자가 쓰는 이메일입니다.' };
      return;
    }
    checkingNewEmail = true;
    newEmailNotice = null;
    try {
      const result = await organizationsService.checkRootAdminEmail(org.id, value);
      if (!result.success) {
        newEmailNotice = { tone: 'warn', text: result.error ?? '이메일 확인에 실패했습니다.' };
        return;
      }
      if (result.data.available) {
        checkedNewEmail = value;
        newEmailNotice = { tone: 'ok', text: '사용할 수 있는 이메일입니다.' };
      } else {
        newEmailNotice = { tone: 'warn', text: '이미 사용 중인 이메일입니다.' };
      }
    } finally {
      checkingNewEmail = false;
    }
  }

  /** 이양/교체 실행: 성공하면 루트 카드와 멤버 목록을 새 상태로 맞춘다. */
  async function doChangeRoot(): Promise<void> {
    if (changing) return;
    changing = true;
    changeError = '';
    try {
      const result =
        changeMode === 'member'
          ? await organizationsService.transferRootAdmin(org.id, selectedMemberId as number)
          : await organizationsService.replaceRootAdmin(org.id, {
              email: newRootEmail.trim(),
              name: newRootName.trim(),
              password: newRootPw,
            });
      if (!result.success) {
        if (result.errorCode === 'DUPLICATE_EMAIL') {
          checkedNewEmail = '';
          newEmailNotice = { tone: 'warn', text: '이미 사용 중인 이메일입니다.' };
        }
        changeError = result.error ?? '루트 관리자 변경에 실패했습니다.';
        return;
      }
      root = result.data;
      changeDone =
        changeMode === 'member'
          ? '루트 관리자를 넘겼습니다. 이전 루트 관리자는 일반관리자로 내려갔고 두 계정 모두 다시 로그인해야 합니다.'
          : '새 루트 관리자를 등록했습니다. 이전 루트 관리자는 일반관리자로 내려갔고 다시 로그인해야 합니다.';
      showRootChange = false;
      confirmingChange = false;
      await loadMembers();
    } finally {
      changing = false;
    }
  }

  async function doSaveRootEmail(): Promise<void> {
    if (savingEmail || !emailVerified) return;
    emailError = '';
    const next = rootEmail.trim();
    if (next === root?.email) {
      showEmailEdit = false;
      return;
    }
    savingEmail = true;
    try {
      const result = await organizationsService.updateRootAdmin(org.id, { email: next });
      if (!result.success) {
        // 확인 이후 다른 요청이 같은 이메일을 선점했을 수 있다(409). 확인 상태를 되돌린다.
        if (result.errorCode === 'DUPLICATE_EMAIL') {
          checkedEmail = '';
          emailNotice = { tone: 'warn', text: '이미 사용 중인 이메일입니다.' };
        }
        emailError = result.error ?? '이메일 수정에 실패했습니다.';
        return;
      }
      root = result.data;
      showEmailEdit = false;
    } finally {
      savingEmail = false;
    }
  }

  async function doResetPassword(): Promise<void> {
    if (resetting) return;
    resetError = '';
    resetDone = false;
    if (!isPasswordValid(newPw)) {
      resetError = '비밀번호 조건을 모두 충족해야 합니다.';
      return;
    }
    if (newPw !== newPw2) {
      resetError = '비밀번호가 일치하지 않습니다.';
      return;
    }
    resetting = true;
    try {
      const result = await organizationsService.resetRootPassword(org.id, newPw);
      if (!result.success) {
        resetError = result.error ?? '재설정에 실패했습니다.';
        return;
      }
      resetDone = true;
      newPw = '';
      newPw2 = '';
      showReset = false;
    } finally {
      resetting = false;
    }
  }

  async function doSave(): Promise<void> {
    if (saving) return;
    saveError = '';
    slugError = '';
    if (!name.trim()) {
      saveError = '조직명을 입력하세요.';
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      slugError = 'slug 은 소문자/숫자/하이픈만 허용합니다.';
      return;
    }
    saving = true;
    try {
      // 로고를 새로 골랐으면 이때(저장 시) 업로드: 선택 시엔 미리보기만 했다.
      if (logoFile) {
        profileImageUrl = await organizationsService.uploadLogo(logoFile);
      }
      const patch: UpdateOrganizationInput = {
        name: name.trim(),
        slug: slug.trim(),
        profileImageUrl,
        aiTools: grantedAiTools,
      };
      // WITHDRAWN(소프트 삭제) 조직은 저장이 상태를 되살리지 않게 status 를 싣지 않는다.
      // 복구는 위험구역의 명시적 '복구' 버튼으로만(편집 저장의 암묵 복구 부작용 제거)
      if (!isWithdrawn) {
        patch.status = status;
      }
      const result = await organizationsService.update(org.id, patch);
      if (!result.success) {
        if (result.errorCode === 'SLUG_TAKEN') slugError = '이미 사용 중인 slug 입니다.';
        saveError = result.error ?? '수정에 실패했습니다.';
        return;
      }
      postPopout({ type: 'org:changed' });
      window.close();
    } catch (e) {
      saveError = e instanceof Error ? e.message : '네트워크 오류로 실패했습니다.';
    } finally {
      saving = false;
    }
  }

  async function doDelete(mode: 'soft' | 'hard'): Promise<void> {
    if (busy) return;
    busy = true;
    deleteError = '';
    try {
      const result = await organizationsService.remove(org.id, mode);
      if (!result.success) {
        deleteError = result.error ?? '삭제에 실패했습니다.';
        return;
      }
      postPopout({ type: 'org:changed' });
      window.close();
    } finally {
      busy = false;
    }
  }

  // 복구: WITHDRAWN 조직을 ACTIVE 로 되돌린다(소프트 삭제 되돌리기, 데이터/스토리지 보존)
  async function doRecover(): Promise<void> {
    if (recovering) return;
    recovering = true;
    deleteError = '';
    try {
      const result = await organizationsService.recover(org.id);
      if (!result.success) {
        deleteError = result.error ?? '복구에 실패했습니다.';
        return;
      }
      postPopout({ type: 'org:changed' });
      window.close();
    } finally {
      recovering = false;
    }
  }
</script>

<div class="flex h-full flex-col">
    <!-- 편집 + 삭제 -->
    <div class="flex-1 space-y-4 overflow-auto p-5">
      <div class="flex items-center justify-between gap-2">
        <p class="truncate text-xs text-gray-400">조직 ID {org.id}, 생성 {formatDate(org.createdAt)}</p>
        <OrganizationStatusBadge status={org.status} />
      </div>

      <form
        id="edit-org-form"
        class="space-y-4"
        onsubmit={(e) => {
          e.preventDefault();
          doSave();
        }}
      >
        {#if saveError}
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
        {/if}

        <div>
          <span class="mb-1 block text-sm font-medium text-gray-700">조직 로고</span>
          <OrganizationImagePicker
            bind:value={profileImageUrl}
            displayUrl={org.profileImageUrl}
            bind:file={logoFile}
            {name}
          />
        </div>

        <div>
          <label for="edit-name" class="mb-1 block text-sm font-medium text-gray-700">조직명</label>
          <input
            id="edit-name"
            bind:value={name}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>

        <div>
          <label for="edit-slug" class="mb-1 block text-sm font-medium text-gray-700">slug</label>
          <input
            id="edit-slug"
            bind:value={slug}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {#if slugError}<p class="mt-1 text-xs text-red-600">{slugError}</p>{/if}
        </div>

        {#if !isWithdrawn}
          <div>
            <label for="edit-status" class="mb-1 block text-sm font-medium text-gray-700">상태</label>
            <select
              id="edit-status"
              bind:value={status}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="ACTIVE">활성</option>
              <option value="SUSPENDED">정지</option>
            </select>
            {#if status === 'SUSPENDED'}
              <p class="mt-1 text-xs text-gray-500">정지하면 이 조직 사용자의 로그인이 차단됩니다.</p>
            {/if}
          </div>
        {:else}
          <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            이 조직은 삭제(WITHDRAWN)된 상태입니다. 다시 사용하려면 아래 위험 구역에서 <b>복구</b>하세요.
            편집 저장은 상태를 되살리지 않습니다.
          </p>
        {/if}

        <!-- AI 도구: 개별 부여(PER_ORG)는 토글 후 저장 시 일괄 반영, 공통 제공(COMMON)은 전 조직 자동이라 읽기전용 배지 -->
        <div>
          <span class="mb-1 block text-sm font-medium text-gray-700">AI 도구</span>
          {#if aiToolsLoading}
            <p class="text-sm text-gray-400">불러오는 중…</p>
          {:else}
            {#if perOrgTools.length === 0 && commonTools.length === 0}
              <p class="text-sm text-gray-400">등록된 AI 도구가 없습니다.</p>
            {/if}

            {#if perOrgTools.length > 0}
              <div class="flex flex-wrap gap-2">
                {#each perOrgTools as tool (tool.key)}
                  {@const granted = grantedAiTools.includes(tool.key)}
                  <button
                    type="button"
                    onclick={() => toggleAiTool(tool.key)}
                    aria-pressed={granted}
                    title={tool.description ?? undefined}
                    class="rounded-full border px-3 py-1 text-sm transition-colors {granted
                      ? 'border-brand bg-brand text-white'
                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}"
                  >
                    {tool.name}
                  </button>
                {/each}
              </div>
              <p class="mt-1 text-xs text-gray-500">선택한 AI 도구가 이 조직에 부여됩니다. 저장 시 반영됩니다.</p>
            {/if}

            {#if commonTools.length > 0}
              <!-- 공통 제공(COMMON): 전 조직 자동 제공이라 토글 불가. 읽기전용 배지로 존재만 표시 -->
              <div class="mt-3">
                <span class="mb-1 block text-xs font-medium text-gray-500">공통 제공 (전 조직 자동)</span>
                <div class="flex flex-wrap gap-2">
                  {#each commonTools as tool (tool.key)}
                    <span
                      title={tool.description ?? undefined}
                      class="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-500"
                    >
                      <svg class="h-3.5 w-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                      {tool.name}
                    </span>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      </form>

      <!-- ROOT 관리자 (조회 + 비밀번호 재설정) -->
      <div class="rounded-lg border border-gray-200 p-3">
        <p class="mb-2 text-xs font-semibold text-gray-700">ROOT 관리자</p>

        {#if rootLoading}
          <p class="text-sm text-gray-400">불러오는 중…</p>
        {:else if rootError}
          <p class="text-sm text-red-600">{rootError}</p>
        {:else if root}
          <dl class="space-y-1 text-sm">
            <div class="flex justify-between gap-2">
              <dt class="shrink-0 text-gray-500">이메일</dt>
              <dd class="flex min-w-0 items-center gap-2">
                {#if showEmailEdit}
                  <input
                    type="email"
                    bind:value={rootEmail}
                    oninput={onRootEmailInput}
                    autocomplete="off"
                    placeholder="이메일"
                    class="w-44 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  <!-- 중복 확인을 통과해야 저장이 열린다(변경한 이메일 한정) -->
                  <button
                    type="button"
                    disabled={checkingEmail || !emailDirty}
                    onclick={doCheckRootEmail}
                    class="shrink-0 text-sm font-medium text-gray-600 hover:underline disabled:opacity-50"
                  >
                    {checkingEmail ? '확인 중…' : '중복 확인'}
                  </button>
                  <button
                    type="button"
                    disabled={savingEmail || !emailVerified}
                    onclick={doSaveRootEmail}
                    class="shrink-0 text-sm font-medium text-brand hover:underline disabled:opacity-50"
                  >
                    {savingEmail ? '저장 중…' : '저장'}
                  </button>
                  <button
                    type="button"
                    onclick={() => {
                      showEmailEdit = false;
                      emailError = '';
                      emailNotice = null;
                    }}
                    class="shrink-0 text-sm text-gray-500 hover:underline"
                  >
                    취소
                  </button>
                {:else}
                  <span class="truncate font-medium text-gray-800">{root.email}</span>
                  <button
                    type="button"
                    onclick={openEmailEdit}
                    class="shrink-0 text-sm font-medium text-brand hover:underline"
                  >
                    수정
                  </button>
                {/if}
              </dd>
            </div>
            {#if showEmailEdit && (emailNotice || emailDirty)}
              <p
                class="text-xs {emailNotice?.tone === 'ok' ? 'text-green-600' : emailNotice ? 'text-red-600' : 'text-gray-500'}"
              >
                {emailNotice ? emailNotice.text : '중복 확인을 해야 저장할 수 있습니다.'}
              </p>
            {/if}
            {#if emailError}
              <p class="text-xs text-red-600">{emailError}</p>
            {/if}
            <div class="flex justify-between gap-2">
              <dt class="shrink-0 text-gray-500">이름</dt>
              <dd class="flex min-w-0 items-center gap-2">
                {#if showNameEdit}
                  <input
                    type="text"
                    bind:value={rootName}
                    maxlength="100"
                    placeholder="이름"
                    class="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                    onkeydown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        doSaveRootName();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={savingName}
                    onclick={doSaveRootName}
                    class="shrink-0 text-sm font-medium text-brand hover:underline disabled:opacity-60"
                  >
                    {savingName ? '저장 중…' : '저장'}
                  </button>
                  <button
                    type="button"
                    onclick={() => {
                      showNameEdit = false;
                      nameError = '';
                    }}
                    class="shrink-0 text-sm text-gray-500 hover:underline"
                  >
                    취소
                  </button>
                {:else}
                  <span class="truncate text-gray-800">{root.name}</span>
                  <button
                    type="button"
                    onclick={() => {
                      rootName = root?.name ?? '';
                      nameError = '';
                      showNameEdit = true;
                    }}
                    class="shrink-0 text-sm font-medium text-brand hover:underline"
                  >
                    수정
                  </button>
                {/if}
              </dd>
            </div>
            {#if nameError}
              <p class="text-xs text-red-600">{nameError}</p>
            {/if}
            <div class="flex justify-between gap-2">
              <dt class="shrink-0 text-gray-500">상태</dt>
              <dd class="text-gray-800">{rootStatusLabel}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="shrink-0 text-gray-500">마지막 로그인</dt>
              <dd class="text-gray-800">{root.lastLoginAt ? formatDate(root.lastLoginAt) : '없음'}</dd>
            </div>
          </dl>

          {#if changeDone}
            <p class="mt-2 rounded-md bg-green-50 px-2.5 py-1.5 text-xs text-green-700">
              {changeDone}
            </p>
          {/if}

          <!-- 루트 관리자 변경: 기존 조직원에게 넘기거나, 계정이 없으면 새로 만들어 지정한다. -->
          {#if !showRootChange}
            <button
              type="button"
              onclick={openRootChange}
              class="mt-2 mr-3 text-sm font-medium text-brand hover:underline"
            >
              루트 관리자 변경
            </button>
          {:else}
            <div class="mt-2 space-y-2 rounded-lg border border-gray-200 p-3">
              <div class="flex gap-3 text-sm">
                <label class="flex items-center gap-1.5">
                  <input type="radio" value="member" bind:group={changeMode} class="accent-brand" />
                  기존 조직원 지정
                </label>
                <label class="flex items-center gap-1.5">
                  <input type="radio" value="new" bind:group={changeMode} class="accent-brand" />
                  새 계정 추가
                </label>
              </div>

              {#if changeMode === 'member'}
                {#if membersLoading}
                  <p class="text-xs text-gray-400">멤버를 불러오는 중…</p>
                {:else if transferCandidates.length === 0}
                  <p class="text-xs text-gray-500">
                    넘길 수 있는 조직원이 없습니다. 새 계정 추가로 지정하세요.
                  </p>
                {:else}
                  <select
                    bind:value={selectedMemberId}
                    class="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    <option value={null}>대상을 선택하세요</option>
                    {#each transferCandidates as m (m.id)}
                      <option value={m.id}>{m.name} ({m.email})</option>
                    {/each}
                  </select>
                  <p class="text-xs text-gray-500">
                    대상의 부서와 권한, 활동 이력은 그대로 유지됩니다. 기존 루트 관리자는 일반관리자로
                    내려가며, 대표 직책을 갖고 있었다면 함께 해임되어 루트 권한이 회수됩니다.
                  </p>
                {/if}
              {:else}
                <div class="flex gap-2">
                  <input
                    type="email"
                    bind:value={newRootEmail}
                    oninput={() => {
                      newEmailNotice = null;
                    }}
                    placeholder="이메일(로그인 ID)"
                    autocomplete="off"
                    class="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  <button
                    type="button"
                    onclick={doCheckNewRootEmail}
                    disabled={checkingNewEmail || newRootEmail.trim() === ''}
                    class="shrink-0 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {checkingNewEmail ? '확인 중…' : '중복 확인'}
                  </button>
                </div>
                {#if newEmailNotice}
                  <p class="text-xs {newEmailNotice.tone === 'ok' ? 'text-green-600' : 'text-red-600'}">
                    {newEmailNotice.text}
                  </p>
                {:else if newRootEmail.trim() !== ''}
                  <p class="text-xs text-gray-500">중복 확인을 해야 등록할 수 있습니다.</p>
                {/if}
                <input
                  type="text"
                  bind:value={newRootName}
                  maxlength="100"
                  placeholder="이름"
                  class="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <input
                  type="password"
                  bind:value={newRootPw}
                  placeholder="초기 비밀번호"
                  autocomplete="new-password"
                  class="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <PasswordChecklist password={newRootPw} />
              {/if}

              {#if changeError}
                <p class="text-xs text-red-600">{changeError}</p>
              {/if}

              {#if confirmingChange}
                <div class="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-2.5 py-2">
                  <span class="text-xs text-amber-800">
                    루트 관리자를 변경합니다. 기존 루트 관리자는 일반관리자로 내려가고(대표였다면 직책도
                    해임됩니다) 두 계정 모두 다시 로그인해야 합니다.
                  </span>
                  <div class="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onclick={() => (confirmingChange = false)}
                      class="rounded-md border border-gray-300 px-2.5 py-1 text-sm text-gray-700 hover:bg-white"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onclick={doChangeRoot}
                      disabled={changing}
                      class="rounded-md bg-brand px-2.5 py-1 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
                    >
                      {changing ? '변경 중…' : '변경 확인'}
                    </button>
                  </div>
                </div>
              {:else}
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    onclick={() => {
                      showRootChange = false;
                      changeError = '';
                    }}
                    class="rounded-md px-2.5 py-1 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onclick={() => (confirmingChange = true)}
                    disabled={changeMode === 'member' ? !canTransfer : !canReplace}
                    class="rounded-md bg-brand px-2.5 py-1 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    변경
                  </button>
                </div>
              {/if}
            </div>
          {/if}

          {#if resetDone}
            <p class="mt-2 rounded-md bg-green-50 px-2.5 py-1.5 text-xs text-green-700">
              비밀번호가 재설정되었습니다. 이 관리자의 기존 로그인 세션은 모두 무효화됩니다.
            </p>
          {/if}
          {#if resetError}
            <p class="mt-2 text-xs text-red-600">{resetError}</p>
          {/if}

          {#if !showReset}
            <button
              type="button"
              onclick={() => {
                showReset = true;
                resetDone = false;
              }}
              class="mt-2 text-sm font-medium text-brand hover:underline"
            >
              비밀번호 재설정
            </button>
          {:else}
            <form
              class="mt-2 space-y-2"
              onsubmit={(e) => {
                e.preventDefault();
                doResetPassword();
              }}
            >
              <input
                type="password"
                bind:value={newPw}
                placeholder="새 비밀번호"
                autocomplete="new-password"
                class="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 {isPasswordValid(newPw)
                  ? 'border-green-500 focus:border-green-500 focus:ring-green-500/30'
                  : 'border-gray-300 focus:border-brand focus:ring-brand/30'}"
              />
              <PasswordChecklist password={newPw} />
              <input
                type="password"
                bind:value={newPw2}
                placeholder="새 비밀번호 확인"
                autocomplete="new-password"
                class="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  onclick={() => {
                    showReset = false;
                    newPw = '';
                    newPw2 = '';
                    resetError = '';
                  }}
                  class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  class="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
                >
                  {resetting ? '재설정 중…' : '재설정'}
                </button>
              </div>
            </form>
          {/if}
        {/if}
      </div>

      <!-- 위험 구역 (삭제) -->
      <div class="rounded-lg border border-red-200 bg-red-50/40 p-3">
        <p class="mb-2 text-xs font-semibold text-red-700">위험 구역</p>
        {#if deleteError}
          <p class="mb-2 text-sm text-red-600">{deleteError}</p>
        {/if}

        {#if !isWithdrawn}
          {#if !confirming}
            <button type="button" onclick={() => (confirming = true)} class="text-sm font-medium text-red-600 hover:underline">
              조직 삭제
            </button>
          {:else}
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-gray-600">삭제하면 사용자 로그인이 차단됩니다(복구 가능).</span>
              <div class="flex shrink-0 gap-2">
                <button type="button" onclick={() => (confirming = false)} class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">취소</button>
                <button type="button" onclick={() => doDelete('soft')} disabled={busy} class="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-60">
                  {busy ? '삭제 중…' : '삭제 확인'}
                </button>
              </div>
            </div>
          {/if}
        {:else}
          <!-- 복구: 소프트 삭제 되돌리기(데이터/스토리지 보존). 영구 삭제와 분리해 명시적으로 노출 -->
          <div class="mb-3 flex items-center justify-between gap-3 border-b border-red-200 pb-3">
            <span class="text-xs text-gray-600">이 조직을 다시 활성 상태로 되돌립니다.</span>
            <button
              type="button"
              onclick={doRecover}
              disabled={recovering}
              class="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
            >
              {recovering ? '복구 중…' : '복구'}
            </button>
          </div>
          <p class="mb-1.5 text-xs text-gray-600">영구 삭제하려면 slug <b class="text-gray-800">{org.slug}</b> 를 입력하세요. 되돌릴 수 없습니다.</p>
          <div class="flex gap-2">
            <input bind:value={slugInput} placeholder={org.slug} class="min-w-0 flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
            <button type="button" onclick={() => doDelete('hard')} disabled={busy || slugInput !== org.slug} class="shrink-0 rounded-md bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? '삭제 중…' : '영구 삭제'}
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- 되돌리기(취소) + 저장: 항상 노출하되 변경이 없으면 비활성화 -->
    <footer class="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-3">
      <button
        type="button"
        onclick={revert}
        disabled={saving || !dirty}
        class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        되돌리기
      </button>
      <button
        type="submit"
        form="edit-org-form"
        disabled={saving || !dirty}
        class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? '저장 중…' : '저장'}
      </button>
    </footer>
</div>

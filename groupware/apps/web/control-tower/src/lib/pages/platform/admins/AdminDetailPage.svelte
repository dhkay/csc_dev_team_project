<script lang="ts">
  import { untrack } from 'svelte';
  import { postPopout } from '$lib/shared/lib/popout/popoutChannel';
  import { formatDate } from '$lib/features/organizations/lib/date';
  import { adminsService } from '$lib/features/admins/services/admins.service';
  import { accountStatusLabel } from '$lib/shared/lib/utils/accountStatus';
  import { isEmailValid } from '$lib/shared/lib/utils/emailPolicy';
  import type { AdminSummary, AdminFeatureCatalogItem } from '$lib/features/admins/types';
  import AdminOptionChips from './components/AdminOptionChips.svelte';

  // 관리자 상세: 팝아웃 페이지 내용. 이름/이메일 편집 + 옵션 일괄 저장 + 삭제
  // admin/features/catalog 는 [adminId]/+page.server.ts load 가 내려준 값
  let {
    admin,
    catalog,
    features,
  }: {
    admin: AdminSummary;
    catalog: AdminFeatureCatalogItem[];
    features: string[];
  } = $props();

  const isRoot = $derived(admin.role === 'ROOT');

  // 표시 이름: 저장 성공 시 baseline 을 갱신해 dirty 를 리셋한다(팝아웃은 닫지 않고 유지)
  let name = $state(untrack(() => admin.name));
  let baseName = $state(untrack(() => admin.name));

  // 이메일(로그인 ID): 루트관리자는 변경 불가. 바꾼 경우 중복 확인을 통과해야 저장이 열린다.
  let email = $state(untrack(() => admin.email));
  let baseEmail = $state(untrack(() => admin.email));
  let checkingEmail = $state(false);
  /** 사용 가능으로 확인된 이메일. 입력이 이 값에서 벗어나면 확인은 자동으로 무효가 된다. */
  let checkedEmail = $state('');
  let emailNotice = $state<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  // 옵션: 현재 부여 상태를 staged, 저장 시 일괄 동기화
  let selected = $state<string[]>(untrack(() => [...features]));
  let baseFeatures = $state<string[]>(untrack(() => [...features]));

  let saving = $state(false);
  let saveError = $state('');
  let saveDone = $state(false);

  // 집합 동일 여부(순서 무관)
  function sameSet(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((x) => b.includes(x));
  }

  const nameDirty = $derived(name.trim() !== baseName);
  const emailDirty = $derived(!isRoot && email.trim() !== baseEmail);
  const featuresDirty = $derived(!isRoot && !sameSet(selected, baseFeatures));
  const dirty = $derived(nameDirty || emailDirty || featuresDirty);
  /** 이메일을 바꿨다면 지금 입력값 그대로 중복 확인을 통과했을 때만 저장을 연다. */
  const emailVerified = $derived(!emailDirty || checkedEmail === email.trim());

  function toggle(key: string): void {
    selected = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    saveDone = false;
  }

  function onEmailInput(): void {
    // 값이 바뀌면 이전 확인 결과 표시는 지운다(통과 여부 자체는 checkedEmail 비교로 이미 무효화된다)
    emailNotice = null;
    saveDone = false;
  }

  async function doCheckEmail(): Promise<void> {
    if (checkingEmail || isRoot) return;
    const value = email.trim();
    if (!isEmailValid(value)) {
      emailNotice = { tone: 'warn', text: '이메일 형식을 확인하세요.' };
      return;
    }
    checkingEmail = true;
    emailNotice = null;
    try {
      const r = await adminsService.checkEmail(value, admin.id);
      if (!r.success) {
        emailNotice = { tone: 'warn', text: r.error ?? '이메일 확인에 실패했습니다.' };
        return;
      }
      if (r.data.available) {
        checkedEmail = value;
        emailNotice = { tone: 'ok', text: '사용할 수 있는 이메일입니다.' };
      } else {
        emailNotice = { tone: 'warn', text: '이미 사용 중인 이메일입니다.' };
      }
    } catch (e) {
      emailNotice = { tone: 'warn', text: e instanceof Error ? e.message : '이메일 확인에 실패했습니다.' };
    } finally {
      checkingEmail = false;
    }
  }

  // 삭제
  let confirming = $state(false);
  let busy = $state(false);
  let deleteError = $state('');

  async function doSave(): Promise<void> {
    if (saving || !dirty || !emailVerified) return;
    saving = true;
    saveError = '';
    saveDone = false;
    try {
      if (nameDirty && name.trim().length === 0) {
        saveError = '이름을 입력하세요.';
        return;
      }
      if (nameDirty || emailDirty) {
        const r = await adminsService.update(admin.id, {
          ...(nameDirty ? { name: name.trim() } : {}),
          ...(emailDirty ? { email: email.trim() } : {}),
        });
        if (!r.success) {
          // 중복 확인 이후 다른 요청이 같은 이메일을 선점했을 수 있다(409). 확인 상태를 되돌린다.
          if (r.errorCode === 'DUPLICATE_EMAIL') {
            checkedEmail = '';
            emailNotice = { tone: 'warn', text: '이미 사용 중인 이메일입니다.' };
          }
          saveError = r.error ?? '프로필 저장에 실패했습니다.';
          return;
        }
        name = name.trim();
        baseName = name;
        email = email.trim();
        baseEmail = email;
        emailNotice = null;
      }
      if (featuresDirty) {
        const r = await adminsService.setFeatures(admin.id, selected);
        if (!r.success) {
          saveError = r.error ?? '옵션 저장에 실패했습니다.';
          return;
        }
        baseFeatures = [...selected];
      }
      postPopout({ type: 'admin:changed' });
      saveDone = true;
    } catch (e) {
      saveError = e instanceof Error ? e.message : '네트워크 오류로 실패했습니다.';
    } finally {
      saving = false;
    }
  }

  async function doDelete(): Promise<void> {
    if (busy) return;
    busy = true;
    deleteError = '';
    try {
      const result = await adminsService.remove(admin.id);
      if (!result.success) {
        deleteError = result.error ?? '삭제에 실패했습니다.';
        return;
      }
      postPopout({ type: 'admin:changed' });
      window.close();
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex-1 space-y-4 overflow-auto p-5">
    <!-- 역할 + 이름/이메일 편집 -->
    <div class="space-y-3">
      <span
        class="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold {isRoot
          ? 'bg-amber-100 text-amber-700'
          : 'bg-gray-100 text-gray-600'}"
      >
        {isRoot ? '루트' : '일반'}
      </span>
      <div>
        <label for="admin-name" class="mb-1 block text-sm font-medium text-gray-700">이름</label>
        <input
          id="admin-name"
          bind:value={name}
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <div>
        <label for="admin-email" class="mb-1 block text-sm font-medium text-gray-700">
          이메일 <span class="font-normal text-gray-400">(로그인 ID)</span>
        </label>
        <div class="flex gap-2">
          <input
            id="admin-email"
            type="email"
            bind:value={email}
            oninput={onEmailInput}
            disabled={isRoot}
            autocomplete="off"
            class="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-gray-100 disabled:text-gray-500"
          />
          {#if !isRoot}
            <!-- 중복 확인을 통과해야 저장이 열린다(변경한 이메일 한정) -->
            <button
              type="button"
              onclick={doCheckEmail}
              disabled={checkingEmail || !emailDirty}
              class="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checkingEmail ? '확인 중…' : '중복 확인'}
            </button>
          {/if}
        </div>
        {#if isRoot}
          <p class="mt-1 text-xs text-gray-500">루트 관리자의 이메일은 변경할 수 없습니다.</p>
        {:else if emailNotice}
          <p class="mt-1 text-xs {emailNotice.tone === 'ok' ? 'text-green-600' : 'text-red-600'}">
            {emailNotice.text}
          </p>
        {:else if emailDirty}
          <p class="mt-1 text-xs text-gray-500">중복 확인을 해야 저장할 수 있습니다.</p>
        {/if}
      </div>
    </div>

    <dl class="space-y-1 rounded-lg border border-gray-200 p-3 text-sm">
      <div class="flex justify-between gap-2">
        <dt class="shrink-0 text-gray-500">상태</dt>
        <dd class="text-gray-800">{accountStatusLabel(admin.status)}</dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt class="shrink-0 text-gray-500">마지막 로그인</dt>
        <dd class="text-gray-800">{admin.lastLoginAt ? formatDate(admin.lastLoginAt) : '없음'}</dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt class="shrink-0 text-gray-500">가입</dt>
        <dd class="text-gray-800">{formatDate(admin.createdAt)}</dd>
      </div>
    </dl>

    <!-- 관리 영역 옵션 -->
    <div>
      <span class="mb-1 block text-sm font-medium text-gray-700">관리 영역 옵션</span>
      {#if isRoot}
        <p class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          루트 관리자는 모든 관리 영역에 접근합니다. 옵션을 따로 부여할 필요가 없습니다.
        </p>
      {:else}
        <AdminOptionChips {catalog} {selected} ontoggle={toggle} />
      {/if}
    </div>

    {#if saveError}
      <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
    {/if}
    {#if saveDone}
      <p class="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">저장되었습니다.</p>
    {/if}

    {#if !isRoot}
      <!-- 위험 구역 (삭제) -->
      <div class="rounded-lg border border-red-200 bg-red-50/40 p-3">
        <p class="mb-2 text-xs font-semibold text-red-700">위험 구역</p>
        {#if deleteError}
          <p class="mb-2 text-sm text-red-600">{deleteError}</p>
        {/if}
        {#if !confirming}
          <button type="button" onclick={() => (confirming = true)} class="text-sm font-medium text-red-600 hover:underline">
            관리자 삭제
          </button>
        {:else}
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs text-gray-600">삭제하면 이 관리자의 로그인이 차단됩니다.</span>
            <div class="flex shrink-0 gap-2">
              <button type="button" onclick={() => (confirming = false)} class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">취소</button>
              <button type="button" onclick={doDelete} disabled={busy} class="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-60">
                {busy ? '삭제 중…' : '삭제 확인'}
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- 닫기 + 저장: 항상 노출하되 변경이 없으면 비활성화 -->
  <footer class="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-3">
    <button
      type="button"
      onclick={() => window.close()}
      class="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
    >
      닫기
    </button>
    <button
      type="button"
      onclick={doSave}
      disabled={saving || !dirty || !emailVerified}
      class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving ? '저장 중…' : '저장'}
    </button>
  </footer>
</div>

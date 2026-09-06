<script lang="ts">
  import { untrack } from 'svelte';
  import { postPopout } from '$lib/shared/lib/popout/popoutChannel';
  import { membersService } from '$lib/features/members/services/members.service';
  import type { MemberSummary, UpdateMemberInput } from '$lib/features/members/types';
  import { flattenDepartments, type Department } from '$lib/features/departments/types';
  import { isPasswordValid } from '$lib/shared/lib/utils/passwordPolicy';
  import PasswordChecklist from '$lib/shared/ui/controls/PasswordChecklist.svelte';

  // 일반관리자 상세: 팝아웃 페이지 내용. 이름/소속/연락처 편집(하단 저장/되돌리기 일괄) + 비밀번호 재설정 + 삭제
  // 이메일은 로그인 식별자라 읽기전용. member/departments 는 [memberId]/+page.server.ts load 값
  // 창 닫기는 팝아웃 창 자체(OS/브라우저)의 닫기로: 별도 닫기 버튼 없음
  interface Props {
    member: MemberSummary;
    departments?: Department[];
  }
  let { member, departments = [] }: Props = $props();
  const deptOptions = $derived(flattenDepartments(departments));

  const STATUS_LABEL: Record<string, string> = {
    ACTIVE: '활성',
    LOCKED: '잠금',
    INACTIVE: '비활성',
    WITHDRAWN: '탈퇴',
  };

  function formatDate(iso: string | null): string {
    if (!iso) return '없음';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '없음' : d.toLocaleString('ko-KR');
  }

  // 편집 필드(이름/로그인이메일/소속/연락처): baseline 대비 dirty 추적, 하단 저장 바로 일괄 반영
  //
  // 값은 마운트 시점 스냅샷을 의도적으로 잡는다(untrack). 이 팝아웃은 저장 성공 시 baseline 을
  //   스스로 옮기고, props 가 갱신된 채로 살아 있는 상태가 없다(창을 닫는다). untrack 이 없으면
  //   컴파일러가 "초기값만 잡힌다"고 경고하는데, 여기서는 그게 바로 원하는 동작이다.
  let name = $state(untrack(() => member.name));
  let baseName = $state(untrack(() => member.name));
  const nameDirty = $derived(name.trim() !== baseName && name.trim().length > 0);

  // 이메일은 표시 정보가 아니라 로그인 ID 다. 바꾸면 이전 주소로는 로그인할 수 없다.
  //   형식/중복 최종 판정은 서버(user DTO + 조직 내 UNIQUE)이고, 여기선 빈값과 무변경만 걸러낸다.
  let email = $state(untrack(() => member.email));
  let baseEmail = $state(untrack(() => member.email));
  const emailDirty = $derived(email.trim() !== baseEmail && email.trim().length > 0);

  let departmentId = $state<number | null>(untrack(() => member.departmentId));
  let baseDepartmentId = $state<number | null>(untrack(() => member.departmentId));
  const deptDirty = $derived(departmentId !== baseDepartmentId);

  let phone = $state(untrack(() => member.phone ?? ''));
  let basePhone = $state(untrack(() => member.phone ?? ''));
  let extension = $state(untrack(() => member.extension ?? ''));
  let baseExtension = $state(untrack(() => member.extension ?? ''));
  const contactDirty = $derived(phone !== basePhone || extension !== baseExtension);

  const dirty = $derived(nameDirty || emailDirty || deptDirty || contactDirty);
  let saving = $state(false);
  let saveError = $state('');
  let saved = $state(false);

  /** 변경된 필드만 모아 한 번의 PATCH 로 저장(BFF 가 dirty 한 필드만 반영) */
  async function saveAll(): Promise<void> {
    if (saving || !dirty) return;
    saving = true;
    saveError = '';
    saved = false;
    try {
      const patch: UpdateMemberInput = {};
      if (nameDirty) patch.name = name.trim();
      if (emailDirty) patch.email = email.trim();
      if (deptDirty) patch.departmentId = departmentId;
      if (contactDirty) {
        patch.phone = phone.trim() || null; // 빈값 = 비움(null)
        patch.extension = extension.trim() || null;
      }
      const r = await membersService.update(member.id, patch);
      if (!r.success) {
        // 이름은 동명이인을 허용하므로 중복 안내는 이메일(로그인 ID)뿐이다.
        saveError =
          r.errorCode === 'DUPLICATE_EMAIL'
            ? '이미 사용 중인 이메일입니다.'
            : (r.error ?? '저장에 실패했습니다.');
        return;
      }
      // baseline 갱신 → dirty 해제(저장 바 비활성), 팝아웃 목록 새로고침 알림
      if (nameDirty) name = name.trim();
      if (emailDirty) email = email.trim();
      if (contactDirty) {
        phone = phone.trim();
        extension = extension.trim();
      }
      baseName = name;
      baseEmail = email;
      baseDepartmentId = departmentId;
      basePhone = phone;
      baseExtension = extension;
      saved = true;
      postPopout({ type: 'member:changed' });
    } finally {
      saving = false;
    }
  }

  /** 편집 중인 값을 baseline(마지막 저장 상태)으로 되돌린다. */
  function revert(): void {
    name = baseName;
    departmentId = baseDepartmentId;
    phone = basePhone;
    extension = baseExtension;
    saveError = '';
    saved = false;
  }

  // 비밀번호 재설정(별도 액션)
  let showReset = $state(false);
  let newPw = $state('');
  let newPw2 = $state('');
  let resetting = $state(false);
  let resetError = $state('');
  let resetDone = $state(false);

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
      const r = await membersService.update(member.id, { password: newPw });
      if (!r.success) {
        resetError = r.error ?? '재설정에 실패했습니다.';
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

  // 삭제(별도 액션)
  let confirming = $state(false);
  let busy = $state(false);
  let deleteError = $state('');

  async function doDelete(): Promise<void> {
    if (busy) return;
    busy = true;
    deleteError = '';
    try {
      const r = await membersService.remove(member.id);
      if (!r.success) {
        deleteError = r.error ?? '삭제에 실패했습니다.';
        return;
      }
      postPopout({ type: 'member:changed' });
      window.close();
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex-1 space-y-4 overflow-auto p-5">
    <!-- 역할(읽기전용) + 이름/로그인이메일 편집 -->
    <div class="space-y-3">
      <span class="inline-block rounded bg-[#eeeff0] px-1.5 py-0.5 text-[11px] font-semibold text-gray-700">
        일반관리자
      </span>
      <div>
        <label for="member-email" class="mb-1 block text-sm font-medium text-gray-700">
          로그인 이메일
        </label>
        <input
          id="member-email"
          bind:value={email}
          type="email"
          autocomplete="off"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
          onkeydown={(e) => e.key === 'Enter' && saveAll()}
        />
        {#if emailDirty}
          <p class="mt-1 text-xs text-amber-700">
            저장하면 이 계정의 로그인 주소가 바뀝니다. 이전 주소로는 로그인할 수 없고, 소셜 로그인도
            새 주소의 계정에 연결됩니다. 본인에게 반드시 알려주세요.
          </p>
        {/if}
      </div>
      <div>
        <label for="member-name" class="mb-1 block text-sm font-medium text-gray-700">이름</label>
        <input
          id="member-name"
          bind:value={name}
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
          onkeydown={(e) => e.key === 'Enter' && saveAll()}
        />
      </div>

      <!-- 소속 부서 -->
      <div>
        <label for="member-dept" class="mb-1 block text-sm font-medium text-gray-700">소속</label>
        <select
          id="member-dept"
          bind:value={departmentId}
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
        >
          <option value={null}>미배치</option>
          {#each deptOptions as opt (opt.id)}
            <option value={opt.id}>{'　'.repeat(opt.depth)}{opt.name}</option>
          {/each}
        </select>
      </div>

      <!-- 연락처(전화번호/사내번호): 선택, 공란 가능 -->
      <div>
        <span class="mb-1 block text-sm font-medium text-gray-700">연락처</span>
        <div class="grid grid-cols-2 gap-2">
          <input
            bind:value={phone}
            type="tel"
            placeholder="전화번호 (선택)"
            aria-label="전화번호"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
          />
          <input
            bind:value={extension}
            type="text"
            placeholder="사내번호 (선택)"
            aria-label="사내번호"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
          />
        </div>
      </div>
    </div>

    <dl class="space-y-1 rounded-lg border border-gray-200 p-3 text-sm">
      <div class="flex justify-between gap-2">
        <dt class="shrink-0 text-gray-500">상태</dt>
        <dd class="text-gray-800">{STATUS_LABEL[member.status] ?? member.status}</dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt class="shrink-0 text-gray-500">마지막 로그인</dt>
        <dd class="text-gray-800">{formatDate(member.lastLoginAt)}</dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt class="shrink-0 text-gray-500">가입</dt>
        <dd class="text-gray-800">{formatDate(member.createdAt)}</dd>
      </div>
    </dl>

    <!-- 비밀번호 재설정 -->
    <div class="rounded-lg border border-gray-200 p-3">
      <p class="mb-2 text-xs font-semibold text-gray-700">비밀번호</p>
      {#if resetDone}
        <p class="mb-2 rounded-md bg-green-50 px-2.5 py-1.5 text-xs text-green-700">
          비밀번호가 재설정되었습니다. 이 관리자의 기존 로그인 세션은 모두 무효화됩니다.
        </p>
      {/if}
      {#if resetError}
        <p class="mb-2 text-xs text-red-600">{resetError}</p>
      {/if}

      {#if !showReset}
        <button
          type="button"
          onclick={() => {
            showReset = true;
            resetDone = false;
          }}
          class="text-sm font-medium text-[#1868db] hover:underline"
        >
          비밀번호 재설정
        </button>
      {:else}
        <form
          class="space-y-2"
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
            class="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none {isPasswordValid(newPw)
              ? 'border-green-500 focus:border-green-500'
              : 'border-gray-300 focus:border-[#1868db]'}"
          />
          <PasswordChecklist password={newPw} />
          <input
            type="password"
            bind:value={newPw2}
            placeholder="새 비밀번호 확인"
            autocomplete="new-password"
            class="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[#1868db] focus:outline-none"
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
              class="rounded-md bg-[#1868db] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#145cb3] disabled:opacity-60"
            >
              {resetting ? '재설정 중…' : '재설정'}
            </button>
          </div>
        </form>
      {/if}
    </div>

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
  </div>

  <!-- 저장 바: 이름/소속/연락처 변경을 되돌리기/저장(닫기는 팝아웃 창 자체로) -->
  <footer class="flex shrink-0 items-center gap-2 border-t border-gray-200 px-5 py-3">
    {#if saveError}
      <span class="mr-auto truncate text-xs text-red-600" title={saveError}>{saveError}</span>
    {:else if saved && !dirty}
      <span class="mr-auto text-xs text-green-600">저장되었습니다.</span>
    {:else if dirty}
      <span class="mr-auto text-xs text-gray-500">변경사항이 있습니다.</span>
    {:else}
      <span class="mr-auto"></span>
    {/if}
    <button
      type="button"
      onclick={revert}
      disabled={!dirty || saving}
      class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
    >
      되돌리기
    </button>
    <button
      type="button"
      onclick={saveAll}
      disabled={!dirty || saving}
      class="rounded-lg bg-[#1868db] px-4 py-2 text-sm font-medium text-white hover:bg-[#145cb3] disabled:opacity-50"
    >
      {saving ? '저장 중…' : '저장'}
    </button>
  </footer>
</div>

<script lang="ts">
  import { postPopout } from '$lib/shared/lib/popout/popoutChannel';
  import { membersService } from '$lib/features/members/services/members.service';
  import type { CreateMemberInput } from '$lib/features/members/types';
  import { flattenDepartments, type Department } from '$lib/features/departments/types';
  import { isPasswordValid } from '$lib/shared/lib/utils/passwordPolicy';
  import PasswordChecklist from '$lib/shared/ui/controls/PasswordChecklist.svelte';

  // 일반관리자(ADMIN) 추가: 팝아웃 페이지 내용. 제출 시 BFF(/api/admin/members)로 실제 생성한다.
  // 성공하면 여는 창에 알리고(BroadcastChannel) 팝아웃을 닫는다(여는 창이 invalidateAll)
  interface Props {
    departments?: Department[];
  }
  let { departments = [] }: Props = $props();
  const deptOptions = $derived(flattenDepartments(departments));

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let departmentId = $state<number | null>(null); // 소속 부서(null=미배치)
  let phone = $state(''); // 전화번호(선택)
  let extension = $state(''); // 사내번호(선택)
  let errors = $state<Record<string, string>>({});
  let submitting = $state(false);
  let serverError = $state('');

  // 비밀번호 실시간 유효성(복잡도 규칙): 아래 체크리스트가 충족 항목마다 초록색 체크로 바뀐다.
  const passwordValid = $derived(isPasswordValid(password));

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = '이름을 입력하세요.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = '올바른 이메일을 입력하세요.';
    if (!isPasswordValid(password)) next.password = '비밀번호 조건을 모두 충족해야 합니다.';
    errors = next;
    return Object.keys(next).length === 0;
  }

  async function doSubmit(): Promise<void> {
    if (submitting) return;
    if (!validate()) return;
    submitting = true;
    serverError = '';
    try {
      const payload: CreateMemberInput = {
        email: email.trim(),
        password,
        name: name.trim(),
        departmentId,
        phone: phone.trim() || null,
        extension: extension.trim() || null,
      };
      const result = await membersService.create(payload);
      if (!result.success) {
        // 이름은 동명이인을 허용하므로 중복 안내는 이메일(로그인 ID)뿐이다.
        if (result.errorCode === 'DUPLICATE_EMAIL') {
          errors = { ...errors, email: '이미 사용 중인 이메일입니다.' };
        }
        serverError = result.error ?? '일반관리자 추가에 실패했습니다.';
        return;
      }
      postPopout({ type: 'member:changed' });
      window.close();
    } catch (e) {
      serverError = e instanceof Error ? e.message : '네트워크 오류로 실패했습니다.';
    } finally {
      submitting = false;
    }
  }
</script>

<div class="flex h-full flex-col">
  <form
    id="create-member-form"
    class="flex-1 space-y-4 overflow-y-auto p-5"
    onsubmit={(e) => {
      e.preventDefault();
      doSubmit();
    }}
  >
    <p class="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
      추가된 사용자는 <strong>일반관리자(ADMIN)</strong> 권한을 받습니다.
    </p>

    {#if serverError}
      <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
    {/if}

    <div>
      <label for="member-name" class="mb-1 block text-sm font-medium text-gray-700">이름</label>
      <input
        id="member-name"
        bind:value={name}
        type="text"
        placeholder="예: 홍길동"
        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
      />
      {#if errors.name}<p class="mt-1 text-xs text-red-600">{errors.name}</p>{/if}
    </div>

    <div>
      <label for="member-email" class="mb-1 block text-sm font-medium text-gray-700">이메일</label>
      <input
        id="member-email"
        bind:value={email}
        type="email"
        placeholder="admin@example.com"
        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
      />
      {#if errors.email}<p class="mt-1 text-xs text-red-600">{errors.email}</p>{/if}
    </div>

    <div>
      <label for="member-password" class="mb-1 block text-sm font-medium text-gray-700">비밀번호</label>
      <input
        id="member-password"
        bind:value={password}
        type="password"
        placeholder="8자 이상"
        autocomplete="new-password"
        class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none {passwordValid
          ? 'border-green-500 focus:border-green-500'
          : 'border-gray-300 focus:border-[#1868db]'}"
        aria-describedby="member-password-hint"
      />
      <div id="member-password-hint" class="mt-1.5">
        <PasswordChecklist {password} />
      </div>
    </div>

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
      <p class="mt-1 text-xs text-gray-400">소속 부서를 선택합니다. 비워두면 미배치로 추가됩니다.</p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="member-phone" class="mb-1 block text-sm font-medium text-gray-700">전화번호 <span class="text-xs font-normal text-gray-400">(선택)</span></label>
        <input
          id="member-phone"
          bind:value={phone}
          type="tel"
          placeholder="예: 010-1234-5678"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
        />
      </div>
      <div>
        <label for="member-extension" class="mb-1 block text-sm font-medium text-gray-700">사내번호 <span class="text-xs font-normal text-gray-400">(선택)</span></label>
        <input
          id="member-extension"
          bind:value={extension}
          type="text"
          placeholder="예: 1234"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none"
        />
      </div>
    </div>
  </form>

  <footer class="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-3">
    <button
      type="button"
      class="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
      onclick={() => window.close()}
    >
      취소
    </button>
    <button
      type="submit"
      form="create-member-form"
      disabled={submitting}
      class="rounded-lg bg-[#1868db] px-4 py-2 text-sm font-medium text-white hover:bg-[#145cb3] disabled:opacity-50"
    >
      {submitting ? '생성 중…' : '추가'}
    </button>
  </footer>
</div>

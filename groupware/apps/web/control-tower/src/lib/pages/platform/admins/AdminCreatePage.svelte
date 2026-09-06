<script lang="ts">
  import { postPopout } from '$lib/shared/lib/popout/popoutChannel';
  import { adminsService } from '$lib/features/admins/services/admins.service';
  import type { AdminFeatureCatalogItem, CreateAdminInput } from '$lib/features/admins/types';
  import { isPasswordValid } from '$lib/shared/lib/utils/passwordPolicy';
  import { isEmailValid } from '$lib/shared/lib/utils/emailPolicy';
  import AdminOptionChips from './components/AdminOptionChips.svelte';
  import PasswordChecklist from '$lib/shared/ui/PasswordChecklist.svelte';

  // 관리자 추가: 팝아웃 페이지 내용. 제출 시 BFF(/api/platform/admins)로 ADMIN 을 실제 생성한다.
  // 성공하면 여는 창에 알리고(BroadcastChannel) 팝아웃을 닫는다(여는 창이 invalidateAll)
  let { catalog }: { catalog: AdminFeatureCatalogItem[] } = $props();

  let email = $state('');
  let password = $state('');
  let name = $state('');
  let selected = $state<string[]>([]);
  let errors = $state<Record<string, string>>({});
  let submitting = $state(false);
  let serverError = $state('');

  function toggle(key: string): void {
    selected = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!isEmailValid(email)) next.email = '올바른 이메일을 입력하세요.';
    if (!isPasswordValid(password)) next.password = '비밀번호 조건을 모두 충족해야 합니다.';
    if (!name.trim()) next.name = '이름을 입력하세요.';
    errors = next;
    return Object.keys(next).length === 0;
  }

  async function doSubmit(): Promise<void> {
    if (submitting) return;
    if (!validate()) return;
    submitting = true;
    serverError = '';
    try {
      const payload: CreateAdminInput = {
        email: email.trim(),
        password,
        name: name.trim(),
        features: selected,
      };
      const result = await adminsService.create(payload);
      if (!result.success) {
        if (result.errorCode === 'DUPLICATE_EMAIL') {
          errors = { ...errors, email: '이미 사용 중인 이메일입니다.' };
        }
        serverError = result.error ?? '관리자 추가에 실패했습니다.';
        return;
      }
      postPopout({ type: 'admin:changed' });
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
    id="create-admin-form"
    class="flex-1 space-y-4 overflow-y-auto p-5"
    onsubmit={(e) => {
      e.preventDefault();
      doSubmit();
    }}
  >
    {#if serverError}
      <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
    {/if}

    <div>
      <label for="admin-name" class="mb-1 block text-sm font-medium text-gray-700">이름</label>
      <input
        id="admin-name"
        bind:value={name}
        placeholder="관리자 이름"
        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {#if errors.name}<p class="mt-1 text-xs text-red-600">{errors.name}</p>{/if}
    </div>

    <div>
      <label for="admin-email" class="mb-1 block text-sm font-medium text-gray-700">이메일</label>
      <input
        id="admin-email"
        type="email"
        bind:value={email}
        placeholder="admin@example.com"
        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {#if errors.email}<p class="mt-1 text-xs text-red-600">{errors.email}</p>{/if}
    </div>

    <div>
      <label for="admin-password" class="mb-1 block text-sm font-medium text-gray-700">비밀번호</label>
      <input
        id="admin-password"
        type="password"
        bind:value={password}
        placeholder="비밀번호"
        autocomplete="new-password"
        class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 {isPasswordValid(password)
          ? 'border-green-500 focus:border-green-500 focus:ring-green-500/30'
          : 'border-gray-300 focus:border-brand focus:ring-brand/30'}"
      />
      <div class="mt-1.5">
        <PasswordChecklist {password} />
      </div>
    </div>

    <div>
      <span class="mb-1 block text-sm font-medium text-gray-700">관리 영역 옵션</span>
      <AdminOptionChips {catalog} {selected} ontoggle={toggle} />
    </div>
  </form>

  <footer class="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-3">
    <button
      type="button"
      onclick={() => window.close()}
      class="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
    >
      취소
    </button>
    <button
      type="submit"
      form="create-admin-form"
      disabled={submitting}
      class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
    >
      {submitting ? '생성 중…' : '추가'}
    </button>
  </footer>
</div>

<script lang="ts">
  import { postPopout } from '$lib/shared/lib/popout/popoutChannel';
  import type { CreateOrganizationInput } from '$lib/features/organizations/types';
  import OrganizationImagePicker from './components/OrganizationImagePicker.svelte';
  import { organizationsService } from '$lib/features/organizations/services/organizations.service';
  import { isPasswordValid } from '$lib/shared/lib/utils/passwordPolicy';
  import { isEmailValid } from '$lib/shared/lib/utils/emailPolicy';
  import PasswordChecklist from '$lib/shared/ui/PasswordChecklist.svelte';

  // 조직 추가: 팝아웃(window.open) 페이지 내용. 제출 시 BFF(/api/platform/organizations)로 조직 + ROOT 를 실제 생성한다.
  // 성공하면 여는 창에 변경을 알리고(BroadcastChannel) 팝아웃을 닫는다(여는 창이 invalidateAll 수행)

  let companyName = $state('');
  let slug = $state('');
  let profileImageUrl = $state<string | null>(null);
  let logoFile = $state<File | null>(null); // 선택만 된 미저장 로고(저장 시 업로드)
  let adminEmail = $state('');
  let adminPassword = $state('');
  let adminName = $state('');
  let errors = $state<Record<string, string>>({});
  let submitting = $state(false);
  let serverError = $state('');

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!companyName.trim()) next.companyName = '조직명을 입력하세요.';
    if (!/^[a-z0-9-]+$/.test(slug)) next.slug = 'slug 은 소문자/숫자/하이픈만 허용합니다.';
    if (!isEmailValid(adminEmail)) next.adminEmail = '올바른 이메일을 입력하세요.';
    if (!isPasswordValid(adminPassword)) next.adminPassword = '비밀번호 조건을 모두 충족해야 합니다.';
    if (!adminName.trim()) next.adminName = '관리자 이름을 입력하세요.';
    errors = next;
    return Object.keys(next).length === 0;
  }

  async function doSubmit(): Promise<void> {
    if (submitting) return;
    if (!validate()) return;
    submitting = true;
    serverError = '';
    try {
      // 로고를 새로 골랐으면 이때(저장 시) 업로드: 선택 시엔 미리보기만 했다.
      if (logoFile) {
        profileImageUrl = await organizationsService.uploadLogo(logoFile);
      }
      const payload: CreateOrganizationInput = {
        companyName: companyName.trim(),
        slug: slug.trim(),
        profileImageUrl: profileImageUrl ?? undefined,
        adminEmail: adminEmail.trim(),
        adminPassword,
        adminName: adminName.trim(),
      };
      const result = await organizationsService.create(payload);
      if (!result.success) {
        // 충돌은 slug 와 이메일 두 가지라 오류를 각자의 입력란에 붙인다.
        if (result.errorCode === 'SLUG_TAKEN') {
          errors = { ...errors, slug: '이미 사용 중인 slug 입니다.' };
        }
        if (result.errorCode === 'DUPLICATE_EMAIL') {
          errors = { ...errors, adminEmail: '이미 사용 중인 이메일입니다.' };
        }
        serverError = result.error ?? '조직 생성에 실패했습니다.';
        return;
      }
      postPopout({ type: 'org:changed' });
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
    id="create-org-form"
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
      <span class="mb-1 block text-sm font-medium text-gray-700">조직 로고</span>
      <OrganizationImagePicker bind:value={profileImageUrl} bind:file={logoFile} name={companyName} />
    </div>

    <div>
      <label for="org-name" class="mb-1 block text-sm font-medium text-gray-700">조직명</label>
      <input
        id="org-name"
        bind:value={companyName}
        placeholder="예: ACME 주식회사"
        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {#if errors.companyName}<p class="mt-1 text-xs text-red-600">{errors.companyName}</p>{/if}
    </div>

    <div>
      <label for="org-slug" class="mb-1 block text-sm font-medium text-gray-700">slug</label>
      <input
        id="org-slug"
        bind:value={slug}
        placeholder="예: acme (소문자/숫자/하이픈)"
        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {#if errors.slug}<p class="mt-1 text-xs text-red-600">{errors.slug}</p>{/if}
    </div>

    <fieldset class="space-y-4 rounded-lg border border-gray-200 p-4">
      <legend class="px-1 text-xs font-semibold text-gray-500">ROOT 관리자</legend>

      <div>
        <label for="admin-name" class="mb-1 block text-sm font-medium text-gray-700">이름</label>
        <input
          id="admin-name"
          bind:value={adminName}
          placeholder="관리자 이름"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        {#if errors.adminName}<p class="mt-1 text-xs text-red-600">{errors.adminName}</p>{/if}
      </div>

      <div>
        <label for="admin-email" class="mb-1 block text-sm font-medium text-gray-700">이메일</label>
        <input
          id="admin-email"
          type="email"
          bind:value={adminEmail}
          placeholder="admin@example.com"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        {#if errors.adminEmail}<p class="mt-1 text-xs text-red-600">{errors.adminEmail}</p>{/if}
      </div>

      <div>
        <label for="admin-password" class="mb-1 block text-sm font-medium text-gray-700">비밀번호</label>
        <input
          id="admin-password"
          type="password"
          bind:value={adminPassword}
          placeholder="비밀번호"
          class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 {isPasswordValid(adminPassword)
            ? 'border-green-500 focus:border-green-500 focus:ring-green-500/30'
            : 'border-gray-300 focus:border-brand focus:ring-brand/30'}"
        />
        <div class="mt-1.5">
          <PasswordChecklist password={adminPassword} />
        </div>
      </div>
    </fieldset>
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
      form="create-org-form"
      disabled={submitting}
      class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
    >
      {submitting ? '생성 중…' : '추가'}
    </button>
  </footer>
</div>

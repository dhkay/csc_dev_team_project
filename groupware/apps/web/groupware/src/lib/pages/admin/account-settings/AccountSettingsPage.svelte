<script lang="ts">
  // 환경설정(내 계정): 팝아웃 페이지 내용. 이름 + 프로필 이미지 편집
  // 역할 게이팅(프런트): 이름/프로필이미지는 전 역할 공통, 비밀번호 변경은 ADMIN 만. 백엔드가 최종 강제
  //   이름은 유일한 이름 필드라 바꾸면 로그/멤버목록/플랫폼 표기가 함께 따라간다(동명이인 허용)
  // 저장 성공 시 여는 창에 알리고(BroadcastChannel) 팝아웃을 닫는다(여는 창이 invalidateAll)
  import { untrack } from 'svelte';
  import { isRoot } from '$lib/shared/lib/auth/access';
  import { postPopout } from '$lib/shared/lib/popout/popoutChannel';
  import { accountService } from '$lib/features/account/services/account.service';
  import { isPasswordValid } from '$lib/shared/lib/utils/passwordPolicy';
  import type { CurrentUser } from '$lib/shared/types/common.types';
  import ProfileImagePicker from './components/ProfileImagePicker.svelte';
  import PasswordChecklist from '$lib/shared/ui/controls/PasswordChecklist.svelte';

  let { user }: { user: CurrentUser } = $props();

  const root = $derived(isRoot(user));

  // 원본(초기값): dirty 판정/되돌리기. 로고/아바타는 uploadId(불변)를 제출/저장하고,
  // 표시는 user.profileImageUrl(로드 경계가 만든 서명 URL)을 피커 displayUrl 로 넘긴다.
  //
  // 마운트 시점 스냅샷을 의도적으로 잡는다(untrack). 이 팝아웃은 저장 후 자신을 닫고 여는 창이
  //   invalidateAll 하므로 props 가 갱신된 채로 살아 있는 상태가 없다. untrack 이 없으면
  //   컴파일러가 "초기값만 잡힌다"고 경고하는데, 여기서는 그게 바로 원하는 동작이다.
  const name0 = untrack(() => user.name);
  const image0 = untrack(() => user.profileImageUploadId ?? null);

  let name = $state(untrack(() => user.name));
  let profileImageUrl = $state<string | null>(untrack(() => user.profileImageUploadId ?? null));
  let imageFile = $state<File | null>(null);

  // 비밀번호(ADMIN 전용)
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');

  let saving = $state(false);
  let saveError = $state('');
  let pwError = $state('');

  const passwordTouched = $derived(
    !root && (currentPassword !== '' || newPassword !== '' || confirmPassword !== ''),
  );
  const profileDirty = $derived(
    name !== name0 || profileImageUrl !== image0 || imageFile !== null,
  );
  const dirty = $derived(profileDirty || passwordTouched);

  function revert(): void {
    name = name0;
    profileImageUrl = image0;
    imageFile = null;
    currentPassword = '';
    newPassword = '';
    confirmPassword = '';
    saveError = '';
    pwError = '';
  }

  async function doSave(): Promise<void> {
    if (saving || !dirty) return;
    saveError = '';
    pwError = '';

    if (passwordTouched) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        pwError = '현재/새 비밀번호를 모두 입력하세요.';
        return;
      }
      if (!isPasswordValid(newPassword)) {
        pwError = '새 비밀번호가 조건을 모두 충족해야 합니다.';
        return;
      }
      if (newPassword !== confirmPassword) {
        pwError = '새 비밀번호가 일치하지 않습니다.';
        return;
      }
    }

    if (name.trim() === '') {
      saveError = '이름을 입력하세요.';
      return;
    }

    saving = true;
    try {
      // 1) 이미지 변경분 업로드(저장 시점) → 접근 URL 확정
      if (imageFile) {
        profileImageUrl = await accountService.uploadProfileImage(imageFile);
        imageFile = null;
      }

      // 2) 프로필 변경분만 PATCH.
      const patch: { name?: string; profileImageUrl?: string | null } = {};
      if (profileImageUrl !== image0) patch.profileImageUrl = profileImageUrl;
      if (name !== name0) patch.name = name.trim();
      if (Object.keys(patch).length > 0) {
        const res = await accountService.updateProfile(patch);
        if (!res.success) {
          saveError = res.error ?? '저장에 실패했습니다.';
          return;
        }
      }

      // 3) 비밀번호 변경(ADMIN, 입력 시)
      if (passwordTouched) {
        const res = await accountService.changePassword(currentPassword, newPassword);
        if (!res.success) {
          pwError =
            res.errorCode === 'INVALID_CURRENT_PASSWORD'
              ? '현재 비밀번호가 일치하지 않습니다.'
              : (res.error ?? '비밀번호 변경에 실패했습니다.');
          return;
        }
      }

      postPopout({ type: 'account:changed' });
      window.close();
    } catch (e) {
      saveError = e instanceof Error ? e.message : '네트워크 오류로 실패했습니다.';
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex h-dvh flex-col">
  <header class="shrink-0 border-b border-gray-200 px-5 py-4">
    <h1 class="text-lg font-bold text-gray-900">환경설정</h1>
    <p class="mt-0.5 text-sm text-gray-500">내 계정 정보를 변경합니다.</p>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
    <form id="account-form" onsubmit={(e) => { e.preventDefault(); void doSave(); }} class="space-y-5">
      <!-- 프로필 이미지 -->
      <div>
        <span class="mb-1 block text-sm font-medium text-gray-700">프로필 사진</span>
        <ProfileImagePicker
          bind:value={profileImageUrl}
          displayUrl={user.profileImageUrl}
          bind:file={imageFile}
        />
      </div>

      <!-- 이름: 프로필 사진 바로 아래. 전 역할 공통(로그/멤버목록/플랫폼 표기가 같이 따라간다) -->
      <div>
        <label for="acc-name" class="mb-1 block text-sm font-medium text-gray-700">이름</label>
        <input
          id="acc-name"
          bind:value={name}
          maxlength="100"
          placeholder="다른 사용자에게 보이는 이름"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none focus:ring-2 focus:ring-[#1868db]/30"
        />
      </div>

      <!-- 이메일(읽기 전용) -->
      <div>
        <span class="mb-1 block text-sm font-medium text-gray-700">이메일</span>
        <p class="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500">
          로그인 이메일은 변경할 수 없습니다.
        </p>
      </div>

      {#if !root}
        <!-- 비밀번호 변경 (ADMIN) -->
        <fieldset class="space-y-2 rounded-lg border border-gray-200 p-3">
          <legend class="px-1 text-sm font-medium text-gray-700">비밀번호 변경</legend>
          <input
            type="password"
            autocomplete="current-password"
            placeholder="현재 비밀번호"
            bind:value={currentPassword}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none focus:ring-2 focus:ring-[#1868db]/30"
          />
          <input
            type="password"
            autocomplete="new-password"
            placeholder="새 비밀번호"
            bind:value={newPassword}
            class="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 {isPasswordValid(newPassword)
              ? 'border-green-500 focus:border-green-500 focus:ring-green-500/30'
              : 'border-gray-300 focus:border-[#1868db] focus:ring-[#1868db]/30'}"
          />
          {#if newPassword}
            <PasswordChecklist password={newPassword} />
          {/if}
          <input
            type="password"
            autocomplete="new-password"
            placeholder="새 비밀번호 확인"
            bind:value={confirmPassword}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1868db] focus:outline-none focus:ring-2 focus:ring-[#1868db]/30"
          />
          {#if pwError}<p class="text-xs text-red-600">{pwError}</p>{/if}
          <p class="text-xs text-gray-400">변경하지 않으려면 비워 두세요.</p>
        </fieldset>
      {:else}
        <!-- ROOT 안내 -->
        <p class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          이메일, 비밀번호 등 나머지 계정 정보는 플랫폼에서 관리됩니다. 변경이 필요하면 운영사에 문의하세요.
        </p>
      {/if}

      {#if saveError}<p class="text-sm text-red-600">{saveError}</p>{/if}
    </form>
  </div>

  <!-- 닫기 + 저장: 항상 노출하되 변경이 없으면 비활성화 -->
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
      form="account-form"
      disabled={saving || !dirty}
      class="rounded-lg bg-[#1868db] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1868db]/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving ? '저장 중…' : '저장'}
    </button>
  </footer>
</div>

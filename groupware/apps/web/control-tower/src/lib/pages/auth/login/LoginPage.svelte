<script lang="ts">
  import { goto } from '$app/navigation';
  import LoginForm from './components/LoginForm.svelte';
  import { authService } from '$lib/features/account/services/auth.service';

  let email = $state('');
  let password = $state('');
  let isLoading = $state(false);
  let errorMsg = $state('');
  // 비밀번호를 여러 번 틀려 계정이 잠긴 경우: 루트 관리자에게 문의하도록 별도 알림으로 강조
  let isLocked = $state(false);

  async function handleSubmit(data: { email: string; password: string }) {
    if (isLoading) return;
    errorMsg = '';
    isLocked = false;
    isLoading = true;
    try {
      const result = await authService.login(data);
      if (result.success) {
        await goto('/');
        return;
      }
      isLocked = result.errorCode === 'ACCOUNT_LOCKED';
      errorMsg = result.error ?? '로그인에 실패했습니다';
    } catch {
      errorMsg = '로그인에 실패했습니다';
    } finally {
      isLoading = false;
    }
  }

  function clearError() {
    if (errorMsg) errorMsg = '';
    if (isLocked) isLocked = false;
  }
</script>

<!-- 가운데 정렬 카드 (플랫폼 운영사 로그인) -->
<div class="flex min-h-dvh w-full items-center justify-center bg-gray-50 p-6">
  <div class="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
    <div class="mb-6 text-center">
      <h1 class="text-xl font-bold text-gray-900">CSC Partners</h1>
      <p class="mt-1 text-sm text-gray-500">플랫폼 관리자 로그인</p>
    </div>

    <LoginForm bind:email bind:password {isLoading} onSubmit={handleSubmit} onInput={clearError} />

    {#if isLocked}
      <!-- 계정 잠금: 루트 관리자 문의 안내(강조 알림) -->
      <div class="mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert">
        <svg class="mt-0.5 h-5 w-5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div class="text-sm">
          <p class="font-semibold text-amber-800">계정이 잠겼습니다</p>
          <p class="mt-0.5 text-amber-700">비밀번호를 여러 번 잘못 입력해 보안을 위해 계정이 일시 잠겼습니다. 잠시 후 다시 시도하거나 <b>루트 관리자</b>에게 문의하세요.</p>
        </div>
      </div>
    {:else if errorMsg}
      <p class="mt-3 text-sm text-red-600" role="alert">{errorMsg}</p>
    {/if}

    <button
      type="submit"
      form="login-form"
      disabled={isLoading}
      class="mt-4 w-full rounded-lg bg-[#1868db] py-2.5 text-white transition-colors hover:bg-[#1868db]/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoading ? '로그인 중...' : '로그인'}
    </button>
  </div>
</div>

<script lang="ts">
  interface Props {
    email?: string;
    password?: string;
    isLoading?: boolean;
    onSubmit?: (data: { email: string; password: string }) => void;
    onInput?: () => void;
  }

  let {
    email = $bindable(''),
    password = $bindable(''),
    isLoading = false,
    onSubmit,
    onInput,
  }: Props = $props();

  let showPassword = $state(false);

  function handleSubmit(e: Event) {
    e.preventDefault();
    onSubmit?.({ email, password });
  }
</script>

<form onsubmit={handleSubmit} id="login-form" class="w-full">
  <div class="mb-3">
    <input
      id="email"
      type="text"
      bind:value={email}
      oninput={() => onInput?.()}
      placeholder="Email"
      required
      disabled={isLoading}
      autocomplete="username"
      class="w-full rounded-lg border border-gray-300 px-4 py-2.5 transition-all focus:border-[#1868db] focus:outline-none focus:ring-2 focus:ring-[#1868db]/20 disabled:bg-gray-100 disabled:opacity-60"
    />
  </div>

  <div class="relative">
    <input
      id="password"
      type={showPassword ? 'text' : 'password'}
      bind:value={password}
      oninput={() => onInput?.()}
      placeholder="Password"
      required
      disabled={isLoading}
      autocomplete="current-password"
      class="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-12 transition-all focus:border-[#1868db] focus:outline-none focus:ring-2 focus:ring-[#1868db]/20 disabled:bg-gray-100 disabled:opacity-60"
    />
    <button
      type="button"
      onclick={() => (showPassword = !showPassword)}
      disabled={isLoading}
      class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
      aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
    >
      {#if showPassword}
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      {:else}
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      {/if}
    </button>
  </div>
</form>

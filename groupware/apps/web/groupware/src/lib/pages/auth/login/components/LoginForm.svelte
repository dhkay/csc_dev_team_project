<script lang="ts">
  import { scrollIntoViewOnFocus } from '$lib/shared/lib/actions/scrollIntoViewOnFocus';

  /**
   * 로그인 폼. 폼 한 덩어리(입력 + 보조 링크 + 에러 + 제출)를 이 컴포넌트가 통째로 소유한다.
   * 제출 버튼을 페이지에 두고 form="..." 로 원격 연결하면 세로 순서가 두 파일에 번갈아 걸쳐서,
   * 사이에 뭘 하나 넣을 때마다 어느 파일인지부터 따져야 한다.
   *
   * 간격은 자식의 margin 이 아니라 영역 컨테이너의 gap 이 정한다. 영역마다 조절 지점이
   * 하나씩이라 중간에 요소를 넣어도 이웃의 margin 을 다시 맞출 일이 없고, 조건부 요소(에러)가
   * 없을 때 빈 자리가 남지도 않는다(gap 은 렌더되지 않은 자식을 세지 않는다)
   */
  interface Props {
    email?: string;
    password?: string;
    isLoading?: boolean;
    // 자동 로그인 체크 상태. 이 값에 따라 서버가 인증 쿠키 수명을 정한다.
    autoLogin?: boolean;
    // 로그인 실패 사유. 제출 버튼 바로 위에 role="alert" 로 노출된다.
    errorMessage?: string;
    onSubmit?: (data: { email: string; password: string }) => void;
    onInput?: () => void;
    // 비밀번호 찾기 클릭. 실제 재설정 흐름이 생기면 페이지가 이 핸들러만 갈아끼우면 된다.
    onForgotPassword?: () => void;
  }

  let {
    email = $bindable(''),
    password = $bindable(''),
    isLoading = false,
    autoLogin = $bindable(false),
    errorMessage = '',
    onSubmit,
    onInput,
    onForgotPassword,
  }: Props = $props();

  let showPassword = $state(false);

  function handleSubmit(e: Event) {
    e.preventDefault();
    onSubmit?.({ email, password });
  }

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  // 아래 세 묶음은 두 곳 이상에서 그대로 쓰이는 스타일이라 한 곳에서 정한다. 문자열로 빼도
  // Tailwind 는 파일 원문을 훑어 클래스를 찾으므로 유틸 생성에는 영향이 없다.

  /** 텍스트 입력란 공통. 비밀번호칸은 여기에 눈 버튼 자리(pr-*)만 더한다. */
  const FIELD =
    'w-full rounded-lg border border-gray-300 bg-[#f2f2f2] px-3 py-2 transition md:px-4 md:py-2.5' +
    ' focus:border-[#2b2a30] focus:outline-none focus:ring-2 focus:ring-[#2b2a30]/20 disabled:opacity-60';

  /** 보조 줄(자동 로그인, 비밀번호 찾기)의 글자 스타일 */
  const SUBTLE_TEXT = 'text-sm text-gray-500 transition-colors hover:text-[#2b2a30]';

  /** 키보드 포커스 링. 입력란과 달리 마우스 클릭으로는 뜨지 않아야 하는 요소용(focus-visible) */
  const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b2a30]/20';
</script>

<style>
  /* 브라우저 기본 비밀번호 시각화 버튼 제거 */
  .password-input::-ms-reveal,
  .password-input::-ms-clear {
    display: none;
    width: 0;
    height: 0;
  }
  
  .password-input::-webkit-credentials-auto-fill-button,
  .password-input::-webkit-strong-password-auto-fill-button {
    display: none !important;
  }
</style>

<!-- 폼 영역 사이 간격: 자격 증명 ↔ 액션 -->
<form onsubmit={handleSubmit} class="flex w-full flex-col gap-4">
  <!-- 자격 증명 영역: 입력 묶음 ↔ 보조 링크 -->
  <div class="flex flex-col gap-2">
    <!-- 입력란끼리의 간격 -->
    <div class="flex flex-col gap-3 md:gap-4">
      <input
        use:scrollIntoViewOnFocus
        id="email"
        type="text"
        bind:value={email}
        oninput={onInput}
        placeholder="Email"
        required
        disabled={isLoading}
        autocomplete="username"
        class={FIELD}
      />

      <div class="relative">
        <input
          use:scrollIntoViewOnFocus
          id="password"
          type={showPassword ? 'text' : 'password'}
          bind:value={password}
          oninput={onInput}
          placeholder="Password"
          required
          disabled={isLoading}
          autocomplete="current-password"
          class="password-input {FIELD} pr-10 md:pr-12"
        />

        <button
          type="button"
          onclick={togglePasswordVisibility}
          disabled={isLoading}
          class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
        >
          <!-- 인라인 SVG(외부 에셋 의존 제거). 두 상태가 껍데기는 같고 획만 달라서 svg 는 하나로 두고
               안쪽만 바꾼다. 속성을 양쪽에 복붙하면 한쪽만 고치는 사고가 난다. -->
          <svg
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            {#if showPassword}
              <!-- 눈 가림(누르면 숨김) -->
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" y1="2" x2="22" y2="22" />
            {:else}
              <!-- 눈 뜸(누르면 보임) -->
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            {/if}
          </svg>
        </button>
      </div>
    </div>

    <!-- 보조 영역: 좌측 정렬 한 줄. 항목이 늘면(예: 아이디 찾기) 형제로 붙이면 gap 이 알아서 띄운다. -->
    <div class="flex items-center gap-4">
      <label class="flex cursor-pointer items-center gap-2 {SUBTLE_TEXT}">
        <input
          type="checkbox"
          bind:checked={autoLogin}
          disabled={isLoading}
          class="h-4 w-4 cursor-pointer accent-[#2b2a30] {FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-60"
        />
        자동 로그인
      </label>

      <button
        type="button"
        onclick={onForgotPassword}
        class="rounded-sm underline-offset-4 hover:underline {SUBTLE_TEXT} {FOCUS_RING}"
      >
        비밀번호 찾기
      </button>
    </div>
  </div>

  <!-- 액션 영역: 에러 ↔ 제출 -->
  <div class="flex flex-col gap-3">
    {#if errorMessage}
      <p class="text-sm text-red-600" role="alert">{errorMessage}</p>
    {/if}

    <button
      type="submit"
      disabled={isLoading}
      class="w-full rounded-lg bg-[#2b2a30] py-2.5 text-white transition-colors hover:bg-[#2b2a30]/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoading ? '로그인 중...' : '로그인'}
    </button>
  </div>
</form>
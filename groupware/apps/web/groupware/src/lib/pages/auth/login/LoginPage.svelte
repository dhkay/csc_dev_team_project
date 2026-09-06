<script lang="ts">
  import { goto } from '$app/navigation';
  import LoginForm from './components/LoginForm.svelte';
  import BrandLogo from '$lib/shared/ui/BrandLogo.svelte';
  import { authService } from '$lib/features/account/services/auth.service';
  import { fadeInOnLoad } from '$lib/shared/lib/actions/fadeInOnLoad';
  import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';

  let email = $state('');
  let password = $state('');
  let isLoading = $state(false);
  let errorMessage = $state('');

  /**
   * 자동 로그인. 선택값은 BFF 로만 넘기고 브라우저에는 아무것도 저장하지 않는다.
   * 유지 여부는 서버가 심는 인증 쿠키의 수명이 정한다(지속 쿠키 vs 브라우저 세션 쿠키)
   */
  let autoLogin = $state(false);

  async function handleSubmit(data: { email: string; password: string }) {
    if (isLoading) return;
    errorMessage = '';
    isLoading = true;
    try {
      const result = await authService.login({ ...data, autoLogin });
      if (result.success) {
        // 목적지 판정은 BFF(resolveGroupwareDefaultDestination)가 단일 출처로 한다.
        // 여기서 역할을 다시 보면 판정이 두 곳으로 갈려 서로 어긋난다.
        const destination = result.data?.defaultPath ?? '/login';
        await goto(destination);
        return;
      }
      errorMessage = result.error ?? '로그인에 실패했습니다';
    } catch {
      errorMessage = '로그인에 실패했습니다';
    } finally {
      isLoading = false;
    }
  }

  function clearError() {
    if (errorMessage) errorMessage = '';
  }

  /**
   * 비밀번호 찾기: 본인이 스스로 재설정하는 흐름은 아직 없다(조직 관리자가 대신 재설정하는
   * 경로만 존재). 눌러도 아무 반응이 없으면 버튼이 고장난 것처럼 읽히므로 전역 토스트로
   * 준비중을 통보한다(AppBar 알림 버튼과 같은 방식). 연달아 눌러도 눌린 게 보이도록 이전 것을
   * 닫고 다시 띄운다. 재설정 흐름이 생기면 이 함수 본문만 goto 로 갈아끼우면 된다.
   */
  let forgotToastId: string | null = null;
  function notifyForgotPasswordComingSoon() {
    if (forgotToastId) toastStore.dismiss(forgotToastId);
    forgotToastId = toastStore.show({
      variant: 'info',
      title: '비밀번호 찾기 준비중입니다.',
      detail: '조직 관리자에게 비밀번호 재설정을 요청해 주세요.',
      key: 'login:forgot-password',
    });
  }
</script>

<!-- portrait=폼만 전체화면 / landscape=좌(히어로):우(폼) 50:50, 폼 패널 좌측 모서리만 둥금 -->
<div class="flex h-dvh w-full">
  <!-- 히어로: portrait 숨김. 폼 패널 라운드 반경(rounded-3xl=1.5rem)만큼 더 넓게 깔아,
       패널의 둥근 모서리가 파낸 틈으로도 사진이 이어져 보이게 한다.

       배경색은 사진의 평균색이다. 사진이 도착하기 전에 이 절반이 비어 있으면 흰색인데, 그러면
       오른쪽 폼 패널과 이어져 화면 전체가 백지로 보이다가 사진이 뜨는 순간 반으로 갈린다.
       색을 미리 깔아 두면 첫 페인트부터 두 영역이 나뉘어 있어, 사진은 그 자리를 채우기만 한다. -->
  <div class="hidden bg-[#7c736b] landscape:block landscape:w-[calc(50%_+_1.5rem)]">
    <!-- static/assets/image/auth/login-hero.webp → 루트 기준 URL.
         사진은 WebP 로 인코딩한다(같은 그림이 PNG 2.0MB, WebP 0.12MB). PNG 는 무손실이라 사진에
         쓰면 용량이 열몇 배가 되고, 그만큼 사진이 늦게 도착해 위의 빈 화면이 길어진다.
         교체할 때도 ffmpeg -i <원본> -c:v libwebp -quality 82 로 다시 만들어 같은 이름으로 덮어쓴다.

         원본은 1254x1254(1:1)이고 이 섹션은 그보다 세로로 길어 좌우가 잘린다.
         크롭 기준을 옮기려면 object-left/right. -->
    <!-- 사진은 도착하는 순간 위 배경색 위로 서서히 나타난다. 배경색만 깔아 두면 사진이 뜰 때
         색에서 사진으로 툭 바뀌어, 그 전환 자체가 깜빡임으로 읽힌다.
         decoding 은 지정하지 않는다: async 로 두면 load 가 난 뒤에도 디코딩이 남아 페이드 앞부분이
         빈 화면일 수 있다. 판단은 브라우저에 맡긴다. -->
    <img
      use:fadeInOnLoad
      src="/assets/image/auth/login-hero.webp"
      alt="cscuniverse 대시보드로 업무를 처리하는 모습"
      class="h-full w-full object-cover"
      fetchpriority="high"
    />
  </div>

  <!-- 폼 패널: portrait=전체화면 흰 배경 / landscape=우측 절반(50%), 좌상단, 좌하단만 둥금
       라운드 반경만큼 왼쪽으로 당겨 히어로 위에 겹친다(보이는 경계는 그대로 50%)
       relative 가 없으면 이미지가 패널 위로 그려진다(inline replaced 가 블록 배경보다 먼저 위에 온다) -->
  <div
    class="flex w-full items-center justify-center bg-white p-6 landscape:relative landscape:-ml-6 landscape:w-1/2 landscape:rounded-l-3xl landscape:shadow-2xl"
  >
    <!-- 로고 ↔ 폼 간격. 영역이 늘면 여기에 형제로 붙인다.
         portrait 를 좁게 잡는 이유: 모바일 키보드가 뜨면 h-dvh 가 크게 줄어 로고와 입력란이 눌린다. -->
    <div class="flex w-full max-w-sm flex-col gap-8 landscape:gap-10">
      <!-- 로고가 곧 페이지 제목. 눈으로는 로고만 보이지만 제목 자리는 유지해야 하므로,
           화면에 안 보이는 '로그인' 을 덧붙여 스크린리더에는 "cscuniverse 로그인" 으로 읽힌다. -->
      <h1 class="flex justify-center text-[#2b2a30]">
        <BrandLogo />
        <span class="sr-only">로그인</span>
      </h1>

      <LoginForm
        bind:email
        bind:password
        bind:autoLogin
        {isLoading}
        {errorMessage}
        onSubmit={handleSubmit}
        onInput={clearError}
        onForgotPassword={notifyForgotPasswordComingSoon}
      />
    </div>
  </div>
</div>

<script lang="ts">
  // /[orgSlug]/admin/roles: 권한 관리(조직 루트관리자 전용). 가드는 +page.server.ts.
  // 현재는 UI 스캐폴딩(준비중). 실제 역할/권한 부여 UI 는 후속(조직 관리처럼 feature 컴포넌트로 분리 예정)
  import { page } from '$app/stores';
  const orgSlug = $derived($page.params.orgSlug);
</script>

<div class="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
  <!-- 뒤로: 관리자 홈(타일)으로 -->
  <a
    href={`/${orgSlug}/admin`}
    class="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-800"
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
    뒤로
  </a>

  <header>
    <h1 class="text-xl font-bold text-gray-900">권한 관리</h1>
    <p class="text-sm text-gray-500">조직유저의 역할과 기능/AI도구 접근권(엔타이틀먼트)을 관리합니다.</p>
  </header>

  <section class="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-6 text-center">
    <p class="text-sm font-medium text-gray-700">권한/역할 관리</p>
    <p class="mt-1 text-xs text-gray-400">역할 부여, 기능 접근권 설정 기능은 준비중입니다.</p>
  </section>
</div>

<script lang="ts">
  import type { PageData } from './$types';

  // 플랫폼 운영사 홈(대시보드): (app) 셸 안에 렌더. user 는 그룹 레이아웃 가드에서 내려온다.
  let { data }: { data: PageData } = $props();
</script>

<div class="space-y-4">
  <header class="space-y-1">
    <h1 class="text-2xl font-bold text-brand">CSC Partners 플랫폼</h1>
    <p class="text-gray-600">{data.user?.name}님 환영합니다.</p>
  </header>

  <div class="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-400">
    그룹웨어 조직 / 루트 계정 관리: 준비중
  </div>
</div>

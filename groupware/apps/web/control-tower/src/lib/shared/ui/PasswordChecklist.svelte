<script lang="ts">
  import { PASSWORD_RULES } from '$lib/shared/lib/utils/passwordPolicy';

  // 비밀번호 복잡도 체크리스트: 입력값(password)의 각 규칙 충족 여부를 실시간 표시
  // 충족 항목은 초록색 체크, 미충족은 회색 점. (정책 SSOT: passwordPolicy.ts)
  interface Props {
    password: string;
  }
  let { password }: Props = $props();
</script>

<ul class="grid grid-cols-2 gap-x-3 gap-y-1">
  {#each PASSWORD_RULES as rule (rule.key)}
    {@const ok = rule.test(password)}
    <li class="flex items-center gap-1 text-xs {ok ? 'text-green-600' : 'text-gray-400'}">
      {#if ok}
        <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 13l4 4L19 7" />
        </svg>
      {:else}
        <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden="true">
          <span class="h-1 w-1 rounded-full bg-current"></span>
        </span>
      {/if}
      {rule.label}
    </li>
  {/each}
</ul>

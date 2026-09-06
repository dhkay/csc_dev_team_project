<script lang="ts">
  // 목적 키워드: 이번 생성에 쓸 키워드를 보여주고, '키워드 검색' 화면으로 넘어가는 자리
  // 고르는 화면이 아니다(고르기는 넘어간 화면에서). 저장하지 않는 값이라 로딩/에러 상태가 없다.
  //
  // 선택 항목이다. 비워 두고 생성하면 브랜드와 브랜드 설명이 주제가 되어 기획안이 소재를 제안한다.
  // 그래서 빈 상태를 결핍('고르세요')으로 쓰지 않는다: 그렇게 쓰면 고르지 않으면 안 되는 것으로 읽힌다.
  // 막을 조건이 없다. 이 자리가 입력 방식 탭 위라 브랜드가 있는 방식과 없는 방식 양쪽에서 쓰이고,
  //   키워드 검색 자체는 채널만 있으면 된다(채널 미선택은 위저드가 이 화면을 그리기 전에 막는다)
  interface Props {
    // 이번 생성의 목적 키워드(위저드가 소유)
    keywords: string[];
    // 키워드 검색 화면으로 전환(부모가 그 전환을 소유한다)
    onGenerate: () => void;
  }
  let { keywords, onGenerate }: Props = $props();
</script>

<section class="flex flex-col gap-2">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h3 class="text-sm font-medium text-fg">
      목적 키워드
      <span class="ml-1 align-middle text-xs font-normal text-fg-subtle">(선택)</span>
    </h3>
    <div class="flex items-center gap-2">
      <span class="text-xs text-fg-subtle">고르면 그 키워드가 기획서의 주제가 됩니다</span>
      <button
        type="button"
        onclick={onGenerate}
        class="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
      >
        키워드 검색
      </button>
    </div>
  </div>

  {#if keywords.length === 0}
    <p class="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-fg-subtle">
      키워드 없이 생성하면 브랜드와 브랜드 설명이 주제가 됩니다. 주제를 정해 두려면 '키워드 검색'에서 고르세요.
    </p>
  {:else}
    <div class="flex flex-wrap gap-2">
      {#each keywords as value (value)}
        <span class="rounded-full bg-accent-bg px-3 py-1 text-sm text-accent-fg">{value}</span>
      {/each}
    </div>
  {/if}
</section>

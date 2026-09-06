<script lang="ts" module>
  export type NavIcon =
    | 'video'
    | 'archive'
    | 'asset'
    | 'process'
    | 'price'
    | 'log'
    | 'settings';
  export type NavItem = { key: string; label: string; icon: NavIcon };
</script>

<script lang="ts">
  // 마케팅 영상 제작 nav: landscape=좌측 세로 사이드바 / portrait=상단 가로 보조앱바
  // 순수 표현 컴포넌트: 항목/활성/선택은 페이지가 소유해 prop 으로 내려준다(콘텐츠 전환이 페이지 관심사)
  // 방향(portrait)도 페이지가 viewportModeStore 로 판정해 내려준다(단일 출처)
  interface Props {
    portrait: boolean;
    items: NavItem[];
    activeKey: string;
    onSelect: (key: string) => void;
    onCreate: () => void;
    // 생성 버튼 라벨. 버전마다 다르므로(아래 스니펫 주석) 페이지가 정해 내려준다.
    createLabel: string;
  }

  // 설정은 별도 prop 이 아니라 items 의 한 항목이다. 다른 섹션과 같은 라우트 규칙을 타므로
  //   onSelect 하나로 이동이 끝나고, 활성 하이라이트도 activeKey 로 자동 처리된다.
  let { portrait, items, activeKey, onSelect, onCreate, createLabel }: Props = $props();

  // 세로 휠 → 가로 스크롤 변환(portrait 보조앱바). 실제로 가로 오버플로가 있을 때만 가로채
  // 다른 레이아웃/세로 스크롤 동작에 영향을 주지 않는다.
  function handleWheel(e: WheelEvent): void {
    const el = e.currentTarget as HTMLElement;
    if (e.deltaY === 0 || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  }
</script>

{#snippet icon(name: NavIcon)}
  <svg
    class="h-5 w-5 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {#if name === 'video'}
      <!-- 영상제작(비디오 카메라) -->
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="M15 10.5 21 7v10l-6-3.5" />
    {:else if name === 'archive'}
      <!-- 보관함(아카이브) -->
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    {:else if name === 'asset'}
      <!-- 에셋(겹친 레이어 = 재사용 소재 컬렉션) -->
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    {:else if name === 'process'}
      <!-- 프로세스(노드 플로우 = 연결된 제작 스텝) -->
      <rect x="3" y="4" width="7" height="4" rx="1" />
      <rect x="14" y="10" width="7" height="4" rx="1" />
      <rect x="3" y="16" width="7" height="4" rx="1" />
      <path d="M10 6h2a2 2 0 0 1 2 2v2" />
      <path d="M10 18h2a2 2 0 0 0 2-2v-2" />
    {:else if name === 'price'}
      <!-- 가격표(가격 태그) -->
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    {:else if name === 'log'}
      <!-- 로그(문서 + 기록 라인) -->
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    {:else}
      <!-- 설정(톱니): NavIcon 의 마지막 값이라 else 로 받는다(분기 누락 시 여기로 떨어져 눈에 띈다) -->
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    {/if}
  </svg>
{/snippet}

{#snippet createButton(compact: boolean)}
  <!-- 영상 제작 진입점: 라운드 긴 버튼. 여는 것은 두 버전 모두 기획서 생성 모달이고 지금 산출물도
       기획안이다. v1.5 라벨이 '영상 생성'인 것은 이 흐름이 향하는 목적지를 가리키기 때문이다.
       (v1.5.0 아카이브의 판단을 그대로 따른다). 라벨만 다르고 동작은 같다. -->
  <button
    type="button"
    onclick={onCreate}
    class="flex shrink-0 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-brand-grad-from),var(--color-brand-grad-to))] px-4 py-2 text-sm font-medium text-white shadow-sm transition [text-shadow:0_1px_2px_rgba(0,0,0,0.28)] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 {compact
      ? ''
      : 'w-full'}"
  >
    <svg
      class="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
    <span class="truncate">{createLabel}</span>
  </button>
{/snippet}

{#snippet navItem(item: NavItem)}
  <button
    type="button"
    onclick={() => onSelect(item.key)}
    class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 {activeKey ===
    item.key
      ? 'bg-hover font-medium text-fg'
      : 'text-fg-subtle hover:bg-hover hover:text-fg'}"
    aria-current={activeKey === item.key ? 'page' : undefined}
  >
    {@render icon(item.icon)}
    <span class="truncate">{item.label}</span>
  </button>
{/snippet}


{#if portrait}
  <!-- 보조앱바(가로): portrait 전환. 생성 버튼=좌측 고정 + 구분선, 그 우측 항목들만 가로 스크롤 -->
  <nav
    class="flex w-full shrink-0 items-center gap-1 border-b border-line bg-surface px-2 py-1.5"
  >
    {@render createButton(true)}
    <!-- 구분선(세로): 좌측 고정 생성 버튼과 스크롤 항목 분리 -->
    <div class="h-6 w-px shrink-0 bg-line"></div>
    <!-- 섹션 항목(설정 포함): 가로 스크롤 영역. 휠 세로→가로 변환 -->
    <div
      class="glass-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      onwheel={handleWheel}
    >
      {#each items as item (item.key)}
        {@render navItem(item)}
      {/each}
    </div>
  </nav>
{:else}
  <!-- 좌측 사이드바(세로): landscape. 설정까지 전부 섹션 항목이라 하단 고정 블록이 없다.
       뒤로가기도 없다: 이 도구는 새 탭으로 열리므로 나가는 방법은 탭을 닫거나 앱바 로고로
     로비 탭으로 전환하는 것이다. -->
  <nav class="flex w-48 shrink-0 flex-col gap-1 border-r border-line bg-surface p-2">
    {@render createButton(false)}
    <div class="my-1 border-t border-line"></div>
    {#each items as item (item.key)}
      {@render navItem(item)}
    {/each}
  </nav>
{/if}

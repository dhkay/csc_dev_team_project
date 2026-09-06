<script lang="ts">
  // 워크스페이스 모드 드롭다운: 탭 토글 우측. 보기 / 삭제 를 전환한다.
  //   보기: 평소(기획안 타일 클릭=상세, 각 기획안/영상 우상단 빈 토글로 선택)
  //   삭제: 여러 항목을 체크해 하단 바에서 일괄 삭제
  //   '영상 만들기'(기획안)와 '세트 적용'(원천 영상)은 별도 모드가 아니라 보기 모드에서 타일 선택 → 하단 바가 담당한다.
  //   선택 UI(체크박스)/하단 액션바는 영상만들기, 세트적용, 삭제가 공유한다. 탭/모드에 따라 바의 동작만 다르다.
  //   ChannelSwitcher 의 드롭다운 관용(open 상태 + 바깥클릭 닫기 + role=menu)을 따른다.
  export type WorkspaceMode = 'view' | 'delete';

  interface Props {
    value: WorkspaceMode;
    onChange: (mode: WorkspaceMode) => void;
    // 메뉴가 트리거의 어느 쪽 모서리에 맞춰 열리는가
    //
    // 기본은 'end'(오른쪽 모서리)다. 트리거 왼쪽에 다른 컨트롤이 있으면 메뉴가 그 위로 펼쳐져
    // 자연스럽다. 트리거가 줄의 맨 앞이면 'start' 로 연다: 그때 'end' 로 열면 메뉴가 버튼
    // 왼쪽으로 삐져나와 아래 그리드와 어긋난 자리에 뜬다(왼쪽에 걸칠 것이 아무것도 없다)
    align?: 'start' | 'end';
  }
  let { value, onChange, align = 'end' }: Props = $props();

  const LABEL: Record<WorkspaceMode, string> = {
    view: '보기',
    delete: '삭제하기',
  };
  // 트리거 색: 활성 모드가 한눈에 보이게. 삭제=위험(danger), 보기=기본
  const TRIGGER_CLASS: Record<WorkspaceMode, string> = {
    view: 'border-line bg-elevated text-fg hover:bg-hover focus-visible:ring-brand/40',
    delete:
      'border-danger-fg/40 bg-danger-bg text-danger-fg hover:opacity-90 focus-visible:ring-danger-fg/40',
  };

  let open = $state(false);
  let container = $state<HTMLElement | null>(null);

  function select(mode: WorkspaceMode): void {
    onChange(mode);
    open = false;
  }

  // 바깥 클릭 시 닫기
  $effect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (container && !container.contains(e.target as Node)) open = false;
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  });
</script>

<div class="relative" bind:this={container}>
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-haspopup="menu"
    aria-expanded={open}
    class="flex items-center gap-1 rounded-md border px-2 py-1 text-sm transition focus:outline-none focus-visible:ring-2 {TRIGGER_CLASS[
      value
    ]}"
  >
    <span>{LABEL[value]}</span>
    <svg
      class="h-4 w-4 shrink-0 transition {open ? 'rotate-180' : ''}"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>

  {#if open}
    <div
      role="menu"
      class="absolute top-full z-50 mt-1 flex w-36 flex-col overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg {align ===
      'start'
        ? 'left-0'
        : 'right-0'}"
    >
      <button
        type="button"
        role="menuitemradio"
        aria-checked={value === 'view'}
        onclick={() => select('view')}
        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {value ===
        'view'
          ? 'font-medium'
          : ''}"
      >
        보기
      </button>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={value === 'delete'}
        onclick={() => select('delete')}
        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-danger-fg transition hover:bg-danger-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-fg/40 {value ===
        'delete'
          ? 'font-medium'
          : ''}"
      >
        <svg
          class="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
        삭제하기
      </button>
    </div>
  {/if}
</div>

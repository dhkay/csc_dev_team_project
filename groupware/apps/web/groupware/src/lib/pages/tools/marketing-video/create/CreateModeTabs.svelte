<script lang="ts">
  // 생성 모달 상단의 입력 방식 탭(컨셉입력 / 프롬프트)
  //
  // radiogroup 이 아니라 tablist 인 이유는 아래 본문이 통째로 바뀌기 때문이다. 라디오로 표기하면
  // 스크린리더가 설정 하나를 고르는 것으로 읽어 화면이 바뀐 사실을 알리지 못한다. 앱바의
  // VersionModeToggle 은 주소를 바꾸는 설정이라 반대로 radiogroup 이 맞다.
  //
  // 알약 모양인 이유는 모달 본문 위에 떠 있는 전환기라, 밑줄 탭처럼 경계선에 붙이면 그 아래 폼과
  // 한 덩어리로 읽히기 때문이다.
  //
  // 선택지가 하나면 부모가 아예 그리지 않는다. 탭을 그릴지와 어떤 탭이 있는지가 같은 사실이라
  // 여기서 다시 판단하지 않는다.
  import { CREATE_MODE_META, type CreateMode } from '../versionProfile';

  interface Props {
    // 그릴 탭 목록(배열 순서 = 표시 순서). 프로필이 준다.
    modes: readonly CreateMode[];
    // 지금 고른 방식
    value: CreateMode;
    onSelect: (mode: CreateMode) => void;
  }
  let { modes, value, onSelect }: Props = $props();
</script>

<div class="flex shrink-0 gap-1.5" role="tablist" aria-label="입력 방식">
  {#each modes as mode (mode)}
    {@const active = value === mode}
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onclick={() => onSelect(mode)}
      class="rounded-lg border px-3.5 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 {active
        ? 'border-brand bg-surface font-medium text-accent-fg'
        : 'border-transparent bg-hover text-fg-subtle hover:text-fg'}"
    >
      {CREATE_MODE_META[mode].label}
    </button>
  {/each}
</div>

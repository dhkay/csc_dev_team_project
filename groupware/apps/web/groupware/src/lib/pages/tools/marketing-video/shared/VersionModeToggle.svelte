<script lang="ts">
  // 앱바 모드 토글. 도구 UI 버전(v1.5 / v1.0)을 고른다.
  //
  // 지금 버전은 주소가 소유한다(`page.params.version`). 이 컴포넌트는 표현만 담당하고, 고르면
  // 부모가 그 버전의 URL 로 이동한다. 상태 변경이 아니라 이동이다.
  //
  // 유리 칸이 버튼 배경이 아니라 별도 요소 하나인 이유는 두 칸 사이를 이동하는 모션 때문이다.
  // 배경색을 칸마다 켜고 끄면 위치가 순간이동해 어디서 어디로 갔는지 보이지 않는다.
  //
  // 유리 칸은 DOM 에서 버튼보다 앞이고 버튼은 `relative` 다. 순서가 뒤집히면 backdrop-blur 가
  // 자기 위의 글자까지 흐린다.
  //
  // radiogroup 인 이유는 탭이 아니라 둘 중 하나를 고르는 설정이기 때문이다. 탭으로 표기하면
  // 스크린리더가 패널 전환을 기대한다.
  import {
    VERSION_MODES,
    type VersionMode,
  } from '$lib/shared/lib/versionMode/versionMode';

  interface Props {
    value: VersionMode;
    onChange: (mode: VersionMode) => void;
  }
  let { value, onChange }: Props = $props();

  function select(mode: VersionMode): void {
    if (mode !== value) onChange(mode);
  }

  const count = VERSION_MODES.length;
  // 못 찾으면 0: 유리 칸이 트랙 밖으로 나가는 것보다 첫 칸에 있는 편이 낫다.
  const activeIndex = $derived(Math.max(0, VERSION_MODES.indexOf(value)));
  // 트랙 좌우 패딩(p-0.5 두 쪽 = 0.25rem)을 뺀 폭을 칸 수로 나눈다.
  const thumbWidth = `calc((100% - 0.25rem) / ${count})`;
</script>

<div
  role="radiogroup"
  aria-label="도구 버전 모드"
  class="relative inline-grid shrink-0 rounded-lg border border-glass-line bg-glass-track p-0.5 shadow-inner"
  style:grid-template-columns={`repeat(${count}, minmax(0, 1fr))`}
>
  <!-- 미끄러지는 유리 칸. aria 에서는 감춘다(상태는 각 radio 의 aria-checked 가 말한다) -->
  <span
    aria-hidden="true"
    class="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-md bg-glass ring-1 ring-glass-line
           shadow-[0_1px_3px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.9)]
           backdrop-blur-lg backdrop-saturate-150 transition-transform duration-300 ease-out
           motion-reduce:transition-none
           dark:shadow-[0_1px_3px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.16)]"
    style:width={thumbWidth}
    style:transform={`translateX(${activeIndex * 100}%)`}
  ></span>

  {#each VERSION_MODES as mode (mode)}
    {@const active = value === mode}
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onclick={() => select(mode)}
      class="relative rounded-md px-2.5 py-0.5 text-sm tabular-nums transition-colors active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-surface {active
        ? 'font-semibold text-accent-fg'
        : 'text-fg-subtle hover:text-fg'}"
    >
      {mode}
    </button>
  {/each}
</div>
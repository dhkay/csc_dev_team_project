<script lang="ts">
  // 작업자가 직접 적는 지시 한 칸(선택). 씬/사용자 입력사항(무엇을 담을지)과 제한사항(무엇을
  // 피할지) 둘이 이 컴포넌트를 쓴다. 뜻은 반대지만 다루는 방식이 같아 한 컴포넌트로 둔다.
  // 따로 두면 한쪽의 규칙만 고쳐 두 칸이 다르게 동작하는 상태가 생긴다.
  //
  // 공백만 적은 것은 적지 않은 것으로 본다. 그러지 않으면 개행 하나가 지시로 나가 모델이 빈
  // 요구사항을 해석하려 든다.
  //
  // 글자 수 상한이 없다. 이 값이 가는 곳은 기획 LLM 의 프롬프트이고 그 맥락이 훨씬 커서 사람이
  // 적을 만한 길이에 걸릴 상한이 없다. 글자 수는 막는 값이 아니라 얼마나 적었는지 아는 값이다.

  interface Props {
    // 칸 제목(예: '씬 / 사용자 입력사항'). '(선택)' 은 이 컴포넌트가 붙인다.
    title: string;
    // 지금 값. 빈 문자열 = 미입력
    value: string;
    onChange: (next: string) => void;
    // 입력 예시. 무엇을 어떻게 적는지는 예시가 설명한다(별도 안내문을 두지 않는다)
    placeholder: string;
  }
  let { title, value, onChange, placeholder }: Props = $props();

  /** 실제로 나가는 글자 수. 공백만이면 0이다(미입력과 같게 센다) */
  const used = $derived(value.trim().length);

  /**
   * 칸 높이는 예시가 다 보이는 만큼이다.
   *
   * 예시가 이 칸의 유일한 안내인데 마지막 줄이 잘려 보이면 안내가 아니다. 고정 행수로 두면 예시를
   * 한 줄 늘릴 때마다 그 사실을 여기서 따로 기억해야 하고, 실제로는 기억하지 못한다.
   * 하한을 두는 이유는 한 줄짜리 예시에서 칸이 지나치게 납작해지지 않게 하려는 것이다.
   * (`resize-y` 라 사람이 더 늘릴 수 있다. 이 값은 처음 보이는 높이일 뿐이다.)
   */
  const rows = $derived(Math.max(5, placeholder.split('\n').length));
</script>

<section class="flex flex-col gap-2">
  <div class="flex flex-col gap-0.5">
    <h4 class="text-sm font-semibold text-fg">
      {title}
      <span class="ml-1 text-xs font-normal text-fg-subtle">(선택)</span>
    </h4>
    <p class="text-xs text-fg-subtle">직접 입력</p>
  </div>

  <textarea
    {value}
    {placeholder}
    oninput={(e) => onChange(e.currentTarget.value)}
    {rows}
    class="w-full resize-y rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm leading-relaxed text-fg placeholder:text-fg-subtle/70 transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
  ></textarea>

  <!-- 안내는 왼쪽, 적은 글자 수는 오른쪽. 한 줄에 두 사실이라 가운데를 비워 시선이 갈린다.
       상한이 없으므로 "남은 글자" 가 아니라 적은 글자를 센다(막는 값이 아니다) -->
  <div class="flex items-baseline justify-between gap-3 text-[11px] text-fg-subtle">
    <span>공백만 입력 시 미입력으로 처리</span>
    <span class="shrink-0 tabular-nums">{used}자</span>
  </div>
</section>

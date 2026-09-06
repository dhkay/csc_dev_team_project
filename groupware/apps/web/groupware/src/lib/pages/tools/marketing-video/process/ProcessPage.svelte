<script lang="ts">
  // 프로세스(읽기전용): 마케팅 영상이 실제로 만들어지는 전체 파이프라인을 제작 단계 × 실행 스텝으로
  //   세로 타임라인에 흐르게 보여준다. 스텝마다 순차/병렬을 배지로 표기
  //   단계 구성은 서버가 버전별로 만들어 준다(PLAN_PROCESS_VIEWS 의 버전별 빌더). 이 화면은 받은 것을 그릴 뿐이라
  //   버전 조건을 갖지 않는다: 여기에 조건을 두면 서버와 화면이 서로 다른 파이프라인을 말하게 된다.
  //   프롬프트 스텝은 "언제/몇 번/어떻게" 나가는지(injection)를 요약으로 항상 보여주고, 펼치면:
  //     - 실제 주입 정보(대상/횟수/시점/조립/조건/산출),
  //     - "모델이 받는 하나의 컨텍스트" 를 계층 트리로(루트 → 시스템(규칙/계약)/유저(실제 데이터) → 각 노드),
  //       각 노드 옆 ↔ 태그로 시스템 규칙 ↔ 유저 데이터 교차참조를 항상 표시(클릭 없이도 관계가 보인다),
  //     - 노드 클릭 시 실제로 나가는 값과 연결 강조
  //   내부 하위단계가 있는 스텝(씬 클립 생성)은 하위단계로 프롬프트 주입 지점을 표시한다.
  import type {
    ProcessView,
    ProcessStep,
    ProcessSubstep,
    PromptInjection,
    PromptNode,
    PromptNodeKind,
    StepExecution,
  } from '$lib/features/marketing-channels/types';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import PlanPromptModal from '../shared/PlanPromptModal.svelte';

  interface Props {
    process: ProcessView;
    channelId: number | null;
    // 이 화면이 그리는 파이프라인의 버전: 지침 편집도 그 버전 슬롯에 저장된다.
    version: VersionMode;
    canEdit: boolean;
  }
  let { process, channelId, version, canEdit }: Props = $props();

  let editorOpen = $state(false);

  // 스텝 펼침 / 스텝별 선택 노드 / 트리 가지(시스템, 유저 phase) 접힘
  let openMap = $state<Record<string, boolean>>({});
  let selectedByStep = $state<Record<string, string>>({});
  let branchClosed = $state<Record<string, boolean>>({}); // 기본 펼침, 닫으면 true.

  function toggleStep(id: string): void {
    openMap[id] = !openMap[id];
  }
  function toggleBranch(key: string): void {
    branchClosed[key] = !branchClosed[key];
  }

  function stepNodes(step: ProcessStep): PromptNode[] {
    return step.prompts.flatMap((p) => p.nodes);
  }
  function selectedNode(step: ProcessStep): PromptNode | null {
    const nodes = stepNodes(step);
    return nodes.find((n) => n.id === selectedByStep[step.id]) ?? nodes[0] ?? null;
  }

  const EMPTY: ReadonlySet<string> = new Set();
  /** 스텝 노드들의 교차참조를 양방향 인접맵으로. 시스템 노드의 links(→유저)에서 역방향까지 채운다. */
  function linkAdjacency(step: ProcessStep): Map<string, Set<string>> {
    const adj = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a)!.add(b);
    };
    for (const node of stepNodes(step)) {
      for (const to of node.links ?? []) {
        add(node.id, to);
        add(to, node.id);
      }
    }
    return adj;
  }

  const EXEC: Record<StepExecution, { label: string; badge: string }> = {
    sequential: { label: '순차', badge: 'border border-line text-fg-subtle' },
    parallel: { label: '병렬', badge: 'bg-accent-bg font-medium text-accent-fg' },
  };

  const KIND: Record<PromptNodeKind, { label: string; badge: string }> = {
    fixed: { label: '고정', badge: 'border border-line text-fg-subtle' },
    editable: { label: '편집 가능', badge: 'bg-accent-bg font-medium text-accent-fg' },
    conditional: { label: '조건부', badge: 'border border-dashed border-line text-fg-subtle' },
    injected: { label: '생성 시 주입', badge: 'bg-hover text-fg-subtle' },
  };
</script>

<div class="mx-auto flex max-w-2xl flex-col gap-5 pb-8">
  <!-- 머리말 + 범례 -->
  <header class="flex flex-col gap-2">
    <h1 class="text-lg font-semibold text-fg">프로세스</h1>
    <p class="text-sm leading-relaxed text-fg-subtle">
      마케팅 영상이 실제로 만들어지는 순서입니다. 각 스텝의 <span class="font-medium text-fg">순차/병렬</span> 실행 특성을
      배지로 표시하고, 프롬프트가 주입되는 스텝은 <span class="font-medium text-accent-fg">언제, 몇 번, 어떻게</span> 나가는지
      요약을 함께 보여줍니다. 토글을 펼치면 실제 호출 정보와, 모델이 받는 컨텍스트를 트리로 봅니다. 각 항목 옆
      <span class="font-medium text-accent-fg">↔</span> 는 실제 프롬프트 교차참조(시스템 규칙이 쓰는 유저 데이터, 또는 그 반대)입니다.
    </p>
    <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
      {#each Object.values(EXEC) as e}
        <span class="rounded-full px-2 py-0.5 text-[11px] {e.badge}">{e.label}</span>
      {/each}
      <span class="mx-1 h-3 w-px bg-line" aria-hidden="true"></span>
      {#each Object.values(KIND) as k}
        <span class="rounded-full px-2 py-0.5 text-[11px] {k.badge}">{k.label}</span>
      {/each}
    </div>
  </header>

  {#if process.stages.length === 0}
    <p class="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-fg-subtle">
      프로세스 정보를 불러오지 못했습니다. 채널을 확인해 주세요.
    </p>
  {:else}
    <!-- 세로 타임라인: 제작 단계(3) → 스텝 순서대로 -->
    <div class="flex flex-col gap-3">
      {#each process.stages as stage, si (stage.id)}
        <section class="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5">
          <!-- 단계 헤더 -->
          <div class="flex items-baseline gap-2">
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fg text-[10px] font-semibold text-surface">{si + 1}</span>
            <h2 class="text-sm font-semibold text-fg">{stage.title}</h2>
            {#if stage.subtitle}<span class="min-w-0 flex-1 text-[11px] text-fg-subtle">{stage.subtitle}</span>{/if}
          </div>

          <!-- 스텝 목록 -->
          <div class="flex flex-col gap-1.5">
            {#each stage.steps as step, sti (step.id)}
              {@const exec = EXEC[step.execution]}
              {@const open = openMap[step.id] ?? false}
              <div class="flex flex-col gap-2 rounded-lg border bg-elevated p-2.5 {open ? 'border-accent-fg/40' : 'border-line'}">
                <!-- 스텝 헤더: 프롬프트 스텝이면 토글 버튼, 아니면 정적 헤더 -->
                {#if step.usesPrompt}
                  <button
                    type="button"
                    onclick={() => toggleStep(step.id)}
                    aria-expanded={open}
                    class="flex items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                  >
                    {@render stepHead(sti, step, exec)}
                    <span class="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent-fg">
                      {open ? '접기' : '프롬프트'}
                      <svg class="h-4 w-4 transition-transform {open ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                    </span>
                  </button>
                {:else}
                  <div class="flex items-center gap-2">
                    {@render stepHead(sti, step, exec)}
                    <span class="ml-auto shrink-0 rounded-full border border-dashed border-line px-1.5 py-px text-[9px] text-fg-subtle">프롬프트 없음</span>
                  </div>
                {/if}

                {#if step.subtitle}
                  <p class="text-[11px] leading-relaxed text-fg-subtle">{step.subtitle}</p>
                {/if}

                <!-- 주입 요약(항상 표시) -->
                {#if step.injection}
                  <p class="flex items-start gap-1.5 rounded-md bg-accent-bg px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-accent-fg">
                    <svg class="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4.09 12.11a1 1 0 0 0 .78 1.64H11l-1 8.25 8.91-10.36a1 1 0 0 0-.78-1.64H12z" /></svg>
                    <span>주입: {step.injection.summary}</span>
                  </p>
                {/if}

                <!-- 내부 하위단계(있을 때) -->
                {#if step.substeps && step.substeps.length > 0}
                  {@render substepRow(step.substeps)}
                {/if}

                {#if step.note}
                  <p class="rounded-md border border-dashed border-line bg-surface px-2.5 py-1.5 text-[11px] leading-relaxed text-fg-subtle">ⓘ {step.note}</p>
                {/if}

                <!-- 프롬프트 펼침: 실제 주입 + 컨텍스트 트리 + 선택 상세 -->
                {#if step.usesPrompt && open}
                  {@const selected = selectedNode(step)}
                  {@const adj = linkAdjacency(step)}
                  {@const linkedIds = selected ? (adj.get(selected.id) ?? EMPTY) : EMPTY}
                  {@const nodeById = new Map(stepNodes(step).map((n) => [n.id, n]))}
                  {@const merged = step.prompts.length > 1}
                  <div class="flex flex-col gap-4 border-t border-line pt-3">
                    {#if step.injection}{@render injectionDetail(step.injection)}{/if}

                    <!-- 모델이 받는 하나의 컨텍스트: 계층 트리 -->
                    <div class="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
                      <div class="flex flex-col gap-0.5">
                        <span class="text-xs font-semibold text-fg">모델이 받는 하나의 컨텍스트</span>
                        <p class="text-[11px] leading-relaxed text-fg-subtle">
                          {merged
                            ? '시스템(규칙/계약)과 유저(실제 데이터)가 한 요청으로 합쳐집니다. 각 항목 옆 ↔ 는 실제 교차참조: 시스템 규칙이 쓰는 유저 데이터(또는 그 반대). 항목을 누르면 그 값과 연결이 강조됩니다.'
                            : '이 호출에 들어가는 프롬프트입니다. 항목을 누르면 실제로 나가는 값이 나옵니다.'}
                        </p>
                      </div>

                      <div class="flex flex-col gap-1">
                        {#each step.prompts as phase (phase.id)}
                          {@const bkey = `${step.id}:${phase.id}`}
                          {@const bopen = !(branchClosed[bkey] ?? false)}
                          <div class="flex flex-col">
                            <button
                              type="button"
                              onclick={() => toggleBranch(bkey)}
                              aria-expanded={bopen}
                              class="flex items-center gap-1.5 rounded-md px-1 py-1 text-left transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                            >
                              <svg class="h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform {bopen ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                              <span class="text-xs font-semibold text-fg">{phase.title}</span>
                              {#if phase.subtitle}<span class="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">{phase.subtitle}</span>{/if}
                            </button>
                            {#if bopen}
                              <ul class="ml-[9px] flex flex-col border-l border-line">
                                {#each phase.nodes as node (node.id)}
                                  {@render leaf(step.id, node, selected?.id, linkedIds, adj, nodeById)}
                                {/each}
                              </ul>
                            {/if}
                          </div>
                        {/each}
                      </div>

                      {#if step.injection?.output}
                        <p class="flex items-start gap-1.5 border-t border-dashed border-line pt-2 text-[11px] leading-relaxed text-fg-subtle">
                          <span class="shrink-0 font-medium text-fg-subtle">↓ 산출</span>
                          <span>{step.injection.output}</span>
                        </p>
                      {/if}
                    </div>

                    <!-- 선택 노드 상세 -->
                    {#if selected}
                      {@const meta = KIND[selected.kind]}
                      {@const isRule = (selected.links?.length ?? 0) > 0}
                      {@const linkedNodes = [...linkedIds].map((id) => nodeById.get(id)).filter((n): n is PromptNode => !!n)}
                      <div class="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-sm font-semibold text-fg">{selected.title}</span>
                          <span class="rounded-full px-2 py-0.5 text-[10px] {meta.badge}">{meta.label}</span>
                          {#if selected.kind === 'editable' && canEdit}
                            <button
                              type="button"
                              onclick={() => (editorOpen = true)}
                              class="ml-auto shrink-0 rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                            >
                              편집
                            </button>
                          {/if}
                        </div>
                        {#if selected.note}
                          <p class="text-[11px] leading-relaxed text-fg-subtle">ⓘ {selected.note}</p>
                        {/if}

                        {#if linkedNodes.length > 0}
                          <div class="flex flex-col gap-1 rounded-md bg-accent-bg/40 px-2.5 py-2">
                            <span class="text-[10px] font-medium text-accent-fg">
                              {isRule ? '이 규칙이 참조하는 유저 데이터' : '이 데이터를 쓰는 시스템 규칙'}
                            </span>
                            <div class="flex flex-wrap gap-1">
                              {#each linkedNodes as ln (ln.id)}
                                <button
                                  type="button"
                                  onclick={() => (selectedByStep[step.id] = ln.id)}
                                  class="rounded-md border border-accent-fg/40 bg-surface px-2 py-0.5 text-[11px] text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                                >
                                  {ln.title}
                                </button>
                              {/each}
                            </div>
                          </div>
                        {/if}

                        <div class="flex min-w-0 flex-col gap-1">
                          <span class="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">실제로 나가는 값</span>
                          <pre class="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-elevated px-3 py-2 text-[12px] leading-relaxed text-fg">{selected.content}</pre>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- 스텝 사이 순차 커넥터(아래 화살표) -->
              {#if sti < stage.steps.length - 1}
                <div class="flex justify-center py-0.5">
                  <svg class="h-4 w-4 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></svg>
                </div>
              {/if}
            {/each}
          </div>
        </section>

        <!-- 단계 사이 커넥터 -->
        {#if si < process.stages.length - 1}
          <div class="flex justify-center">
            <svg class="h-5 w-5 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></svg>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<!-- 스텝 헤더 공통(순번 + 제목 + 순차/병렬 배지) -->
{#snippet stepHead(index: number, step: ProcessStep, exec: { label: string; badge: string })}
  <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-hover text-[10px] font-semibold text-fg-subtle">{index + 1}</span>
  <span class="text-[13px] font-medium text-fg">{step.title}</span>
  <span class="shrink-0 rounded-full px-1.5 py-px text-[10px] {exec.badge}">{exec.label}</span>
{/snippet}

<!-- 트리 잎(프롬프트 노드): 트리 라인 tick + 클릭 선택 + 종류 배지 + ↔ 교차참조 태그 -->
{#snippet leaf(
  stepId: string,
  node: PromptNode,
  activeId: string | undefined,
  linkedIds: ReadonlySet<string>,
  adj: Map<string, Set<string>>,
  nodeById: Map<string, PromptNode>,
)}
  {@const meta = KIND[node.kind]}
  {@const active = activeId === node.id}
  {@const linked = linkedIds.has(node.id)}
  {@const tags = [...(adj.get(node.id) ?? [])].map((id) => nodeById.get(id)?.title).filter((t): t is string => !!t)}
  <li class="relative pl-3">
    <span class="absolute left-0 top-[15px] h-px w-3 bg-line" aria-hidden="true"></span>
    <button
      type="button"
      onclick={() => (selectedByStep[stepId] = node.id)}
      class="my-0.5 flex w-full flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {active
        ? 'border-accent-fg/60 bg-accent-bg/40 ring-1 ring-accent-fg/50'
        : linked
          ? 'border-accent-fg/40 bg-accent-bg/25'
          : 'border-line hover:bg-hover'}"
    >
      <span class="flex items-center gap-1.5">
        <span class="shrink-0 rounded-full px-1.5 py-px text-[9px] {meta.badge}">{meta.label}</span>
        <span class="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">{node.title}</span>
      </span>
      {#if tags.length > 0}
        <span class="pl-0.5 text-[10px] leading-snug text-accent-fg/90">↔ {tags.join(', ')}</span>
      {/if}
    </button>
  </li>
{/snippet}

<!-- 내부 하위단계 흐름: 프롬프트 주입 지점을 강조한 칩 행 + 주입 지점 설명 -->
{#snippet substepRow(substeps: ProcessSubstep[])}
  <div class="flex flex-col gap-1 rounded-md border border-line bg-surface px-2.5 py-2">
    <span class="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">씬 하나당 내부 순서</span>
    <div class="flex flex-wrap items-center gap-1">
      {#each substeps as ss, i (ss.id)}
        <span
          class="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] {ss.injectsPrompt
            ? 'border-accent-fg/50 bg-accent-bg font-medium text-accent-fg'
            : 'border-line text-fg-subtle'}"
          title={ss.note ?? ss.title}
        >
          {ss.title}
          {#if ss.injectsPrompt}
            <span class="rounded-full bg-accent-fg/15 px-1 text-[9px]">프롬프트 주입</span>
          {/if}
        </span>
        {#if i < substeps.length - 1}
          <svg class="h-3.5 w-3.5 shrink-0 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
        {/if}
      {/each}
    </div>
    {#each substeps.filter((s) => s.injectsPrompt && s.note) as inj (inj.id)}
      <p class="text-[11px] leading-relaxed text-fg-subtle">↳ {inj.note}</p>
    {/each}
  </div>
{/snippet}

<!-- 실제 주입 상세(펼침): 대상/횟수/시점/조립/조건/산출 -->
{#snippet injectionDetail(inj: PromptInjection)}
  <div class="flex flex-col gap-2 rounded-lg border border-accent-fg/40 bg-accent-bg/40 p-3">
    <span class="flex items-center gap-1.5 text-xs font-semibold text-accent-fg">
      <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4.09 12.11a1 1 0 0 0 .78 1.64H11l-1 8.25 8.91-10.36a1 1 0 0 0-.78-1.64H12z" /></svg>
      실제 주입 (이 시점에 나가는 호출)
    </span>
    <dl class="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 text-[11px] leading-relaxed">
      {@render injRow('대상', inj.target)}
      {@render injRow('횟수', inj.cardinality)}
      {@render injRow('시점', inj.timing)}
      {@render injRow('조립', inj.assembly)}
      {#if inj.condition}{@render injRow('조건', inj.condition)}{/if}
      {#if inj.output}{@render injRow('산출', inj.output)}{/if}
    </dl>
  </div>
{/snippet}

{#snippet injRow(label: string, value: string)}
  <dt class="shrink-0 font-medium text-fg-subtle">{label}</dt>
  <dd class="min-w-0 text-fg">{value}</dd>
{/snippet}

<PlanPromptModal bind:open={editorOpen} {channelId} {version} />

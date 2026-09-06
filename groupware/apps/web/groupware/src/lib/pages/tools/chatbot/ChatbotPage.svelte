<script lang="ts">
  import { onMount } from 'svelte';
  import { aiChatService } from '$lib/features/ai-chat/services/aiChat.service';
  import type { ChatMessage, ChatModel, ChatSession } from '$lib/features/ai-chat/types';

  // AI 챗봇 팝아웃 페이지: 네이티브 window.open 창을 꽉 채우는 채팅 UI.
  // language-model(재사용 LLM 역량)로 SSE 스트리밍한다. 조직 소속원 개인별 세션(신원은 BFF 가 주입)
  let seq = 0;
  const localId = () => `local-${(seq += 1)}`;

  const GREETING: ChatMessage = {
    id: 'greeting',
    role: 'assistant',
    content: '안녕하세요! AI 어시스턴트입니다. 무엇을 도와드릴까요?'
  };

  let messages = $state<ChatMessage[]>([GREETING]);
  let draft = $state('');
  let sessionId = $state<string | null>(null);
  let sessions = $state<ChatSession[]>([]);
  let streaming = $state(false);
  let errorMsg = $state<string | null>(null);
  let abort: AbortController | null = null;

  let listEl = $state<HTMLDivElement>();
  let inputEl = $state<HTMLTextAreaElement>();

  // 모델 선택
  // 목록/능력/기본값의 진실원은 백엔드 카탈로그(GET /api/ai-chat/models). 프론트는 받아 렌더만 한다.
  //   초기 선택은 응답의 is_default(조직 기본 모델, 미설정 시 내장 Qwen)를 따른다: 조직이 고른 모델이
  //   화면에 반영되게 하려면 프론트가 자기 상수로 정하면 안 된다.
  // language-model 미도달 시 표시할 기본값(dev 모델 기준). language-model 가 뜨면 카탈로그가 이 값을 대체한다.
  //   id 는 카탈로그 key(= aiModelOptions/단가표와 통일된 네임스페이스)와 같은 값을 쓴다. 목록이
  //   도달하면 loadModels 가 선택을 보정하지만, 폴백 상태에서 보낸 값도 그대로 해석돼야 한다.
  const FALLBACK_MODEL: ChatModel = {
    id: 'internal-qwen3',
    label: 'Qwen',
    serving: 'self',
    vendor: 'Qwen',
    available: true,
    supports_thinking: false,
    params: '4B',
    description: 'Qwen3 4B Instruct',
    context_length: 4096
  };
  let models = $state<ChatModel[]>([]);
  let selectedModelId = $state('internal-qwen3');
  const selectedModel = $derived(models.find((m) => m.id === selectedModelId) ?? FALLBACK_MODEL);
  let modelOpen = $state(false);
  let modelWrapEl = $state<HTMLDivElement>();

  // 모델 선택: 계층 드릴다운(자체/외부 → 기업 → 모델)
  // 드롭다운이 길어지지 않도록 단계별로 좁혀 고른다. 기업이 하나뿐인 단계는 자동으로 건너뛴다.
  type ServingKind = 'self' | 'api';
  const SERVING_LABEL: Record<ServingKind, string> = { self: '자체 모델', api: '외부 모델' };
  const vendorOf = (m: ChatModel): string => m.vendor ?? (m.serving === 'self' ? '자체' : '외부');

  // 드릴다운 경로(null = 그 단계 미선택). pkStage 가 현재 보여줄 단계를 결정한다.
  let pkServing = $state<ServingKind | null>(null);
  let pkVendor = $state<string | null>(null);
  const pkStage = $derived(
    pkServing === null ? 'serving' : pkVendor === null ? 'vendor' : 'model'
  );

  const servingsPresent = $derived(
    (['self', 'api'] as ServingKind[]).filter((s) => models.some((m) => m.serving === s))
  );
  function vendorsFor(s: ServingKind): string[] {
    const seen: string[] = [];
    for (const m of models) {
      if (m.serving !== s) continue;
      const v = vendorOf(m);
      if (!seen.includes(v)) seen.push(v);
    }
    return seen;
  }
  function modelsFor(s: ServingKind, v: string): ChatModel[] {
    return models.filter((m) => m.serving === s && vendorOf(m) === v);
  }
  const vendorAvailable = (s: ServingKind, v: string): boolean =>
    modelsFor(s, v).some((m) => m.available);

  function openModelPicker(): void {
    // 현재 선택 모델의 경로로 열어 형제 모델을 바로 보여준다(기업 1개면 기업 단계 자동 스킵)
    pkServing = selectedModel.serving;
    pkVendor = vendorOf(selectedModel);
    modelOpen = true;
  }
  function pickServing(s: ServingKind): void {
    pkServing = s;
    const vs = vendorsFor(s);
    pkVendor = vs.length === 1 ? vs[0] : null; // 기업 하나뿐이면 모델 단계로 자동 진입
  }
  function pickVendor(v: string): void {
    pkVendor = v; // 기업 선택 → 모델 단계로 진입
  }
  function pickerBack(): void {
    if (pkVendor !== null) {
      pkVendor = null;
      // 기업이 하나뿐이었으면 기업 단계를 건너뛰어 serving 단계로 되돌린다.
      if (pkServing !== null && vendorsFor(pkServing).length <= 1) pkServing = null;
    } else {
      pkServing = null;
    }
  }

  // 사고형 추론 토글 (대화창별)
  // 선택 모델이 사고를 지원할 때만 노출. 상태는 대화(세션)에 영속 → 재진입 시 복원
  let thinkingEnabled = $state(false);
  const canThink = $derived(selectedModel.available && selectedModel.supports_thinking);

  async function loadModels(): Promise<void> {
    const res = await aiChatService.listModels();
    if (!res.success || res.data.length === 0) return;
    models = res.data;
    // 목록이 처음 도달하면 조직 기본 모델(is_default)로 초기 선택을 맞춘다. 이 시점의
    // selectedModelId 는 아직 서버 값을 못 본 폴백 상수라 사용자의 선택이 아니다.
    const serverDefault = models.find((m) => m.is_default && m.available);
    if (serverDefault) selectedModelId = serverDefault.id;
    // 그래도 선택이 비어있거나 사용 불가면 첫 사용가능 모델로 보정
    if (!models.some((m) => m.id === selectedModelId && m.available)) {
      selectedModelId = (models.find((m) => m.available) ?? models[0]).id;
    }
  }

  /** 컨텍스트 길이 표기(예: 4096 → "4K ctx") */
  function fmtCtx(n: number): string {
    return n >= 1024 ? `${Math.round(n / 1024)}K ctx` : `${n} ctx`;
  }

  /**
   * 사고형 응답의 <think>...</think>(추론 과정)과 실제 답변을 분리
   *  - 닫힌 경우: reasoning=사고내용, answer=나머지 본문
   *  - 스트리밍 중 <think> 만 열린 경우: thinking=true (아직 답변 전)
   */
  function parseThink(content: string): { reasoning: string; answer: string; thinking: boolean } {
    const closed = content.match(/<think>([\s\S]*?)<\/think>/);
    if (closed) {
      return {
        reasoning: closed[1].trim(),
        answer: content.replace(/<think>[\s\S]*?<\/think>/, '').trim(),
        thinking: false
      };
    }
    const open = content.indexOf('<think>');
    if (open !== -1) {
      return {
        reasoning: content.slice(open + '<think>'.length).trim(),
        answer: content.slice(0, open).trim(),
        thinking: true
      };
    }
    return { reasoning: '', answer: content, thinking: false };
  }

  function selectModel(m: ChatModel): void {
    if (!m.available) return;
    selectedModelId = m.id;
    modelOpen = false;
    // 사고 미지원 모델로 바꾸면 토글을 끈다(요청에도 반영)
    if (!m.supports_thinking) thinkingEnabled = false;
  }

  async function toggleThinking(): Promise<void> {
    if (!canThink) return;
    thinkingEnabled = !thinkingEnabled;
    // 기존 대화면 즉시 영속(전송 없이 켜고/끈 상태 저장). 신규 대화는 생성/전송 시 함께 전달
    if (sessionId) {
      void aiChatService.setThinking(sessionId, thinkingEnabled);
      const s = sessions.find((x) => x.id === sessionId);
      if (s) s.enable_thinking = thinkingEnabled;
    }
  }

  // 세션 목록 드롭다운
  let sessionsOpen = $state(false);
  let sessionsWrapEl = $state<HTMLDivElement>();

  // 드롭다운(모델/세션) 바깥 클릭, Esc 로 닫기
  $effect(() => {
    if (!modelOpen && !sessionsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (modelOpen && modelWrapEl && !modelWrapEl.contains(e.target as Node)) modelOpen = false;
      if (sessionsOpen && sessionsWrapEl && !sessionsWrapEl.contains(e.target as Node))
        sessionsOpen = false;
    };
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        modelOpen = false;
        sessionsOpen = false;
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeydown);
    };
  });

  async function refreshSessions(): Promise<void> {
    const res = await aiChatService.listSessions();
    if (res.success) sessions = res.data;
  }

  function stopStreaming(): void {
    abort?.abort();
    abort = null;
    streaming = false;
  }

  function newChat(): void {
    stopStreaming();
    sessionsOpen = false;
    sessionId = null;
    errorMsg = null;
    thinkingEnabled = false; // 새 대화는 사고 off 기본
    messages = [GREETING];
    inputEl?.focus();
  }

  async function openSession(id: string): Promise<void> {
    stopStreaming();
    sessionsOpen = false;
    errorMsg = null;
    sessionId = id;
    // 대화별 설정(모델, 사고) 복원
    const s = sessions.find((x) => x.id === id);
    if (s) {
      if (models.some((m) => m.id === s.model && m.available)) selectedModelId = s.model;
      thinkingEnabled = s.enable_thinking;
    }
    const res = await aiChatService.getMessages(id);
    messages = res.success && res.data.length > 0 ? res.data : [GREETING];
    inputEl?.focus();
  }

  async function removeSession(id: string, e: MouseEvent): Promise<void> {
    e.stopPropagation();
    await aiChatService.deleteSession(id);
    if (sessionId === id) newChat();
    await refreshSessions();
  }

  async function send(): Promise<void> {
    const text = draft.trim();
    if (!text || streaming) return;
    errorMsg = null;

    // 세션 확보(없으면 생성: 현재 대화창의 사고 토글을 초기값으로)
    if (!sessionId) {
      const created = await aiChatService.createSession(selectedModelId, undefined, thinkingEnabled);
      if (!created.success) {
        errorMsg = created.error ?? '세션 생성에 실패했습니다.';
        return;
      }
      sessionId = created.data.id;
    }

    draft = '';
    messages.push({ id: localId(), role: 'user', content: text });
    messages.push({ id: localId(), role: 'assistant', content: '' });
    const assistantIndex = messages.length - 1;

    streaming = true;
    abort = new AbortController();
    await aiChatService.streamTurn(
      sessionId,
      text,
      selectedModelId,
      thinkingEnabled,
      {
        onToken: (delta) => {
          messages[assistantIndex].content += delta;
        },
        onDone: () => {
          void refreshSessions();
        },
        onError: (m) => {
          errorMsg = m;
          if (!messages[assistantIndex].content) messages[assistantIndex].content = `오류: ${m}`;
        }
      },
      abort.signal
    );
    streaming = false;
    abort = null;
    inputEl?.focus();
  }

  function onInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  // 메시지가 늘/변하면 목록을 맨 아래로
  $effect(() => {
    messages.length;
    messages[messages.length - 1]?.content;
    requestAnimationFrame(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  });

  // 입력 내용에 따라 텍스트에어리어 높이 자동 확장(최대 max-h-40 = 10rem)
  $effect(() => {
    draft; // track
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
  });

  onMount(() => {
    void loadModels();
    void refreshSessions();
    inputEl?.focus();
  });

  const iconBtn =
    'flex size-8 shrink-0 items-center justify-center rounded-md text-white/90 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
</script>

<div class="flex h-full min-h-0 flex-col bg-surface text-fg">
  <!-- 헤더 (브랜드 그라데이션) -->
  <header
    class="flex shrink-0 items-center gap-2 bg-gradient-to-r from-[#0f8ef0] to-[#5822f4] px-4 py-3 text-white"
  >
    <svg
      class="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
    <h1 class="truncate text-base font-bold">AI 어시스턴트</h1>

    <!-- 대화 메뉴(햄버거 아이콘). 클릭 시 앱바 아래로 리퀴드 글래스 드롭다운 -->
    <div bind:this={sessionsWrapEl} class="relative ml-auto">
      <button
        type="button"
        class={iconBtn}
        onclick={() => {
          if (!sessionsOpen) void refreshSessions();
          sessionsOpen = !sessionsOpen;
        }}
        aria-haspopup="menu"
        aria-expanded={sessionsOpen}
        aria-label="대화 메뉴"
        title="대화 메뉴"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {#if sessionsOpen}
        <!-- 리퀴드 글래스: 반투명 + 블러 + 채도 + 둥근 모서리 + 은은한 테두리/그림자 -->
        <div
          role="menu"
          class="absolute right-0 top-full z-20 mt-6 max-h-96 w-56 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-2xl border border-white/50 bg-white/55 p-1.5 text-fg shadow-xl ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-neutral-900/55 dark:ring-white/10"
        >
          <!-- 항상 맨 위: 새 대화 생성 -->
          <button
            type="button"
            role="menuitem"
            onclick={newChat}
            class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#5822f4] transition hover:bg-white/60 dark:text-[#9db8ff] dark:hover:bg-white/10"
          >
            <svg
              class="size-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            새 대화 생성
          </button>

          <div class="my-1 h-px bg-black/10 dark:bg-white/10"></div>

          {#if sessions.length === 0}
            <p class="px-3 py-2 text-sm text-fg-subtle">저장된 대화가 없습니다.</p>
          {:else}
            {#each sessions as s (s.id)}
              <div
                class="group flex items-center gap-1 rounded-xl pr-1 transition hover:bg-white/60 dark:hover:bg-white/10 {s.id ===
                sessionId
                  ? 'bg-white/60 dark:bg-white/10'
                  : ''}"
              >
                <button
                  type="button"
                  role="menuitem"
                  onclick={() => openSession(s.id)}
                  class="flex-1 truncate px-3 py-2 text-left text-sm"
                  title={s.title}
                >
                  {s.title}
                </button>
                <button
                  type="button"
                  onclick={(e) => removeSession(s.id, e)}
                  class="flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-danger-bg hover:text-danger-fg"
                  aria-label="삭제"
                  title="삭제"
                >
                  <svg
                    class="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  </header>

  <!-- 메시지 목록 -->
  <div bind:this={listEl} class="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
    {#each messages as m (m.id)}
      <div class="flex {m.role === 'user' ? 'justify-end' : 'justify-start'}">
        <div
          class={m.role === 'user'
            ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-gradient-to-r from-[#0f8ef0] to-[#5822f4] px-3.5 py-2 text-sm text-white shadow-sm'
            : 'max-w-[80%] rounded-2xl rounded-bl-sm border border-line bg-elevated px-3.5 py-2 text-sm text-fg shadow-sm'}
        >
          {#if m.role === 'assistant'}
            {#if m.content === '' && streaming}
              <!-- 추론 중(첫 토큰 전): 생각 중 인디케이터 -->
              <span class="inline-flex items-center gap-1.5 text-fg-subtle" aria-live="polite">
                <span class="flex gap-1">
                  <span class="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]"></span>
                  <span class="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]"></span>
                  <span class="size-1.5 animate-bounce rounded-full bg-current"></span>
                </span>
                <span class="text-xs">생각 중…</span>
              </span>
            {:else}
              {@const t = parseThink(m.content)}
              {#if t.reasoning}
                <!-- 생각 과정: 접이식(사고 중엔 펼침, 답변 시작되면 자동 접힘) -->
                <details
                  class="group mb-1.5 rounded-lg bg-hover/60 px-2 py-1.5"
                  open={t.thinking}
                >
                  <summary
                    class="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-fg-subtle transition hover:text-fg [&::-webkit-details-marker]:hidden"
                  >
                    <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 3a4 4 0 0 0-4 4c0 1 .2 1.5-.5 2.5C6.5 11 6 12 6 13a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4c0-1-.5-2-1.5-3.5C15.8 8.5 16 8 16 7a4 4 0 0 0-4-4z" />
                      <path d="M10 21h4" />
                    </svg>
                    <span>{t.thinking ? '생각하는 중…' : '생각 과정'}</span>
                    <svg class="size-3 shrink-0 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </summary>
                  <div class="mt-1.5 whitespace-pre-wrap break-words border-l-2 border-line pl-2.5 text-xs leading-relaxed text-fg-subtle">{t.reasoning}</div>
                </details>
              {/if}
              {#if t.answer}
                <p class="whitespace-pre-wrap break-words">{t.answer}</p>
              {:else if t.thinking}
                <!-- 사고만 진행 중, 답변 아직 -->
                <span class="inline-flex items-center gap-1 text-xs text-fg-subtle">
                  <span class="size-1.5 animate-pulse rounded-full bg-current"></span>
                  답변 준비 중…
                </span>
              {/if}
            {/if}
          {:else}
            <p class="whitespace-pre-wrap break-words">{m.content}</p>
          {/if}
        </div>
      </div>
    {/each}
    {#if errorMsg}
      <p class="text-center text-xs text-danger-fg">{errorMsg}</p>
    {/if}
  </div>

  <!-- 입력 영역: 통합 박스(텍스트에어리어 위 + 하단 컨트롤 행) -->
  <div class="shrink-0 bg-elevated px-3 pb-3 pt-1">
    <div
      class="rounded-2xl border border-line bg-surface shadow-sm transition focus-within:border-transparent focus-within:ring-2 focus-within:ring-[#5822f4]/30"
    >
      <textarea
        bind:this={inputEl}
        bind:value={draft}
        onkeydown={onInputKeydown}
        rows="1"
        placeholder="메시지를 입력하세요…  (Enter 전송, Shift+Enter 줄바꿈)"
        class="max-h-40 min-h-[2.75rem] w-full resize-none bg-transparent px-4 pt-3 pb-1.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
      ></textarea>

      <!-- 하단 컨트롤 행: 좌측 모델 선택, 우측 전송/중단 -->
      <div class="flex items-center gap-1 px-2 pb-2">
        <!-- 모델 선택 (위로 열림) -->
        <div bind:this={modelWrapEl} class="relative">
          {#if modelOpen}
            <div
              role="menu"
              aria-label="모델 선택"
              class="absolute bottom-full left-0 z-10 mb-2 w-64 rounded-xl border border-line bg-elevated p-1 shadow-lg"
            >
              <!-- 헤더: 뒤로 + 현재 경로(자체/외부 › 기업) -->
              <div class="flex items-center gap-1 px-1 py-1">
                {#if pkStage !== 'serving'}
                  <button
                    type="button"
                    onclick={pickerBack}
                    aria-label="뒤로"
                    class="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition hover:bg-hover"
                  >
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                  </button>
                {/if}
                <span class="min-w-0 flex-1 truncate px-1 text-[11px] font-semibold text-fg-subtle">
                  {#if pkStage === 'serving'}모델 선택{:else if pkStage === 'vendor'}{SERVING_LABEL[
                      pkServing!
                    ]}{:else}{SERVING_LABEL[pkServing!]} › {pkVendor}{/if}
                </span>
              </div>
              <div class="mx-1 mb-1 border-t border-line"></div>

              {#if pkStage === 'serving'}
                <!-- 1단계: 자체 / 외부 -->
                {#each servingsPresent as s (s)}
                  <button
                    type="button"
                    onclick={() => pickServing(s)}
                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-hover"
                  >
                    <span class="flex-1 font-medium text-fg">{SERVING_LABEL[s]}</span>
                    <span class="text-[11px] text-fg-subtle">{s === 'self' ? '내부 호스팅' : '외부 API'}</span>
                    <svg class="size-4 shrink-0 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                  </button>
                {/each}
              {:else if pkStage === 'vendor'}
                <!-- 2단계: 기업 -->
                {#each vendorsFor(pkServing!) as v (v)}
                  {@const ok = vendorAvailable(pkServing!, v)}
                  <button
                    type="button"
                    onclick={() => pickVendor(v)}
                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-hover"
                  >
                    <span class="min-w-0 flex-1 truncate font-medium text-fg">{v}</span>
                    {#if !ok}
                      <span class="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle">준비중</span>
                    {/if}
                    <svg class="size-4 shrink-0 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                  </button>
                {/each}
              {:else}
                <!-- 3단계: 모델 -->
                {#each modelsFor(pkServing!, pkVendor!) as m (m.id)}
                  {@const selected = m.id === selectedModelId}
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    disabled={!m.available}
                    onclick={() => selectModel(m)}
                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition enabled:hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-1.5">
                        <span class="truncate font-medium text-fg">{m.label}</span>
                        {#if m.params}
                          <span class="shrink-0 rounded bg-[#5822f4]/10 px-1 py-0.5 text-[10px] font-semibold text-[#5822f4]">{m.params}</span>
                        {/if}
                      </span>
                      {#if m.description || m.context_length}
                        <span class="mt-0.5 block truncate text-[11px] text-fg-subtle">
                          {m.description ?? ''}{#if m.description && m.context_length}, {/if}{#if m.context_length}{fmtCtx(m.context_length)}{/if}
                        </span>
                      {/if}
                    </span>
                    {#if !m.available}
                      <span class="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle">준비중</span>
                    {/if}
                    <svg
                      class="size-4 shrink-0 {selected ? 'text-[#5822f4]' : 'invisible'}"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
          <button
            type="button"
            onclick={() => (modelOpen ? (modelOpen = false) : openModelPicker())}
            aria-haspopup="menu"
            aria-expanded={modelOpen}
            class="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-fg-muted transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5822f4]/40"
          >
            <span class="max-w-[110px] truncate">{selectedModel.label}</span>
            {#if selectedModel.params}
              <span
                class="rounded bg-[#5822f4]/10 px-1 py-0.5 text-[10px] font-semibold text-[#5822f4]"
              >
                {selectedModel.params}
              </span>
            {/if}
            <svg
              class="size-3.5 text-fg-subtle transition-transform {modelOpen ? 'rotate-180' : ''}"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
        </div>

        <!-- 사고형 추론 토글 (선택 모델이 지원할 때만): 대화창별 on/off -->
        {#if canThink}
          <button
            type="button"
            onclick={toggleThinking}
            aria-pressed={thinkingEnabled}
            class="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5822f4]/40 {thinkingEnabled
              ? 'bg-gradient-to-r from-[#0f8ef0]/15 to-[#5822f4]/15 text-[#5822f4] ring-1 ring-[#5822f4]/30 dark:text-[#9db8ff]'
              : 'text-fg-muted hover:bg-hover'}"
            title={thinkingEnabled
              ? '사고 켜짐: 답하기 전에 단계적으로 추론합니다 (느리지만 꼼꼼)'
              : '사고 꺼짐: 바로 간결하게 답합니다'}
          >
            <svg
              class="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18h6M10 21h4M12 2a7 7 0 0 0-4 12c.5.5 1 1.5 1 3h6c0-1.5.5-2.5 1-3a7 7 0 0 0-4-12z" />
            </svg>
            <span>사고</span>
          </button>
        {/if}

        <!-- 전송 / 중단 (우측 끝, 원형) -->
        <div class="ml-auto flex items-center">
          {#if streaming}
            <button
              type="button"
              onclick={stopStreaming}
              class="flex size-8 shrink-0 items-center justify-center rounded-full bg-elevated text-fg ring-1 ring-line transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5822f4]/40"
              aria-label="중단"
              title="중단"
            >
              <svg class="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          {:else}
            <button
              type="button"
              onclick={send}
              disabled={!draft.trim()}
              class="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#0f8ef0] to-[#5822f4] text-white shadow-sm transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5822f4]/40 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="전송"
              title="전송"
            >
              <svg
                class="size-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 20V5M6 11l6-6 6 6" />
              </svg>
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

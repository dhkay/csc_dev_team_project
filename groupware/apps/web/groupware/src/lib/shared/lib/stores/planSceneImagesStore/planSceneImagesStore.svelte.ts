import type {
  PlanProposal,
  PlanScene,
  SceneImageState,
} from '$lib/features/marketing-channels/types';

/**
 * 기획서 배치의 씬 이미지 생산 스토어 (Svelte 5 runes, 싱글톤: tilesStore 패턴)
 *
 * 컴포넌트가 아니라 모듈에 두는 이유. 씬 이미지는 씬당 GPU 호출이라 비싸고 비멱등이다. 이 상태를
 * 컴포넌트가 들고 있으면 배치 컴포넌트가 언마운트될 때(사이드바로 다른 항목 보기 등) 전부 날아가고,
 * 돌아올 때 이미지가 처음부터 다시 생성되며 자동 저장까지 중복 발화한다. 기획안 텍스트는 TanStack
 * 캐시가 그 역할을 하지만(plans.query: staleTime/gcTime Infinity) 씬 이미지에는 대응물이 없어서
 * 여기가 그 자리다. 덕분에 페이지는 워크스페이스를 `{#if}` 로 자유롭게 마운트/언마운트할 수 있다.
 *
 * 키는 batchId 로 격리한다(배치 = '기획서 생성' 1회). 한 배치의 상태는 그 배치가 살아있는 동안 유지되고,
 * 저장이 끝난 기획안의 이미지는 release 로 즉시 버린다(아래 메모리 주석)
 */

/** 씬 이미지 1건의 생성 요청: 어떻게 만들지는 호출자(배치)가 정하고, 스토어는 언제/얼마나를 정한다. */
export interface SceneImageJob {
  proposalId: string;
  scene: PlanScene;
  // 실제 생성: 성공/실패 상태를 돌려준다. signal 로 취소 가능
  produce: (signal: AbortSignal, variant: number) => Promise<SceneImageState>;
}

/**
 * 동시 생성 상한: 전역(배치 수, 재시도와 무관하게 이 수를 넘지 않는다)
 *
 * 이건 공유 자원의 상한이 아니라 '내 몫' 제한이다. 이미지 엔진(ComfyUI)은 dev/staging/prod 와 다른
 * 사용자들이 함께 쓰는 GPU 1장이고 잡을 FIFO 로 직렬 처리한다. 이 스토어는 브라우저 탭 하나에만 살아서
 * 엔진 전체를 묶을 수 없다. 실제 직렬화는 엔진 큐가 하고, 큐에서 기다리는 건 language-model 이
 * 견딘다(comfyui_image._await_output: 큐 대기와 실행을 다른 시계로 잰다)
 *
 * 그럼 왜 두는가: 공정성. 한 세션이 씬 30장을 한꺼번에 밀어 넣으면 FIFO 특성상 다른 사용자의 1장이
 * 그 30장 뒤로 밀린다. 상한을 두면 내 잡이 큐에 4개까지만 있어, 남의 잡이 최대 4개 뒤에 끼어들 수 있다.
 * (배치마다 걸면 '기획서 생성'을 누를 때마다 4씩 늘어 이 목적이 무너진다. 그래서 전역이다.)
 */
const CONCURRENCY = 4;

/**
 * 전역 동시 실행 게이트: 슬롯을 넘겨주는 방식(release 가 대기자 1명을 깨우고 슬롯은 그대로 이관)
 * 풀이든 재시도든 실제 생성은 모두 이 문을 지난다.
 */
class ConcurrencyGate {
  private active = 0;
  private waiting: (() => void)[] = [];

  async acquire(): Promise<void> {
    if (this.active < CONCURRENCY) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) next(); // 슬롯 이관: active 유지
    else this.active -= 1;
  }
}

const gate = new ConcurrencyGate();

const imgKey = (proposalId: string, sceneIndex: number): string => `${proposalId}:${sceneIndex}`;

/** 배치 하나의 이미지 상태 + 실행 컨텍스트 */
interface BatchState {
  // `${proposalId}:${sceneIndex}` → 상태
  images: Record<string, SceneImageState>;
  // 씬별 재시도 변주 번호: 재시도마다 올려 seed 를 바꾼다(같은 결과 반복 방지)
  variants: Record<string, number>;
  // 씬별 생성 토큰(단조 증가): "가장 최신 의도가 이긴다"를 강제한다.
  // 생성/재시도/외부이미지 지정은 모두 이 값을 올려 그 시점의 의도를 표시하고, 비동기 생성이 끝나면
  // 자기 토큰이 아직 최신일 때만 결과를 쓴다. 없으면: 느린 재생성이 뒤늦게 끝나며 그 사이 넣은 외부
  // 이미지를 덮어써, "재생성하면 그다음에 이미지를 못 바꾸는" 문제가 생긴다(공유 GPU라 그 창이 넓다)
  tokens: Record<string, number>;
  // 씬별 편집된 영어 브리프(imagePrompt): 작업자가 상세에서 고친 값. 재생성은 이 값으로 만들고,
  // 자동 저장도 이 값을 씬에 반영한다(원본 기획안 텍스트는 캐시에 있어 불변, 편집분만 여기 얹는다)
  promptEdits: Record<string, string>;
  // 자동 저장을 이미 발화한 기획안 id(중복 발화 차단)
  reported: Set<string>;
  // 사용자가 삭제한 기획안 id: 렌더/자동저장에서 제외. 배치와 수명을 같이한다(재진입해도 되살아나지 않게)
  removed: Set<string>;
  controller: AbortController | null;
  // 이 배치의 생성이 이미 시작됐는지: 재마운트가 재생성을 유발하지 않게 하는 래치
  started: boolean;
}

class PlanSceneImagesStore {
  /** batchId → 배치 상태. $state 로 감싸 배치 추가/삭제도 반응한다. */
  private _batches = $state<Record<number, BatchState>>({});

  /** 씬의 생성 토큰을 올리고 새 값을 돌려준다. "지금 이게 최신 의도"라는 표식 */
  private bumpToken(b: BatchState, key: string): number {
    const t = (b.tokens[key] ?? 0) + 1;
    b.tokens[key] = t;
    return t;
  }

  private ensure(batchId: number): BatchState {
    let b = this._batches[batchId];
    if (!b) {
      b = {
        images: {},
        variants: {},
        tokens: {},
        promptEdits: {},
        reported: new Set(),
        removed: new Set(),
        controller: null,
        started: false,
      };
      this._batches[batchId] = b;
    }
    return b;
  }

  /** 사용자가 삭제한 기획안: 렌더/자동저장에서 제외 */
  isRemoved(batchId: number, proposalId: string): boolean {
    return this._batches[batchId]?.removed.has(proposalId) ?? false;
  }

  /**
   * 라이브 기획안 삭제(이 세션): 진행 중이던 그 기획안의 이미지도 버린다.
   *
   * 아직 나가지 않은 씬은 아예 보내지 않는다(run 의 removed 가드: 게이트 대기 중인 것 포함)
   * 이미 나간 요청(최대 CONCURRENCY 개)은 취소하지 않는다: 브라우저 요청을 끊어도 그 뒤의
   * BFF→csc-marketing→language-model→ComfyUI 어디에도 취소가 전파되지 않아 GPU 작업은 그대로
   * 완주한다. 그런데 슬롯은 즉시 비므로, 끊으면 실제 엔진 부하는 그대로인 채 큐에 더 밀어 넣게 된다.
   * (공정성 상한이 무의미해진다). 그래서 결과만 버리고 슬롯은 실제 작업이 끝날 때까지 잡아 둔다.
   * (영상 렌더는 다르다. video-model 에 취소 엔드포인트가 있어 삭제 시 arq 잡을 실제로 중단한다.)
   */
  remove(batchId: number, proposal: PlanProposal): void {
    const b = this.ensure(batchId);
    b.removed = new Set(b.removed).add(proposal.id); // 새 Set: 렌더가 반응하도록
    this.release(batchId, proposal);
  }

  /** 씬 이미지 상태 조회(반응): 없으면 undefined(아직 시작 전) */
  image(batchId: number, proposalId: string, sceneIndex: number): SceneImageState | undefined {
    return this._batches[batchId]?.images[imgKey(proposalId, sceneIndex)];
  }

  /** 씬의 편집된 브리프(imagePrompt) 조회(반응): 없으면 undefined(원본을 쓴다는 뜻) */
  promptEdit(batchId: number, proposalId: string, sceneIndex: number): string | undefined {
    return this._batches[batchId]?.promptEdits[imgKey(proposalId, sceneIndex)];
  }

  /** 씬의 브리프를 편집한다. 이후 재생성/자동저장이 이 값을 쓴다. */
  setPromptEdit(batchId: number, proposalId: string, sceneIndex: number, imagePrompt: string): void {
    const b = this.ensure(batchId);
    b.promptEdits[imgKey(proposalId, sceneIndex)] = imagePrompt;
  }

  /**
   * 전체 배치 합산 진행(반응): 워크스페이스 상단 한 줄 요약용. 배치가 여러 개면 합친다.
   * 이미 여기가 모든 배치의 이미지 상태를 들고 있으므로, 배치 컴포넌트가 진행도를 페이지로 올리는
   * 배선(prop + effect + 페이지 집계)을 둘 필요가 없다. 아는 쪽에 물어보면 된다.
   * 저장/삭제로 해제(release)된 이미지는 자연히 빠진다(진행 중인 것만 남는다)
   */
  progress(): { inProgress: boolean; done: number; total: number } {
    let done = 0;
    let total = 0;
    let inProgress = false;
    for (const b of Object.values(this._batches)) {
      for (const st of Object.values(b.images)) {
        total += 1;
        if (st.status === 'done') done += 1;
        else if (st.status === 'loading') inProgress = true;
      }
    }
    return { inProgress, done, total };
  }

  /** 이 배치의 생성이 이미 시작됐는지: 배치 컴포넌트가 재마운트 시 재시작을 피하려고 묻는다. */
  hasStarted(batchId: number): boolean {
    return this._batches[batchId]?.started ?? false;
  }

  /** 자동 저장을 아직 발화하지 않았다면 표시하고 true: 기획안당 정확히 한 번만 저장되게 한다. */
  markReported(batchId: number, proposalId: string): boolean {
    const b = this.ensure(batchId);
    if (b.reported.has(proposalId)) return false;
    b.reported.add(proposalId);
    return true;
  }

  /**
   * 배치의 씬 이미지 생성을 시작한다(동시성 CONCURRENCY). 이미 시작했으면 아무것도 하지 않는다.
   * (재마운트 무해). 강제로 다시 돌리려면 restart 를 쓴다('다시 생성')
   */
  start(batchId: number, jobs: SceneImageJob[]): void {
    const b = this.ensure(batchId);
    if (b.started) return;
    b.started = true;
    b.controller = new AbortController();
    // 이미 삭제된 기획안은 아예 풀에 넣지 않는다. loading 자리표시자만 남겨 두면 타일이 영원히 스피너가 된다.
    // (생성 도중 삭제되는 경우는 run 의 가드가 잡는다.)
    const live = jobs.filter((j) => !b.removed.has(j.proposalId));
    for (const j of live) b.images[imgKey(j.proposalId, j.scene.index)] = { status: 'loading' };
    void this.runPool(batchId, live, b.controller.signal);
  }

  /** 배치를 처음부터 다시 생성('다시 생성': 기획안 텍스트가 새로 왔을 때). 진행 중이던 작업은 취소 */
  restart(batchId: number, jobs: SceneImageJob[]): void {
    this.abort(batchId);
    const b = this.ensure(batchId);
    b.images = {};
    b.variants = {};
    b.tokens = {};
    b.promptEdits = {};
    b.reported.clear();
    b.removed = new Set();
    b.started = false;
    this.start(batchId, jobs);
  }

  /**
   * 씬 이미지를 직접 지정한다(작업자가 외부 이미지를 가져온 경우): 생성 결과와 같은 자리에 놓는다.
   * 이후 자동 저장이 이 이미지를 그대로 올린다(생성물과 저장 경로가 다르지 않다)
   */
  setImage(batchId: number, proposalId: string, sceneIndex: number, state: SceneImageState): void {
    const b = this.ensure(batchId);
    const key = imgKey(proposalId, sceneIndex);
    // 토큰을 올려 진행 중인 생성/재시도를 무효화한다. 그게 뒤늦게 끝나도 이 외부 이미지를 못 덮는다.
    this.bumpToken(b, key);
    b.images[key] = state;
  }

  /** 씬 하나만 다시 생성(실패/불만족): variant 를 올려 다른 버전을 뽑는다. */
  retry(batchId: number, job: SceneImageJob): void {
    const b = this.ensure(batchId);
    const key = imgKey(job.proposalId, job.scene.index);
    const variant = (b.variants[key] ?? 0) + 1;
    b.variants[key] = variant;
    const token = this.bumpToken(b, key); // 이 재시도가 최신 의도: 뒤늦은 이전 생성 결과는 버려진다
    b.images[key] = { status: 'loading' };
    // 배치 컨트롤러 신호로 돌려 배치 폐기 시 함께 취소된다(없으면 무취소 신호)
    void this.run(batchId, job, b.controller?.signal ?? new AbortController().signal, variant, token);
  }

  /**
   * 저장이 끝난 기획안의 이미지를 버린다. base64 data URL 이 씬당 1~2MB 라 배치가 쌓이면 세션 메모리가
   * 수십 MB 로 누적된다. 저장 후에는 저장본 그리드가 서버 URL 로 렌더하므로 이 사본은 불필요하다.
   * (주의: 상세를 열어 둔 기획안은 이 상태를 라이브로 읽으므로, 호출부가 그 경우를 피해서 부른다.)
   */
  release(batchId: number, proposal: PlanProposal): void {
    const b = this._batches[batchId];
    if (!b) return;
    for (const s of proposal.scenes) delete b.images[imgKey(proposal.id, s.index)];
  }

  /** 진행 중인 생성을 취소한다(배치 폐기 시) */
  abort(batchId: number): void {
    this._batches[batchId]?.controller?.abort();
  }

  private async run(
    batchId: number,
    job: SceneImageJob,
    signal: AbortSignal,
    variant: number,
    token: number,
  ): Promise<void> {
    const key = imgKey(job.proposalId, job.scene.index);
    // 삭제된 기획안은 만들지 않는다. 실행 지점에 두어 어떤 호출 경로(풀/재시도)로 와도 지켜진다.
    if (this.isRemoved(batchId, job.proposalId)) return;
    await gate.acquire();
    try {
      // 슬롯을 기다리는 동안 취소/삭제/무효화됐을 수 있다. 잡은 뒤 한 번 더 확인한다.
      const b0 = this._batches[batchId];
      if (signal.aborted || this.isRemoved(batchId, job.proposalId) || b0?.tokens[key] !== token)
        return;
      const state = await job.produce(signal, variant);
      const b = this._batches[batchId];
      if (signal.aborted || this.isRemoved(batchId, job.proposalId) || !b) return;
      // 생성이 도는 동안 더 새로운 의도(외부 이미지/재시도)가 왔으면 이 결과는 버린다(덮어쓰지 않는다)
      if (b.tokens[key] !== token) return;
      b.images[key] = state;
    } finally {
      gate.release();
    }
  }

  /** 배치의 모든 씬을 게이트에 맡긴다. 동시 실행 수는 전역 게이트가 정한다(여기서 또 세지 않는다) */
  private async runPool(batchId: number, jobs: SceneImageJob[], signal: AbortSignal): Promise<void> {
    const b = this.ensure(batchId);
    await Promise.all(
      jobs.map((job) => {
        const token = this.bumpToken(b, imgKey(job.proposalId, job.scene.index));
        return this.run(batchId, job, signal, 0, token);
      }),
    );
  }
}

export const planSceneImagesStore = new PlanSceneImagesStore();

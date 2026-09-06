import type { PlanGenerationRequest } from '$lib/features/marketing-channels/types';

/** 생성 배치 = '기획서 생성' 1회. channelId 로 채널을 식별해 워크스페이스가 현재 채널 것만 렌더한다. */
export interface GenerationBatch {
  id: number;
  channelId: number | null;
  req: PlanGenerationRequest;
  // 이 배치를 시작한 시각(epoch ms). 진행 화면이 경과 시간을 재는 기준이다.
  //
  // 창이 아니라 배치가 갖는 이유: 창을 닫았다 하단 탭으로 되돌아올 수 있고, 그때 창이 다시
  // `Date.now()` 를 쓰면 3분째 돌던 생성이 00:00 부터 다시 세어진다. 시작 시각은 창의 사실이
  // 아니라 그 배치의 사실이다.
  startedAt: number;
  // 이 배치가 만든 저장 기획안 id 들(자동 저장이 끝난 순서대로)
  //
  // 배치가 자기 렌더를 찾는 실이다(서버 쪽 id 를 아는 창은 그 id 로 바로 찾는다). 배치는 화면 쪽 개념이고 렌더는 서버 쪽 개념이라,
  // 그 사이를 잇는 값이 없으면 진행 화면은 자기 영상이 어느 것인지 모른다(목록에서 "방금 만든
  // 것" 을 시각으로 추정하게 되는데, 연달아 두 번 누르면 그 추정이 어긋난다)
  savedPlanIds: number[];
  /**
   * 이 배치가 만든 영상 프로젝트 id(아직 없으면 null)
   *
   * 이 값이 있다는 것은 그 작업이 서버로 넘어갔다는 뜻이고, 그때부터 배치는 화면에서 대표 자리를
   * 프로젝트에 넘긴다(하단 탭도 그쪽으로 선다).
   *
   * 되돌아오지 않는 정보라 판정이 확정적이다: id 를 적어 뒀는데 목록에 없으면 그 프로젝트는
   * 되돌려졌거나 지워진 것이다. 이 값이 없으면 "아직 안 생겼다" 와 "사라졌다" 를 가릴 수 없어,
   * 그 판단이 되돌림 전이를 실은 응답 한 번을 붙잡는 일에 걸린다.
   */
  projectId: number | null;
  /**
   * 이 배치를 시작한 초안 id(없으면 null)
   *
   * 제출한 입력이 어디 적혀 있는지 가리킨다. 이 실이 있으면 새로고침으로 배치가 사라져도 사람이
   * 적은 것은 남아 있어 폼이 그대로 다시 선다(기획안을 만드는 구간은 이 탭의 쿼리라 이어받을 수
   * 없다. 되살릴 수 있는 것은 입력이고, 그것을 잃으면 처음부터 다시 적어야 한다).
   *
   * 살아 있는 배치가 가리키는 초안은 하단 탭에 서지 않는다. 그 작업의 탭이 이미 그것을 대표한다.
   */
  draftId: string | null;
}

/**
 * 기획서 생성 세션 스토어 (Svelte 5 runes 싱글톤: planSceneImagesStore 와 동형)
 *
 * 컴포넌트가 아니라 모듈에 두는 이유. 워크스페이스가 레이아웃 + 자식 페이지(그리드/상세/섹션)로 분해되어,
 * 그리드 페이지가 상세/섹션으로 이동할 때 언마운트/재마운트된다. 생성 중 배치를 그리드 컴포넌트 상태로 들면
 * 그때 사라진다. 씬 이미지(planSceneImagesStore), 텍스트(TanStack 캐시)처럼 배치 목록도 여기(모듈)에 둬
 * 네비게이션을 넘어 유지한다. channelId 로 스코프해 채널 전환 시 다른 채널 배치가 섞이지 않는다.
 */
class PlanGenerationStore {
  /** 이번 세션의 라이브 배치(전 채널). $state 로 감싸 추가/저장표시가 반응한다. */
  private _batches = $state<GenerationBatch[]>([]);
  /** 자동 저장 완료된 기획안 proposal id: 라이브 그리드에서 숨김(저장본 그리드로 이관) */
  private _savedIds = $state<Set<string>>(new Set());
  private _nextId = 0;

  /**
   * '기획서 생성' 1회 = 배치 추가. 새 배치 id 를 돌려준다.
   *
   * 부른 쪽이 그 배치를 곧바로 가리켜야 하기 때문이다(진행 화면이 세그먼트 개수를 읽고, 취소가
   * 그 배치를 끊는다). 목록에서 되찾게 두면 "방금 넣은 것" 을 추정해야 하는데, 같은 채널에서
   * 연달아 두 번 누르면 그 추정이 어긋난다.
   */
  addBatch(
    channelId: number | null,
    req: PlanGenerationRequest,
    draftId: string | null = null,
  ): number {
    const id = this._nextId++;
    this._batches = [
      ...this._batches,
      { id, channelId, req, startedAt: Date.now(), savedPlanIds: [], projectId: null, draftId },
    ];
    return id;
  }

  /** 채널의 라이브 배치: 최신순(최근 생성이 앞) */
  batchesFor(channelId: number | null): GenerationBatch[] {
    return this._batches.filter((b) => b.channelId === channelId).reverse();
  }

  /** id 로 배치 하나. 없으면 undefined(이미 취소되어 걷힌 배치) */
  batch(batchId: number): GenerationBatch | undefined {
    return this._batches.find((b) => b.id === batchId);
  }

  /**
   * 배치를 목록에서 없앤다(삭제 = 취소). 멱등: 없는 id 는 no-op.
   *
   * 이 스토어는 배치를 없애는 수단이 없었다. 그래서 생성 중 배치는 지울 수 없었고, 화면을 떠나도
   * LLM 호출이 끝까지 돌았다(받을 사람이 없는 결과에 조직이 과금된다). 진행 중 요청을 실제로 끊는 것은
   * 쿼리 쪽 취소(cancelQueries)이고, 이 메서드는 화면에서 걷어내는 절반을 맡는다. 둘을 함께 부르는
   * 자리는 cancelPlanBatch 다
   */
  removeBatch(batchId: number): void {
    this._batches = this._batches.filter((b) => b.id !== batchId);
  }

  /**
   * 걷어낸 배치를 되돌려 놓는다(취소 사가의 보상)
   *
   * 취소는 여러 단계이고, 걷어낸 뒤 단계가 실패하면 아직 도는 작업이 화면에서 사라진 채 남는다.
   * 그때 사용자는 멈춘 줄 알지만 조직에는 계속 과금된다. 되돌려 놓아야 그 사실이 보이고 다시 시도할
   * 수 있다.
   *
   * 멱등: 같은 id 가 이미 있으면 아무것도 하지 않는다(보상이 두 번 불려도 배치가 둘이 되지 않는다)
   * 되돌린 배치는 목록의 끝에 붙어 `batchesFor` 에서 가장 최근으로 보인다. 취소하려던 것이 눈에 잘
   * 띄는 편이 낫다.
   */
  restoreBatch(batch: GenerationBatch): void {
    if (this._batches.some((b) => b.id === batch.id)) return;
    this._batches = [...this._batches, batch];
  }

  /**
   * 이 배치가 만든 저장 기획안을 배치에 적어 둔다. 멱등: 같은 id 는 두 번 담지 않는다.
   *
   * markSaved 와 갈려 있는 이유: 그쪽은 라이브 그리드에서 타일을 숨기는 표시(proposal id)이고
   * 이쪽은 진행 화면이 자기 렌더를 찾는 실(저장본 id)이다. 관심사가 다르고, 한쪽만 필요한
   * 호출자가 있다(그리드는 렌더를 모르고, 진행 화면은 타일을 모른다)
   */
  linkRender(batchId: number, savedPlanId: number): void {
    this._batches = this._batches.map((b) =>
      b.id === batchId && !b.savedPlanIds.includes(savedPlanId)
        ? { ...b, savedPlanIds: [...b.savedPlanIds, savedPlanId] }
        : b,
    );
  }

  /**
   * 이 배치가 만든 영상 프로젝트를 적어 둔다. 그 작업이 서버로 넘어간 시점이다.
   *
   * 저장본 id(`linkRender`)와 갈려 있는 이유: 저장본은 기획안이고 이것은 렌더다. 저장본만으로
   * 프로젝트를 찾으면 "아직 안 만들어졌다" 와 "만들어졌다가 사라졌다" 가 같은 모양(못 찾음)이 된다.
   *
   * 멱등: 같은 값이면 아무것도 하지 않는다(재시도로 두 번 불려도 목록이 흔들리지 않는다)
   */
  linkProject(batchId: number, projectId: number): void {
    if (this.batch(batchId)?.projectId === projectId) return;
    this._batches = this._batches.map((b) => (b.id === batchId ? { ...b, projectId } : b));
  }

  /** 자동 저장 완료 표시: 그 proposal 을 라이브 그리드에서 숨긴다. */
  markSaved(proposalId: string): void {
    this._savedIds = new Set(this._savedIds).add(proposalId);
  }

  /** 자동 저장 완료된 proposal id 집합(PlanBatch 가 숨김 판정에 쓴다) */
  get savedIds(): Set<string> {
    return this._savedIds;
  }
}

export const planGenerationStore = new PlanGenerationStore();

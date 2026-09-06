<script lang="ts">
  // 생성 모달: 목적 키워드 → 입력 방식 탭 → 그 방식의 폼 → 제출. 단계는 없다(여기서 바로 생성)
  // 이 창이 소유하는 것은 생성 요청이 될 값 전부와 본문이 무엇을 그릴지 정하는 상태뿐이고,
  // 폼 한 덩어리씩은 아래 컴포넌트 담당
  import { untrack } from 'svelte';
  import { useIsFetching } from '@tanstack/svelte-query';
  import { planGenerationStore } from '$lib/shared/lib/stores/planGenerationStore/planGenerationStore.svelte';
  import CenterModal from '$lib/shared/ui/CenterModal.svelte';
  import ConceptForm from './ConceptForm.svelte';
  import PromptForm from './PromptForm.svelte';
  import CreateModeTabs from './CreateModeTabs.svelte';
  import PurposeKeywordSection from './PurposeKeywordSection.svelte';
  import FocusKeywordView from './FocusKeywordView.svelte';
  import GenerationProgressView from './GenerationProgressView.svelte';
  import GenerationResultView from './GenerationResultView.svelte';
  import PlanPromptModal from '../shared/PlanPromptModal.svelte';
  import { isComplete, type GenerationProgress } from '../generationProgress';
  import { draftsKey, newDraftId, type PlanDraft } from './planDraft';
  import { planDraftStore } from './planDraftStore.svelte';
  import type { WorkTarget } from '../shared/workTabs';
  import { completedAtLabel, type GenerationResult } from '../generationResult';
  import { progressFromProject, resultFromProject } from '../renderProgress';
  import { CREATE_MODE_META, versionProfile, type CreateMode } from '../versionProfile';
  import {
    DEFAULT_PROPOSAL_COUNT,
    DEFAULT_SCENE_COUNT,
    DEFAULT_SEGMENT_MODE,
    pinnedProposalCount,
    sceneCountFromBrief,
    type SegmentMode,
  } from '../planComposeOptions';
  import { FOCUS_KEYWORD_MAX } from '../focusKeyword';
  import type {
    ConceptChoice,
    PlanGenerationRequest,
    VideoProject,
  } from '$lib/features/marketing-channels/types';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';

  interface Props {
    // 표시 여부(bindable)
    open?: boolean;
    // 현재 채널: URL 에서 확정된다. 기획서 생성의 기준
    channelId?: number | null;
    // 이 워크스페이스의 도구 버전. 프롬프트 조립과 모델 슬롯이 이 값으로 갈림
    version: VersionMode;
    // 제출: 선택 파라미터를 워크스페이스로 넘기고 시작한 배치 id 를 돌려받음
    // null 이면 시작하지 못한 것이라 폼에 머문다. 아무것도 돌지 않는데 진행 화면을 띄우면
    // 화면이 시작했다고 거짓말하게 됨
    // 제출한 입력이 적혀 있는 초안 id 를 함께 넘긴다(그 배치가 그 초안을 대표하게 된다)
    onGenerate?: (req: PlanGenerationRequest, draftId: string | null) => number | null;
    // 진행 화면의 '생성 취소'. 배치를 실제로 끊는 일은 워크스페이스가 안다.
    // 전부 취소됐을 때만 true 다. 절반만 취소된 채 폼이 다시 눌리면 아직 도는 것과 새로 시작한
    // 것 둘에 과금되므로 이 창은 참일 때만 폼으로 복귀
    onCancelGeneration?: (batchId: number) => Promise<boolean>;
    // 이 배치가 만든 영상 프로젝트를 찾아 준다(아직 없으면 null). 배치로 시작한 창의 관측 창구
    // 이 창이 목록 쿼리를 직접 들지 않는 이유: 같은 폴링이 둘로 갈려 요청이 두 배가 되고 두 화면이
    // 서로 다른 순간의 상태를 그린다(셸이 자기 쿼리에서 찾아 넘기면 같은 캐시라 요청이 늘지 않는다)
    findRenderProject?: (batchId: number) => VideoProject | null;
    // 세그먼트 하나만 다시 만들기. 붙어 있는 렌더 잡을 다시 돌리는 일이라 셸이 안다.
    // 없으면 진행 화면이 재생성 버튼을 그리지 않는다(눌러도 아무 일 없는 버튼을 두지 않는다)
    onRegenerateSegment?: (
      projectId: number,
      order: number,
      prompt: string,
    ) => Promise<void>;
    // 만든 영상을 작업 공간에 배치한다(이 창의 마지막 동작). 썸네일이 있으면 함께 붙인다.
    // 셸이 아는 이유: 그 쓰기가 채널과 버전 스코프의 목록을 무효화해야 하고 그 쿼리를 셸이 들고 있기 때문
    // batchId 를 함께 넘기는 이유: 그 배치가 하던 일이 여기서 끝난다. 셸이 배치를 걷어야 하단 탭에
    // 끝난 작업이 남지 않는다(dev 프리뷰에는 배치가 없어 null)
    onPlace?: (input: {
      projectId: number;
      thumbnail: Blob | null;
      batchId: number | null;
    }) => Promise<void>;
    // dev 프리뷰의 '영상 생성'. 실제 경로는 예약해 둔 행의 id 를 넘기지만 프리뷰에는 그 행이 없어
    // 결과물 자체(병합된 영상과 그림)를 넘기고 셸이 그것을 올려 실제 행 생성
    // 실제 행까지 가는 이유: 이 버전의 '영상 생성' 은 배치와 서버 저장을 함께 하는 버튼이라,
    // 캐시에만 카드를 넣으면 그 뒤의 모든 동작이 서버가 모르는 id 로 나가 실패
    // (미리보기가 아끼는 것은 렌더 비용이고 저장은 비용이 아니다)
    onPlacePreview?: (input: {
      video: Blob;
      thumbnail: Blob | null;
      title: string;
      videoModel: string;
    }) => Promise<void>;
    // 프로젝트 id 로 영상 프로젝트를 찾아 준다. 하단 탭에서 되돌아온 작업의 관측 창구다.
    //
    // 배치로 찾는 것과 갈라 두는 이유는 근거가 다르기 때문이다. 배치는 이 탭 세션의 메모리에만
    // 있어 새로고침이면 사라지고, 프로젝트는 서버에 남는다. 새로고침 뒤에 되돌아가는 길은 이쪽뿐이다.
    findProject?: (projectId: number) => VideoProject | null;
    // 하단 탭에서 되돌아온 작업(선택). 없으면 빈 폼으로 연다.
    // 가리키는 것이 이미 사라졌으면(취소된 배치 등) 무시하고 폼으로 연다.
    resume?: WorkTarget | null;
    // dev 프리뷰가 돌고 있는가(읽기 전용 보고). 셸이 그 자리를 하단 탭에 만든다.
    //
    // 프리뷰는 배치도 프로젝트도 만들지 않아(끊을 생성이 없다) 어디에도 남지 않는다. 그렇다고 이
    // 흐름만 하단 탭 밖에 두면 dev 에서 "닫고 되돌아오기" 를 확인할 방법이 사라진다. 그 확인이
    // 프리뷰의 존재 이유이므로(돈 들이지 않고 흐름을 끝까지 본다) 창이 자기 상태를 셸에 알린다.
    previewRunning?: boolean;
    /**
     * 지금 편집 중인 초안 id(bindable). 창을 새로 열면 새 id 가 붙고, 초안 탭으로 열면 그 id 다.
     *
     * 폼 값은 이 id 를 가진 초안의 편집 버퍼다. 셸이 함께 보는 이유는 하나다: 열려 있는 창이 곧
     * 그 초안이라 같은 것을 탭으로 겹쳐 세우지 않아야 하고, 어느 것인지는 이 값만 안다.
     */
    editingDraftId?: string | null;
    // 모달 제목 겸 제출 버튼 라벨. 이 모달을 여는 나브 버튼과 같은 문구를 받음
    // 라벨이 버전마다 다른데 여기만 고정하면 누른 버튼과 제목과 확정 버튼의 이름이 달라
    // 같은 흐름인지 알 수 없음
    submitLabel: string;
  }
  let {
    open = $bindable(false),
    channelId = null,
    version,
    onGenerate,
    onCancelGeneration,
    findRenderProject,
    onRegenerateSegment,
    onPlace,
    onPlacePreview,
    findProject,
    resume = null,
    previewRunning = $bindable(false),
    editingDraftId = $bindable<string | null>(null),
    submitLabel,
  }: Props = $props();

  // 고른 브랜드/컨셉과 목적 키워드: 생성 기준. 이 창이 소유해 생성 요청까지 나른다.
  // 브랜드는 ConceptForm 이 로드 시 첫 세트로 자동 선택, 여기서는 리셋만
  let selectedBrand = $state<string | null>(null);
  // 이번 생성에 쓸 연출 축 조합: 세트의 조합에서 출발해 작업자가 바꾼 최종값(ConceptForm 이 채운다)
  // 세트에 저장하지 않음. 저장은 설정 화면의 일이고 여기서 바꾼 것은 이 생성 한 번의 선택
  let selectedConcepts = $state<ConceptChoice[]>([]);
  // 이번 생성의 목적 키워드(키워드 검색 화면에서 고른다)
  let purposeKeywords = $state<string[]>([]);
  // 키워드 화면에서 고르는 중인 목록(확정 전 선택). 하단 버튼이 이 창에 있어 여기서 보관
  let keywordDraft = $state<string[]>([]);
  // 고른 기획서 구성(개수 + 인포그래픽 배제)
  // 그 섹션이 없는 버전에서는 쓰이지 않는다(그때 개수는 planCounts 가 정한다)
  let selectedProposalCount = $state(DEFAULT_PROPOSAL_COUNT);
  let selectedSceneCount = $state(DEFAULT_SCENE_COUNT);
  let selectedExcludeInfographic = $state(false);
  // 직접 적는 지시 둘(선택): 무엇을 담을지와 무엇을 피할지.
  // 프롬프트 방식에서는 sceneBrief 가 선택이 아니라 지시의 전부다(고르는 것이 하나도 없다)
  let sceneBrief = $state('');
  let constraints = $state('');
  // 이번 생성에 쓸 영상 모델. 비면 설정 저장값을 다시 읽는다(VideoSettingsSection)
  let videoModel = $state('');
  // 세그먼트 연결 방식: 영상 한 편의 성격이라 설정에 저장하지 않고 이 생성 한 번의 선택으로 둔다
  let segmentMode = $state<SegmentMode>(DEFAULT_SEGMENT_MODE);
  // 기획서 생성 프롬프트 편집 모달(헤더 버튼으로 연다)
  let promptOpen = $state(false);

  /**
   * 이 창이 지금 무엇을 보여주는가. 넷은 서로 배타라 한 값으로 관리한다.
   *   form     입력 폼(기본)
   *   keyword  키워드 검색. 하단 버튼이 '선택 완료' 로 바뀐다
   *   progress 생성 진행상태. '영상 생성' 을 누른 뒤
   *   result   결과 확인과 썸네일 생성. 진행 완료 후
   *
   * 불리언 여럿으로 두면 둘 다 true 인 표현 불가능한 상태가 생기고, 그때 무엇을 그릴지는
   * 조건문의 순서가 정하게 된다. 폼 값과 수명도 다르다. 폼 값은 창을 여는 동안 살아 있고 이 값은
   * 생성을 시작해 생겼다가 취소나 재오픈에 사라진다.
   */
  type WizardView = 'form' | 'keyword' | 'progress' | 'result';
  let view = $state<WizardView>('form');
  // dev 프리뷰의 진행 값. 실제 경로는 서버 관측에서 파생
  // 두 경로가 한 변수를 나눠 쓰지 않는 이유: 하나는 목이 스스로 굴리는 상태이고 다른 하나는 서버가
  // 말한 것의 투영이라, 섞으면 폴링이 도착할 때마다 목이 덮이거나 그 반대가 됨
  let mockProgress = $state<GenerationProgress | null>(null);
  // 결과 화면이 그리는 값. 진행이 완료돼야 생성
  let result = $state<GenerationResult | null>(null);
  // 진행 중인 배치 id(취소 대상). dev 프리뷰에는 없고, 새로고침 뒤 프로젝트로 되돌아온 경우에도 없다
  //   (그 배치는 이 탭의 메모리에 있었다). 없으면 '생성 취소' 를 그리지 않는다: 끊을 대상이 없다.
  let progressBatchId = $state<number | null>(null);
  // 관측 중인 영상 프로젝트 id. 배치 없이 되돌아온 작업(새로고침 뒤)이 자기 렌더를 찾는 실이다.
  let progressProjectId = $state<number | null>(null);
  // dev 프리뷰인가. `progressBatchId === null` 을 그 판정으로 쓰지 않음
  // 지금은 우연히 같지만 배치 없이 시작하는 실제 경로가 하나만 생겨도 그 코드가 목을 import 하게 됨
  let preview = $state(false);
  // 실제 경로의 관측 기준: 언제 시작했는가. 칸 수는 여기 없다(서버가 프로젝트를 만든 뒤 씬 수로 정한다)
  let observation = $state<{ startedAt: number } | null>(null);
  // 취소 확인 창. 되돌릴 수 없는 조작이라 한 번 확인
  let cancelConfirmOpen = $state(false);
  // 취소가 도는 중. 같은 버튼이 스스로 그 상태를 말한다(별도 버튼을 두지 않는다)
  let canceling = $state(false);
  // dev 프리뷰의 시간 흐름 타이머. 진행 화면을 떠날 때 반드시 해제
  let mockTimer: ReturnType<typeof setInterval> | null = null;
  // 세그먼트를 이어 붙이는 중. 실시간 녹화라 시간이 걸려 버튼이 그 상태를 표시
  let merging = $state(false);
  // 결과 화면의 '영상 생성' 이 도는 중(썸네일을 붙이는 사이)
  let finishing = $state(false);
  // 지금 화면의 썸네일을 PNG 로 만들어 주는 함수. 결과 화면의 편집기가 마운트될 때 전달
  // 창이 들고 있는 이유: 그림을 붙이는 것이 이 창의 마지막 동작이고 그 버튼이 하단 바에 있기 때문
  // (편집기가 미리 만들어 넘기면 그 뒤의 편집이 반영되지 않는다)
  let exportThumbnail = $state<(() => Promise<Blob>) | null>(null);
  // 프리뷰가 만든 병합 영상의 object URL. 반드시 해제 필요
  // 놓치면 수 MB 짜리 blob 이 프리뷰를 열 때마다 탭 수명 동안 쌓인다.
  let mergedObjectUrl: string | null = null;

  /**
   * 기획안 생성이 지금 돌고 있는가. 워크스페이스 툴바가 그 문구를 띄우는 값과 동일
   * 실제 경로에서 이 창이 관측할 수 있는 유일한 진행이다. 읽지 않으면 진행 화면이 처음 모습 그대로
   * 멈춰 있고, 0% 짜리 정지 화면은 "모른다" 가 아니라 "아무 일도 없었다" 로 읽힌다.
   */
  const plansFetching = useIsFetching({ queryKey: ['marketing-plans'] });

  function stopMockTimer(): void {
    if (mockTimer === null) return;
    clearInterval(mockTimer);
    mockTimer = null;
  }

  function revokeMergedUrl(): void {
    if (mergedObjectUrl === null) return;
    URL.revokeObjectURL(mergedObjectUrl);
    mergedObjectUrl = null;
  }

  /**
   * 진행 화면의 상태를 비운다. 취소로 폼에 돌아갈 때와 창을 새로 열 때가 같은 일이라 한 곳에 모음
   * 남겨 두면 새로 연 창이 이미 끝난 생성의 진행률을 보여줌
   * 폼 값은 건드리지 않는다. 이 함수와 폼 리셋이 갈려 있는 것이 "취소해도 입력이 남는다" 를
   * 코드로 말하는 자리다.
   */
  function clearProgressView(): void {
    stopMockTimer();
    revokeMergedUrl();
    mockProgress = null;
    observation = null;
    preview = false;
    progressBatchId = null;
    progressProjectId = null;
    result = null;
    cancelConfirmOpen = false;
    canceling = false;
    merging = false;
    finishing = false;
    // 편집기가 사라지면 그 함수도 폐기. 남겨 두면 다음 결과에서 이전 캔버스를 그리려 듦
    exportThumbnail = null;
  }

  /**
   * 키워드 검색 화면으로 전환. 지금 고른 목록을 초안으로 넘겨 이어서 고르게 함
   * 확정은 하단 '선택 완료' 가 한다(목록이 길어 본문이 스크롤되므로 버튼이 늘 손에 닿아야 한다)
   */
  function openKeywordView(): void {
    keywordDraft = [...purposeKeywords];
    view = 'keyword';
  }

  // 이 버전이 제공하는 입력 방식과 지금 고른 것
  // 목록은 프로필이 갖는다(버전이 갈리는 자리를 한 곳에 모으는 규칙). 기본은 첫 항목이고
  // 하나뿐인 버전에서는 탭을 그리지 않아 이 값이 바뀔 일 없음
  const profile = $derived(versionProfile(version));
  const createModes = $derived(profile.createModes);
  let mode = $state<CreateMode>('concept');

  /** 이 채널과 버전의 초안 칸. 창은 그 안의 한 초안을 편집한다 */
  const draftBoxKey = $derived(draftsKey(version, channelId));

  /**
   * 아직 적는 중인 화면. 키워드 검색도 여기 든다.
   *
   * 폼만 세면 목적 키워드를 고르러 들어간 사이에 적어 둔 것이 초안이 아니게 된다. 그 상태로
   * 새로고침하면 적은 것이 전부 사라진다. 사람이 보기에 그 화면은 여전히 적는 중이다.
   */
  const WRITING_VIEWS = new Set<WizardView>(['form', 'keyword']);

  /**
   * 지금 폼에 적힌 것. 편집 중인 초안 id 가 붙어 스토어의 그 항목이 된다.
   *
   * 제출하면 이 값은 null 이 되지만 적어 둔 것은 스토어에 남는다. 지우지 않는 이유: 기획안을 만드는
   * 구간은 이 탭의 쿼리라 새로고침을 넘기지 못하는데, 그때 입력까지 지워져 있으면 사람은 처음부터
   * 다시 적어야 한다. 그 초안은 배치가 가리키고 있어 하단 탭에 따로 서지 않고, 그 작업을 배치하면
   * 함께 정리된다(셸의 handlePlace).
   */
  const draft = $derived<PlanDraft | null>(
    WRITING_VIEWS.has(view) && editingDraftId !== null
      ? {
          id: editingDraftId,
          updatedAt: Date.now(),
          mode,
          brandName: selectedBrand,
          concepts: selectedConcepts,
          purposeKeywords,
          proposalCount: selectedProposalCount,
          sceneCount: selectedSceneCount,
          excludeInfographic: selectedExcludeInfographic,
          sceneBrief,
          constraints,
          videoModel,
          segmentMode,
        }
      : null,
  );

  $effect(() => {
    // 적는 동안 늘 저장한다. 새로고침을 넘기려면 그 순간의 값이 이미 남아 있어야 한다.
    // 내용이 없으면 저장이 아니라 제거다(스토어가 그렇게 정의한다). 그래서 폼을 비우는 것만으로
    //   그 초안과 탭이 사라지고, 지우는 코드가 따로 필요하지 않다.
    if (draft) planDraftStore.upsert(draftBoxKey, draft);
  });

  /** 저장해 둔 초안을 폼에 올린다(그 초안 탭으로 들어온 경로) */
  function applyDraft(saved: PlanDraft): void {
    editingDraftId = saved.id;
    mode = saved.mode;
    selectedBrand = saved.brandName;
    selectedConcepts = saved.concepts;
    purposeKeywords = saved.purposeKeywords;
    selectedProposalCount = saved.proposalCount;
    selectedSceneCount = saved.sceneCount;
    selectedExcludeInfographic = saved.excludeInfographic;
    sceneBrief = saved.sceneBrief;
    constraints = saved.constraints;
    videoModel = saved.videoModel;
    segmentMode = saved.segmentMode;
    keywordDraft = [];
    view = 'form';
  }

  /**
   * 초안 버리기(하단 탭의 닫기). 셸이 부른다.
   *
   * 편집 중인 초안이면 폼도 비운다. 값이 남아 있으면 다음 입력에 같은 id 로 다시 저장돼 탭이
   * 되살아난다. 다른 초안이면 스토어에서 빼는 것으로 끝난다.
   */
  export function discardDraft(draftId: string): void {
    planDraftStore.remove(draftBoxKey, draftId);
    if (draftId === editingDraftId) resetForm();
  }

  // 제출 가능 조건: 주제가 있는가. 방식마다 그 주제가 어디서 오는지가 다르다.
  //   컨셉입력  고른 브랜드가 주제다(브랜드 설명이 무엇을 파는지 말한다)
  //   프롬프트  적은 씬 입력 본문이 주제다. 고르는 것이 하나도 없어 그것이 유일한 중심이고
  //            적지 않은 것(연출, 인물, 장소)은 모델이 그 문장에 맞춰 결정
  // 목적 키워드는 어느 방식에서도 선택이다. 없으면 위의 주제가 그 자리를 채우고 기획안이 소재를
  // 스스로 제안한다. 수집 대기 게이팅도 없다(수집은 키워드 검색 화면에서 끝난다)
  // `mode` 선언 뒤에 둔다($derived 는 선언 시점에 평가된다)
  const canGenerate = $derived(
    mode === 'concept' ? !!selectedBrand : sceneBrief.trim().length > 0,
  );

  // 창 제목은 화면을 따라간다. 진행과 결과 화면에서 '영상 생성' 이라고 적혀 있으면 이미 돌고 있는
  // 것을 아직 시작하지 않은 것처럼 읽는다(폼과 키워드 화면은 만들려는 것의 이름을 쓴다)
  const viewTitle = $derived(
    view === 'progress' ? '생성 진행상태' : view === 'result' ? '결과 확인' : submitLabel,
  );

  // 창이 닫히거나 사라지면 dev 프리뷰 타이머를 끊는다. 이 창은 레이아웃에 붙어 있어 닫아도
  // 언마운트되지 않아, 두면 보이지 않는 화면을 탭 수명 내내 갱신하게 됨
  $effect(() => {
    if (!open) stopMockTimer();
    return () => {
      // 언마운트에서도 해제. 흔한 일은 아니지만 놓치면 blob 이 남음
      stopMockTimer();
      revokeMergedUrl();
    };
  });

  /**
   * 폼을 빈 상태로 되돌림. 창을 새로 열 때와 '새 콘텐츠 생성' 을 누를 때가 같은 일
   * 취소는 이것을 부르지 않는다. 취소한 사람은 고쳐서 다시 만들려는 것이라 적어 둔 값이 남아야
   * 하고, 그것이 취소와 '새 콘텐츠 생성' 을 가르는 유일한 차이
   */
  function resetForm(): void {
    selectedBrand = null;
    selectedConcepts = [];
    purposeKeywords = [];
    selectedProposalCount = DEFAULT_PROPOSAL_COUNT;
    selectedSceneCount = DEFAULT_SCENE_COUNT;
    selectedExcludeInfographic = false;
    sceneBrief = '';
    constraints = '';
    videoModel = '';
    segmentMode = DEFAULT_SEGMENT_MODE;
    keywordDraft = [];
    promptOpen = false;
    // 입력 방식도 기본으로 되돌린다. 지난번에 고른 방식이 남아 있으면 다른 것을 만들려고 연
    // 사람이 자기가 고르지 않은 폼을 마주하게 됨
    mode = createModes[0];
  }

  /**
   * 그 배치의 진행 화면으로 전환. 새로 시작한 경로와 하단 탭에서 되돌아온 경로가 같은 일이다.
   *
   * 진행은 이 창의 상태가 아니라 서버 상태의 투영이라, 배치 id 와 시작 시각만 있으면 그대로 다시
   * 그려진다(창을 닫은 사이의 진행도 함께 따라온다). 그래서 되돌아오기가 상태 복원이 아니다.
   */
  function showProgress(
    source: { batchId?: number; projectId?: number },
    startedAt: number,
  ): void {
    clearProgressView();
    progressBatchId = source.batchId ?? null;
    progressProjectId = source.projectId ?? null;
    preview = false;
    observation = { startedAt };
    view = 'progress';
  }

  /**
   * 이 창이 지금 무언가를 돌리고 있는가(dev 프리뷰 한정). 창을 닫아도 화면과 목 상태가 그대로 남아
   * 이 값이 참으로 유지되고, 셸이 그 사이 하단 탭에 자리를 만든다.
   *
   * 결과 화면까지 포함하는 이유는 실제 배치와 같다. 배치하기 전에는 만든 것이 어디에도 없어,
   * 그 화면으로 돌아갈 길이 사라지면 만든 것을 잃는다.
   */
  const hasLivePreview = $derived(preview && (view === 'progress' || view === 'result'));
  $effect(() => {
    previewRunning = hasLivePreview;
  });

  /**
   * 무엇으로 열 것인가. 하단 탭이 가리킨 작업이 아직 살아 있으면 그 화면으로, 아니면 빈 폼으로.
   *
   * 가리킨 것이 사라졌을 때 폼으로 떨어지는 것이 안전한 기본이다(취소된 배치, 이미 배치한 프로젝트).
   * 그 사이 탭도 함께 사라지므로 사용자는 빈 폼 하나만 보게 된다.
   */
  function openFor(target: WorkTarget | null): void {
    if (target?.kind === 'batch') {
      const batch = planGenerationStore.batch(target.batchId);
      // 폼은 손대지 않는다. 이 경로는 새 생성을 시작하는 것이 아니라 돌던 것을 다시 보여주는 것이다.
      if (batch) return showProgress({ batchId: batch.id }, batch.startedAt);
    }
    if (target?.kind === 'project') {
      const project = findProject?.(target.projectId);
      // 시작 시각은 서버가 아는 것을 쓴다. 새로고침으로 이 탭의 기억이 사라져도 경과 시간이 이어진다.
      if (project) {
        return showProgress({ projectId: project.id }, Date.parse(project.createdAt) || Date.now());
      }
    }
    if (target?.kind === 'draft') {
      // 적어 둔 것으로 이어 쓴다. 초안이 여럿이라 어느 것인지는 id 가 정한다.
      //   이미 버렸거나 제출된 초안이면 아래로 떨어져 새 초안이 된다.
      const saved = planDraftStore.get(draftBoxKey, target.draftId);
      if (saved) return applyDraft(saved);
    }
    if (target?.kind === 'preview') {
      // 닫아 둔 dev 프리뷰로 되돌아온 경로. 화면도 목 상태도 그대로라 되살릴 것은 시계뿐이다.
      //   (창이 닫히는 동안 타이머를 끊어 둔다. 보이지 않는 화면을 갱신하지 않으려는 것이다)
      if (view === 'progress') void restartMockTicking();
      return;
    }
    // 가리킨 것이 없거나 사라졌으면 새 초안이다. 종류가 늘어도 이 기본값은 안전하다:
    //   빈 폼은 아무것도 지우지 않고 사용자가 무엇을 할지 다시 정할 수 있다.
    startNewDraft();
  }

  /**
   * 빈 폼으로 새 초안을 시작한다(나브의 생성 버튼과 '새 콘텐츠 생성')
   *
   * 새 id 를 붙이는 것이 핵심이다. 앞서 적던 초안은 자기 id 로 남아 자기 탭을 지키므로, 새로
   * 만들려고 창을 열어도 그것이 지워지지 않는다.
   */
  function startNewDraft(): void {
    resetForm();
    clearProgressView();
    editingDraftId = newDraftId();
    view = 'form';
  }

  // 열릴 때마다 무엇으로 열지 정한다
  // open 만 의존(트리거)하고 내부 쓰기는 untrack 으로 감싼다(자기 갱신 루프 방지)
  // 되돌아온 작업도 untrack 안에서 읽는다. 이 창이 떠 있는 동안 그 값이 바뀌는 경로는 없고(탭은
  //   오버레이 뒤라 눌리지 않는다), 의존으로 두면 제출 직후 셸이 그 작업을 기록할 때 이 효과가 다시
  //   돌아 방금 만든 진행 화면을 한 번 더 세운다.
  $effect(() => {
    if (!open) return;
    untrack(() => openFor(resume));
  });

  // 진행 중인 배치가 밖에서 걷히면 폼으로 돌아간다. 생성이 실패한 배치는 그리지 않는 버전에서 되살릴
  //   자리가 없어 스스로 걷히고(PlanBatch), 사유는 그쪽이 알림으로 알렸다. 여기서 알리지 않는 이유다.
  //   입력은 그대로 남는다. 상한 초과처럼 사람이 고쳐 다시 만들어야 하는 사유가 대부분이다.
  //   dev 프리뷰는 배치가 없어 해당 없음. 취소 버튼 경로는 스스로 폼으로 가므로 여기서는 겹칠 뿐이다.
  $effect(() => {
    if (view !== 'progress' || preview || progressBatchId === null) return;
    if (planGenerationStore.batch(progressBatchId)) return;
    untrack(() => {
      clearProgressView();
      view = 'form';
    });
  });

  /**
   * 이번 생성의 기획안 개수와 씬 개수
   * 기획서 구성 섹션이 있는 버전은 고른 값을 그대로 쓰고, 없는 버전은 여기서 결정
   * (영상 한 편이라 기획안은 하나고 몇 씬으로 만들지는 '씬 / 사용자 입력사항' 이 이미 말한다)
   * 브리프에서 씬 수를 못 세면 기본값으로 떨어진다. 이 값은 어림값이다. 서버가 브리프를 정제해
   * 동영상 단위를 확정하면 그 수가 이 값을 이긴다(번호 없이 적거나 "동영상1 (0-8초)" 처럼 적어도
   * 세어진다). 진행 화면은 이 값을 쓰지 않는다. 칸은 서버가 만든 프로젝트의 씬 수로 그린다.
   */
  function planCounts(brief: string): { proposalCount: number; sceneCount: number } {
    if (profile.hasPlanCompose) {
      return { proposalCount: selectedProposalCount, sceneCount: selectedSceneCount };
    }
    return {
      // 개수는 그 버전의 표가 정한다(서버도 같은 표를 본다). 고정하지 않는 버전이 이 갈래로 오는
      // 일은 없지만, 표에 없는 값을 여기서 지어내지 않기 위한 폴백
      proposalCount: pinnedProposalCount(version) ?? DEFAULT_PROPOSAL_COUNT,
      sceneCount: sceneCountFromBrief(brief) ?? DEFAULT_SCENE_COUNT,
    };
  }

  function handleSubmit(): void {
    if (!canGenerate) return; // 가드(버튼도 disabled)
    // 공백만 적은 것은 적지 않은 것으로 본다(화면의 글자 수 표시와 같은 기준)
    // 개행 하나가 지시로 나가면 모델이 빈 요구사항을 해석하려 듦
    const brief = sceneBrief.trim();
    const limits = constraints.trim();
    // 프롬프트 방식에는 브랜드도 연출 조합도 없다. 빈 값이 그 사실이고 서버가 그것을 보고 주제와
    // 연출을 씬 입력 본문에서 잡는다(고른 적 없는 값을 실어 보내지 않는 것이 규칙이다)
    const isConcept = mode === 'concept';
    const counts = planCounts(brief);
    // 어느 초안에서 나온 제출인지 함께 넘긴다. 그 실이 있으면 새로고침으로 배치가 사라져도 적은
    //   것이 남아 폼이 그대로 다시 선다.
    const batchId = onGenerate?.(
      {
        brandName: isConcept ? (selectedBrand ?? '') : '',
        concepts: isConcept ? selectedConcepts : [],
        purposeKeywords,
        ...counts,
        excludeInfographic: selectedExcludeInfographic,
        ...(brief ? { sceneBrief: brief } : {}),
        ...(limits ? { constraints: limits } : {}),
        // 영상 설정은 그 묶음이 있는 버전에서만 싣는다. 없는 버전에서 기본값을 실으면 아무도 고르지
        // 않은 선택이 저장본에 남아 나중에 사람이 정한 값으로 읽힌다.
        // 빼면 서버와 DB 의 기본값이 그대로 서고 그 값이 곧 '고른 적 없음'
        ...(profile.hasVideoSettings
          ? {
              // 빈 값도 보내지 않음. 저장값을 읽지 못한 채 제출된 경우라 그때는 서버가 설정 참조
              ...(videoModel ? { videoModel } : {}),
              segmentMode,
            }
          : {}),
      },
      editingDraftId,
    );
    // 시작하지 못했으면 폼에 머문다(알림이 이유를 말하고 입력은 그대로 손에 남아야 한다)
    if (batchId == null) return;
    // 진행 화면을 두지 않는 버전은 닫는다. 그 버전의 산출물은 기획서 여러 벌이라 그리드 타일이
    // 도착을 하나씩 보여주고, 진행 화면이 말하는 단계(병합, 업로드)를 밟지 않음
    if (!profile.hasGenerationProgress) {
      open = false;
      return;
    }
    // 관측의 기준만 기록. 그다음부터 진행 화면이 그리는 값은 서버가 말한 것에서 파생
    // 여기서 단계를 직접 굴리면 화면이 실제와 무관하게 진행하는 척하게 됨
    // 세그먼트 칸 수도 싣지 않는다. 그 수는 서버가 입력을 나눈 뒤에 정해지고 프로젝트가 나른다.
    // 시작 시각은 배치가 갖는다(방금 만들어져 늘 있다). 창이 아니라 배치의 사실이라, 닫았다
    //   하단 탭으로 되돌아와도 경과 시간이 이어진다.
    showProgress({ batchId }, planGenerationStore.batch(batchId)?.startedAt ?? Date.now());
  }

  // 지금 관측되는 내 영상 프로젝트(아직 만들어지지 않았으면 null)
  // 셸이 자기 목록 쿼리에서 찾아 준다. 그 쿼리가 폴링하므로 이 값도 함께 갱신되고 진행 화면이
  // 그대로 따라간다. 창을 닫았다 열어도 이어 보이는 것은 진행이 이 창의 상태가 아니라 서버 상태의
  // 투영이기 때문
  // 프로젝트 id 를 알면 그것으로 바로 찾는다(새로고침 뒤 되돌아온 경로). 아니면 배치가 남긴 실로 찾는다.
  const renderProject = $derived(
    progressProjectId !== null
      ? (findProject?.(progressProjectId) ?? null)
      : progressBatchId !== null
        ? (findRenderProject?.(progressBatchId) ?? null)
        : null,
  );

  // 진행 화면이 그리는 값. 프리뷰는 목이 굴린 것, 실제 경로는 서버 관측을 번역한 것
  // 번역 규칙은 renderProgress.ts 한 곳에 있다(백엔드 어휘 → 화면 어휘). 여기서 단계를 짚으면
  // 같은 표가 이 창과 결과 화면과 목록 카드에 각각 생겨 따로 낡음
  const progress = $derived<GenerationProgress | null>(
    preview
      ? mockProgress
      : observation
        ? progressFromProject(renderProject, {
            splitting: plansFetching.current > 0,
            ...observation,
          })
        : null,
  );

  /**
   * 진행 화면 미리보기(dev 전용)
   * dev 에서는 세그먼트가 실제로 만들어지지 않아 이 화면을 눈으로 확인할 방법이 목뿐
   * 동적 import 인 이유: 정적으로 이으면 목 데이터가 prod 번들에 실리기 때문
   */
  async function openMockProgress(): Promise<void> {
    const mock = await import('./generationProgress.mock');
    preview = true;
    mockProgress = mock.mockGenerationProgress();
    progressBatchId = null; // 끊을 생성이 없다. 취소는 폼으로 되돌리기만 한다
    view = 'progress';
    startMockTicking(mock);
  }

  /**
   * 프리뷰의 시계. 간격은 목이 정한다(흉내 낼 대상은 전환이지 실제 소요 시간이 아니다)
   * 다 끝나면 스스로 멈추고 화면은 그대로 둔다. 다시 만들 세그먼트를 고를 시간이 필요해서이고,
   * 재생성이 이 함수를 다시 불러 시계를 되살림
   */
  function startMockTicking(mock: typeof import('./generationProgress.mock')): void {
    stopMockTimer();
    mockTimer = setInterval(() => {
      if (!mockProgress) return;
      const next = mock.advanceMock(mockProgress);
      mockProgress = next;
      if (isComplete(next)) stopMockTimer();
    }, mock.MOCK_TICK_MS);
  }

  /** 닫아 뒀던 프리뷰의 시계를 되살린다. 이미 끝난 진행이면 되살릴 것이 없다. */
  async function restartMockTicking(): Promise<void> {
    if (!mockProgress || isComplete(mockProgress)) return;
    startMockTicking(await import('./generationProgress.mock'));
  }

  /**
   * dev 프리뷰의 세그먼트 재생성: 그 칸만 생성 중으로 되돌리고 시계를 재가동
   * 다 끝난 뒤에 눌렀다면 시계가 멈춰 있고, 되살리지 않으면 그 칸이 '생성 중' 인 채로 영영 멈춰
   * 재생성이 아무 일도 하지 않는 버튼처럼 보인다.
   */
  async function regenerateMockSegment(order: number, prompt: string): Promise<void> {
    if (!mockProgress) return;
    const mock = await import('./generationProgress.mock');
    mockProgress = mock.regenerateMockSegment(mockProgress, order, prompt);
    startMockTicking(mock);
  }

  /**
   * 실제 경로의 세그먼트 재생성: 붙어 있는 렌더 잡을 그 칸 하나만 재실행
   * 화면을 여기서 손대지 않는다. 요청이 성공하면 목록이 무효화되고 다음 폴링이 서버가 말한 상태를
   * 실어 오며 진행 값은 그것의 투영이다. 미리 그려 두면 서버가 거절했을 때 되돌릴 것이 한 칸으로
   * 끝나지 않는다(프로젝트 전체가 다시 만드는 중으로 돌아간다)
   */
  async function regenerateSegment(order: number, prompt: string): Promise<void> {
    const projectId = renderProject?.id;
    if (projectId === undefined) return;
    await onRegenerateSegment?.(projectId, order, prompt);
  }

  // 진행 완료. 이때부터 화면은 기다리지 않고 다시 만들 세그먼트를 고르거나 결과로 이동
  // 자동으로 넘기지 않는 이유는 재생성이 그 사이에 있을 수 있어서다(넘어가면 볼 기회가 없다)
  const generationComplete = $derived(!!progress && isComplete(progress));

  /**
   * 결과 화면으로 넘어간다(사용자가 '결과 확인' 을 눌렀을 때)
   * 실제 경로는 서버가 실어 보낸 완성 영상 주소를 그대로 쓰고, 프리뷰는 세그먼트를 브라우저에서
   * 실제로 이어 붙여 썸네일 편집기를 진짜 영상으로 돌려 볼 수 있게 함
   */
  async function openResult(): Promise<void> {
    if (!progress) return;
    stopMockTimer();
    if (preview) {
      const mock = await import('./generationProgress.mock');
      // 프리뷰는 세그먼트들을 실제로 이어 붙인다. 실시간 녹화라 조각 길이의 합만큼 걸리므로
      // 버튼이 그 사이 상태를 말한다(그러지 않으면 눌러도 반응이 없는 것처럼 보인다)
      merging = true;
      try {
        mergedObjectUrl = await mock.mergeMockSegments(progress, version);
        showResult(mock.mockGenerationResult(progress, mergedObjectUrl, version));
      } finally {
        merging = false;
      }
      return;
    }
    if (!renderProject || !observation) return;
    showResult(
      resultFromProject(renderProject, {
        videoModel,
        // 저장 파일명의 기준이다. `submitLabel` 은 버튼 이름이라 여기 쓰면 받은 파일이
        // '영상 생성.mp4' 가 된다. 여러 개를 받아도 덮어쓰지 않게 시각을 붙인다.
        title: `마케팅 영상 ${completedAtLabel(Date.now())}`,
        completedAt: Date.now(),
      }),
    );
  }

  /**
   * 결과 화면으로 전환
   * 진행 화면의 상태는 비우지 않는다. 결과가 곧 그 진행의 끝이고 창을 닫거나 새로 만들 때 함께
   * 정리됨. 여기서 미리 비우면 취소 대상 정보가 사라져 아직 도는 것이 있는지 판단 불가
   */
  function showResult(next: GenerationResult): void {
    result = next;
    view = 'result';
  }

  /**
   * 이 창의 마지막 동작: 만든 영상을 작업 공간에 배치하고 창을 닫음
   * 배치가 곧 확정이라 이 버튼을 누르기 전까지 만들어진 영상은 목록에 없음
   * 실패하면 닫지 않음. 배치하지 못한 영상은 하단 탭으로 돌아갈 수 있지만, 다시 누르는 자리는
   *   그 탭을 거치지 않는 지금 이 화면이 가장 가까움
   * 그림을 만들지 못해도 배치는 한다(그림이 없는 것과 영상을 잃는 것은 무게가 다르다)
   */
  async function finishResult(): Promise<void> {
    if (finishing) return;
    finishing = true;
    try {
      const thumbnail = await exportThumbnail?.().catch(() => null);
      if (preview) {
        await placePreview(thumbnail ?? null);
        finishAndClose();
        return;
      }
      const projectId = renderProject?.id;
      // 배치할 대상이 없으면 닫기만 한다(관측이 아직 프로젝트를 찾지 못한 드문 경우)
      if (projectId === undefined || !onPlace) {
        finishAndClose();
        return;
      }
      await onPlace({ projectId, thumbnail: thumbnail ?? null, batchId: progressBatchId });
      finishAndClose();
    } catch {
      // 사유는 뮤테이션의 오류 알림이 표시. 여기서는 그 자리에 머물러 다시 누를 수 있게 함
    } finally {
      finishing = false;
    }
  }

  /**
   * 이 흐름을 끝내고 창을 닫는다. 진행 상태를 함께 비우는 것이 핵심이다.
   *
   * 남겨 두면 끝난 작업이 하단 탭에 남고(프리뷰는 그 상태가 곧 탭의 근거다), 다시 열었을 때 이미
   * 배치한 영상의 결과 화면이 되살아난다.
   */
  function finishAndClose(): void {
    clearProgressView();
    open = false;
  }

  /**
   * dev 프리뷰의 '영상 생성': 병합된 영상의 바이트를 꺼내 셸에 넘긴다(셸이 올려 행을 만든다)
   * 바이트를 다시 fetch 하는 이유: 병합 결과는 object URL 로만 들고 있고 그 주소는 이 탭 안에서만
   * 유효해 서버에 넘길 수 없다(blob: 주소는 fetch 로 원본 Blob 을 되돌려준다)
   * object URL 은 여기서 정리하지 않는다. 결과 화면이 아직 그 주소로 재생하고 있고 창이 닫힐 때
   * 정리됨
   */
  async function placePreview(thumbnail: Blob | null): Promise<void> {
    if (!onPlacePreview || !result?.videoUrl) return;
    const video = await fetch(result.videoUrl).then((r) => r.blob());
    await onPlacePreview({
      video,
      thumbnail,
      title: result.title,
      videoModel: result.videoModel,
    });
  }

  /**
   * 취소 확정: 생성을 끊고 입력 폼으로 복귀
   * 창을 닫지 않는 이유: 취소하는 사람은 대개 무언가를 고쳐 다시 만들려는 것이라, 닫으면 고치려던
   * 자리에서 한 걸음 멀어지기 때문(적어 둔 값은 초안 탭에 남지만 그 탭을 거쳐 다시 들어와야 한다)
   * 폼의 값은 그대로 남는다. 비우는 것은 진행 화면의 상태뿐이고 `open` 을 건드리지 않으므로 폼을
   * 되돌리는 리셋 `$effect` 가 돌지 않음
   * 전부 취소됐을 때만 돌아간다. 절반만 취소된 채 폼이 다시 눌리면 아직 도는 것과 새로 시작한 것
   * 둘에 과금된다(실패하면 진행 화면에 머물고 사유는 사가가 알림으로 알린다)
   */
  async function confirmCancelGeneration(): Promise<void> {
    canceling = true;
    cancelConfirmOpen = false;
    // dev 프리뷰에는 끊을 생성이 없음. 그때는 바로 폼으로 복귀
    const cancelled =
      preview || progressBatchId === null || (await onCancelGeneration?.(progressBatchId));
    if (!cancelled) {
      canceling = false; // 진행 화면에 머문다. 버튼을 다시 누를 수 있어야 한다
      return;
    }
    clearProgressView();
    view = 'form';
  }
</script>

<CenterModal bind:open title={viewTitle}>
  <!--
    헤더 우상단 닫기 왼쪽: '기획서 생성 프롬프트' 보기와 편집 버튼
    그 버튼을 두는 버전에서만 그린다(profile.hasPlanPromptShortcut). 입력 방식으로 가리지 않는
      이유는 헤더가 이 창 전체의 동작을 담는 자리라 본문 탭에 따라 나타났다 사라지면 안 되기 때문
    폼이 아닌 화면(키워드 검색, 진행상태)에서는 그 화면이 본문을 통째로 대신하므로 감춘다.
  -->
  {#snippet headerActions()}
    {#if view === 'form' && profile.hasPlanPromptShortcut}
      <button
        type="button"
        onclick={() => (promptOpen = true)}
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        aria-label="기획서 생성 프롬프트 보기 및 편집"
        title="기획서 생성 프롬프트"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
          <path d="M14 3v5h5" />
          <path d="M8 13h8M8 17h5" />
        </svg>
      </button>
    {/if}
  {/snippet}

  {#if view === 'result' && result}
    <!--
      결과 확인과 썸네일 생성. 세그먼트는 이미 하나로 합쳐졌고 여기서는 그것을 확인해 받아 두거나
        한 프레임으로 썸네일을 만든다. 그 그림을 영상에 붙이고 창을 끝내는 것은 하단의 마지막
        동작이다(finishResult)
      그래서 이 화면은 편집기의 '그림 만드는 함수' 를 창으로 통과시키기만 함
    -->
    <GenerationResultView
      {result}
      {version}
      onCreateAnother={startNewDraft}
      onExporterReady={(fn) => (exportThumbnail = fn)}
    />
  {:else if view === 'progress' && progress}
    <!--
      생성 진행상태: '영상 생성' 을 누른 뒤의 화면. 별도 모달을 띄우지 않는 이유는 같은 창의 다른
        화면이기 때문이다(키워드 검색이 이미 그 방식으로 자리를 나눠 쓰고 있다)
      재생성 콜백은 다시 만들 대상이 실제로 있을 때만 준다. 프리뷰는 목이, 실제 경로는 렌더 잡이
        붙은 프로젝트가 그 대상이고, 아직 프로젝트가 없으면 주지 않음
    -->
    <GenerationProgressView
      {progress}
      {version}
      onRegenerateSegment={preview
        ? (order, prompt) => void regenerateMockSegment(order, prompt)
        : renderProject
          ? (order, prompt) => void regenerateSegment(order, prompt)
          : undefined}
    />
  {:else if view === 'keyword' && channelId !== null}
    <!--
      키워드 검색: 같은 모달의 다른 레이아웃(상단 back 으로 돌아온다). 확정은 하단 '선택 완료'
      본문을 통째로 대신하고 탭도 머리글도 그리지 않는다. 이 화면은 자기 제목과 back 을 갖고 있고,
        여기서 입력 방식을 바꾸면 고르던 키워드가 말없이 사라진다.
    -->
    <FocusKeywordView
      {channelId}
      {version}
      bind:selected={keywordDraft}
      onBack={() => (view = 'form')}
    />
  {:else if channelId === null}
    <p
      class="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-fg-subtle"
    >
      채널을 선택하세요.
    </p>
  {:else}
    <div class="flex flex-col gap-6">
      <!--
        목적 키워드는 입력 방식 위에 둔다. 무엇을 다룰지는 어느 방식으로 만들든 같은 결정이라,
        방식 안에 두면 탭을 옮길 때마다 같은 값을 다시 고르는 것처럼 보인다.
      -->
      <PurposeKeywordSection keywords={purposeKeywords} onGenerate={openKeywordView} />

      {#if createModes.length > 1}
        <!--
          입력 방식 탭과 본문 머리. 둘은 같은 조건으로 렌더
          머리는 세 줄이다. 무엇을 만드는지(윗줄) → 지금 어떤 방식인지(제목) → 그 방식으로 무엇을
            하는지(설명). 방식을 바꾸면 아래 두 줄이 함께 바뀌고 윗줄은 그대로다.
          방식이 하나뿐인 버전에서는 제목이 늘 같은 값이라 모달 헤더가 이미 말한 것의 되풀이
        -->
        {@const meta = CREATE_MODE_META[mode]}
        <div class="flex flex-col gap-3">
          <CreateModeTabs modes={createModes} value={mode} onSelect={(m) => (mode = m)} />
          <div class="flex flex-col gap-0.5">
            <p class="text-[11px] font-medium text-fg-subtle">{profile.createEyebrow}</p>
            <h3 class="text-lg font-semibold text-fg">{meta.title}</h3>
            <p class="text-xs leading-relaxed text-fg-subtle">{meta.description}</p>
          </div>
        </div>
      {/if}

      <!--
        방식마다 자기 폼을 그린다. 값은 이 창이 소유하고 폼은 그 값을 채운다.
        플래그 하나로 한 폼을 재활용하지 않는 이유는 두 방식이 실제로 다른 일을 하기 때문이다.
          한 파일에 두면 어느 칸이 어느 방식의 것인지가 조건문에 흩어져, 칸을 옮기는 일이 늘 두
          방식 모두의 회귀 위험이 된다.
        대신 두 폼이 영상 설정 묶음(VideoSettingsSection)을 함께 쓴다. 폼의 순서와 유무는 각 폼이
          스스로 결정하므로 공통 prop 모양을 강제하지 않는다.
      -->
      {#if mode === 'concept'}
        <ConceptForm
          {version}
          bind:selectedBrand
          bind:concepts={selectedConcepts}
          bind:proposalCount={selectedProposalCount}
          bind:sceneCount={selectedSceneCount}
          bind:excludeInfographic={selectedExcludeInfographic}
          bind:sceneBrief
          bind:constraints
          bind:videoModel
          bind:segmentMode
        />
      {:else if mode === 'prompt'}
        <PromptForm
          {version}
          bind:sceneBrief
          bind:constraints
          bind:videoModel
          bind:segmentMode
        />
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    {#if view === 'result'}
      <!-- 이 창의 마지막 동작. 본문의 동작들은 각각 그것이 다루는 대상 옆에 있고 끝맺음은 여기
           하나다(만든 영상을 작업 공간에 놓는다)
           라벨이 창을 연 버튼과 같은 이유는 그 흐름이 여기서 끝나기 때문 -->
      <div class="flex flex-col gap-2">
        <p class="text-center text-[11px] text-fg-subtle">
          누르면 만든 영상이 썸네일과 함께 워크스페이스에 놓입니다.
        </p>
        <button
          type="button"
          onclick={() => void finishResult()}
          disabled={finishing}
          class="w-full rounded-full bg-fg px-5 py-2 text-sm font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {finishing ? '배치하는 중...' : submitLabel}
        </button>
      </div>
    {:else if view === 'progress' && generationComplete}
      <!-- 다 끝났다. 자동으로 결과로 넘기지 않는다. 그 사이에 재생성이 있을 수 있고 넘어가 버리면
           세그먼트를 다시 볼 기회가 없어, 넘어갈 시점은 사람이 결정
           취소 버튼은 여기 없다(끊을 것이 남아 있지 않다) -->
      <div class="flex flex-col gap-2">
        <p class="text-center text-[11px] text-fg-subtle">
          {merging
            ? '세그먼트를 하나의 영상으로 이어 붙이는 중입니다.'
            : '다시 만들 세그먼트가 있으면 위에서 먼저 만드세요.'}
        </p>
        <button
          type="button"
          onclick={() => void openResult()}
          disabled={merging}
          class="w-full rounded-full bg-fg px-5 py-2 text-sm font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {merging ? '합치는 중...' : '결과 확인'}
        </button>
      </div>
    {:else if view === 'progress'}
      <div class="flex flex-col gap-2">
        <!-- 닫기(Esc/X)는 취소가 아님. 생성은 계속 돌고 화면 아래 탭이 그 자리를 지킴
             둘의 차이를 말해 두지 않으면 닫아서 멈췄다고 믿는 사람이 생기고, 어디로 갔는지 적지
             않으면 되돌아올 수 있다는 사실을 아무도 모름 -->
        <p class="text-center text-[11px] text-fg-subtle">
          창을 닫아도 생성은 계속되고 화면 아래 탭으로 남습니다. 마지막 단계에서 배치해야
          워크스페이스에 남습니다.
        </p>
        {#if progressBatchId !== null || preview}
          <!-- 끊을 대상이 있을 때만 그린다. 새로고침 뒤 되돌아온 작업은 이 탭이 그 생성을 붙잡고
               있지 않아(배치가 메모리에 있었다) 여기서 끊을 수 없고, 누르면 아무 일도 하지 않는
               버튼이 된다. 그 작업은 서버에서 끝까지 돌고 결과는 이 화면이 이어 보여준다. -->
          <button
            type="button"
            onclick={() => (cancelConfirmOpen = true)}
            disabled={canceling}
            class="w-full rounded-full border border-line px-5 py-2 text-sm font-medium text-danger-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-fg/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {canceling ? '취소 처리 중...' : '생성 취소'}
          </button>
        {/if}
      </div>
    {:else if view === 'keyword'}
      <!-- 키워드 화면의 확정 버튼. 목록이 길어 본문이 스크롤되므로 하단 고정
           되돌아가기는 그 화면 상단의 back 담당 -->
      <button
        type="button"
        onclick={() => {
          purposeKeywords = keywordDraft;
          view = 'form';
        }}
        class="w-full rounded-full bg-fg px-5 py-2 text-sm font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
      >
        선택 완료 ({keywordDraft.length}/{FOCUS_KEYWORD_MAX})
      </button>
    {:else}
      <!-- 제출 버튼 하나. 단계가 없어 '이전' 도 없다(브랜드 미선택이면 비활성) -->
      <div class="flex flex-col gap-2">
        <button
          type="button"
          onclick={handleSubmit}
          disabled={!canGenerate}
          class="flex w-full items-center justify-center gap-2 rounded-full bg-fg px-5 py-2 text-sm font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50"
        >
          {submitLabel}
        </button>
        {#if import.meta.env.DEV && profile.hasGenerationProgress}
          <!-- dev 전용: 생성 없이 진행 화면을 본다. 세그먼트는 dev 에서 실제로 만들어지지 않아
               이것이 그 화면을 확인하는 유일한 수단
               그 화면을 두지 않는 버전에는 이 버튼도 두지 않는다(dev 에서만 다른 제품이 된다) -->
          <button
            type="button"
            onclick={() => void openMockProgress()}
            class="w-full rounded-full border border-dashed border-line px-5 py-2 text-xs font-medium text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            진행 화면 미리보기 (dev)
          </button>
        {/if}
      </div>
    {/if}
  {/snippet}
</CenterModal>

<!--
  생성 취소 확인(중첩 모달). CenterModal 이 중첩 스택을 이미 다루므로 확인 다이얼로그 컴포넌트를
    따로 만들지 않음
  묻는 이유: 취소는 되돌릴 수 없고 그때까지 만든 것이 함께 사라진다.
-->
<CenterModal bind:open={cancelConfirmOpen} title="생성을 취소할까요?" size="md">
  <p class="text-sm leading-relaxed text-fg-muted">
    지금까지 만들어진 결과가 사라지며 되돌릴 수 없습니다. 입력한 내용은 그대로 두고 입력 화면으로
    돌아갑니다.
  </p>
  {#snippet footer()}
    <div class="flex gap-2">
      <button
        type="button"
        onclick={() => (cancelConfirmOpen = false)}
        class="flex-1 rounded-full border border-line px-5 py-2 text-sm font-medium text-fg-muted transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
      >
        계속 생성
      </button>
      <button
        type="button"
        onclick={() => void confirmCancelGeneration()}
        class="flex-1 rounded-full bg-danger-fg px-5 py-2 text-sm font-medium text-surface transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-fg/30"
      >
        생성 취소
      </button>
    </div>
  {/snippet}
</CenterModal>

<!--
  기획서 생성 프롬프트 편집(중첩 모달): 헤더 버튼으로 연다.
  마운트도 같은 플래그로 가린다. 이 창은 CenterModal 밖이라 위저드가 붙어 있는 동안 늘 마운트되고
    그 안의 쿼리는 열림 여부가 아니라 채널만 보고 돈다(enabled: channelId != null)
    버튼만 지우면 그 버전이 쓰지 않는 프롬프트를 채널 페이지마다 계속 받아 오게 됨
-->
{#if profile.hasPlanPromptShortcut}
  <PlanPromptModal bind:open={promptOpen} {channelId} {version} />
{/if}

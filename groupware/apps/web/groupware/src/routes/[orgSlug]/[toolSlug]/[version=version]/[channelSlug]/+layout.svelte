<script lang="ts">
  // 채널 워크스페이스 셸: 사이드바(nav) + 기획서 생성 모달. children()(그리드/상세/섹션) 렌더
  //   이 도구는 새 탭으로 열리므로(홈의 aiToolTabName) 셸에 조직 홈으로 나가는 버튼을 두지 않는다.
  // 레이아웃은 자식 라우트 이동에서 리마운트되지 않아 nav/위저드가 유지된다(생성 세션 상태는 스토어가 보존)
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { createMutation, createQuery, useIsFetching, useQueryClient } from '@tanstack/svelte-query';
  import { viewportModeStore } from '$lib/shared/lib/stores/viewport/viewportModeStore/viewportModeStore.svelte';
  import {
    planGenerationStore,
    type GenerationBatch,
  } from '$lib/shared/lib/stores/planGenerationStore/planGenerationStore.svelte';
  import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
  import { cancelGeneratingBatch } from '$lib/features/marketing-channels/lib/cancelGeneratingBatch';
  import {
    MAX_SCENE_COUNT,
    segmentLimitMessage,
  } from '$lib/pages/tools/marketing-video/planComposeOptions';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import { ensureAiModelsReady } from '$lib/pages/tools/marketing-video/aiModelReadiness';
  import { settingsSectionUrl } from '$lib/pages/tools/marketing-video/marketingSettingsSections';
  import { versionProfile } from '$lib/pages/tools/marketing-video/versionProfile';
  import MarketingVideoNav, {
    type NavItem,
  } from '$lib/pages/tools/marketing-video/shared/MarketingVideoNav.svelte';
  import BottomTabBar from '$lib/shared/ui/navigation/BottomTabBar.svelte';
  import {
    composeWorkTabs,
    tabIdOf,
    targetFromTabId,
    type WorkTarget,
  } from '$lib/pages/tools/marketing-video/shared/workTabs';
  import {
    durableTarget,
    loadWorkSession,
    saveWorkSession,
    workSessionKey,
  } from '$lib/pages/tools/marketing-video/shared/workSession';
  import { draftsKey } from '$lib/pages/tools/marketing-video/create/planDraft';
  import { planDraftStore } from '$lib/pages/tools/marketing-video/create/planDraftStore.svelte';
  import { progressFromProject } from '$lib/pages/tools/marketing-video/renderProgress';
  import { isRolledBackStatus } from '$lib/features/marketing-channels/types';
  import PlanWizardModal from '$lib/pages/tools/marketing-video/create/PlanWizardModal.svelte';
  import {
    sectionPath,
    sectionFromPath,
    workspaceBasePath,
    type WorkspaceSection,
  } from '$lib/pages/tools/marketing-video/workspaceUrl';
  import type {
    PlanGenerationRequest,
    VideoProject,
  } from '$lib/features/marketing-channels/types';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const isPortrait = $derived(viewportModeStore.isPortrait);
  // 버전은 주소의 세 번째 조각이다(`[version]` 셸이 확정해 내려준다)
  const basePath = $derived(
    workspaceBasePath({
      orgSlug: page.params.orgSlug ?? '',
      toolSlug: page.params.toolSlug ?? '',
      version: data.version,
      channelSlug: page.params.channelSlug ?? '',
    }),
  );
  // 이 버전의 화면 구성(섹션 목록/생성 버튼 라벨/탭 라벨): 버전별 분기의 단일 출처
  const profile = $derived(versionProfile(data.version));

  // 프로세스/가격표는 관리급 전용(루트/대표/팀장 = isToolManager, 부모 [toolSlug] 레이아웃에서 계산해 상속)
  //   여기 nav 숨김은 UX 이고, 직접 URL 접근 차단은 각 페이지 +page.server.ts 의 하드 게이트가 담당한다.
  //   클라의 data.user 는 position 이 제거돼 있어 hasRootAuthority 재계산이 대표/팀장을 놓치므로 서버 플래그를 쓴다.
  // 표시 메타(라벨/아이콘)는 여기 있고, 어느 섹션이 이 버전에 있는지는 프로필이 정한다.
  //   설정은 목록의 마지막이다. 다른 섹션과 똑같이 라우트로 이동하는 것이라 보조 액션이 아니라
  //   항목으로 둔다(활성 하이라이트와 키보드 순서가 나머지 섹션과 같아진다)
  //   권한 게이트는 없다. 설정 화면이 편집 권한을 자체 판정한다.
  const SECTION_META: Record<WorkspaceSection, { label: string; icon: NavItem['icon'] }> = {
    workspace: { label: '워크스페이스', icon: 'video' },
    assets: { label: '에셋', icon: 'asset' },
    archive: { label: '보관함', icon: 'archive' },
    process: { label: '프로세스', icon: 'process' },
    price: { label: '가격표', icon: 'price' },
    log: { label: '로그', icon: 'log' },
    settings: { label: '설정', icon: 'settings' },
  };

  // 프로세스/가격표는 관리급 전용(루트/대표/팀장 = isToolManager, 부모 [toolSlug] 레이아웃에서 계산)
  //   여기 nav 숨김은 UX 이고, 직접 URL 접근 차단은 각 페이지 +page.server.ts 의 하드 게이트가 담당한다.
  //   클라의 data.user 는 position 이 제거돼 hasRootAuthority 재계산이 대표/팀장을 놓치므로 서버 플래그를 쓴다.
  // 로그도 관리급이지만 플래그가 따로다(canViewLogs). 두 정책은 지금 같을 뿐 같은 것이 아니어서,
  //   로그 범위가 갈리는 날 서버 판정만 바뀌고 이 필터는 그대로다.
  const MANAGER_ONLY = new Set<WorkspaceSection>(['process', 'price']);
  const items = $derived<NavItem[]>(
    profile.sections
      .filter((s) => (MANAGER_ONLY.has(s) ? data.isToolManager : true))
      .filter((s) => (s === 'log' ? data.canViewLogs : true))
      .map((key) => ({ key, ...SECTION_META[key] })),
  );
  // 활성 섹션 = URL 경로에서 파생(뒤로/앞으로/직접진입 자동 반영)
  const activeKey = $derived<WorkspaceSection>(sectionFromPath(page.url.pathname, basePath));

  // 버전이 없앤 섹션에 서 있는 경우는 여기서 처리하지 않는다. 버전 전환은 URL 이동이고
  //   그 이동(swapVersion)이 대상 버전에 없는 섹션을 워크스페이스로 접는다. 주소를 직접 열었을
  //   때는 각 섹션의 서버 게이트가 막는다(가시성이 아니라 경계는 서버에 있다)
  //   권한이 줄어 항목이 빠지는 경우도 같은 서버 게이트가 담당한다.

  const createLabel = $derived(profile.createLabel);

  /**
   * 새로고침을 넘어 남아 있던 창의 자리(열려 있었는가, 무엇을 다루던 창인가)
   *
   * 한 번만 읽는다. 채널이 바뀌면 창은 다시 만들어지지만(`{#key}`) 이 셸은 그대로라, 여기서 읽은
   * 값은 처음 들어온 채널의 것이다. 채널을 옮긴 뒤의 복원은 다루지 않는다. 옮긴 사람은 그 채널의
   * 일을 하러 간 것이지 앞 채널의 창을 이어 열려는 것이 아니다.
   */
  const sessionKey = untrack(() => workSessionKey(data.version, data.currentChannelId));
  const restoredSession = untrack(() =>
    versionProfile(data.version).hasWorkContinuity ? loadWorkSession(sessionKey) : null,
  );

  /**
   * 목록이 도착해야 세울 수 있는 복원(서버 작업을 가리키던 창)
   *
   * 그 작업이 아직 살아 있는지는 목록을 받아야 안다. 받기 전에 열면 창이 없는 것을 관측하다가 빈
   * 폼으로 떨어진다. 세우고 나면 null 로 비워 두 번 복원하지 않는다.
   */
  const deferredRestore =
    restoredSession?.open === true && restoredSession.target?.kind === 'project'
      ? restoredSession.target
      : null;
  let pendingRestore = $state<WorkTarget | null>(deferredRestore);

  // 기획서 생성 모달: 열기만 셸이 소유하고, 단계 흐름은 PlanWizardModal 이 담당
  //   초안이나 빈 폼이던 창은 지금 바로 세운다(기다릴 것이 없다). 서버 작업이던 창은 위 대기를 거친다.
  let createOpen = $state(restoredSession?.open === true && deferredRestore === null);
  /**
   * 그 창이 지금 다루는 작업. 새로 열면 null 이고 제출과 함께 정해지며, 하단 탭에서 열면 그 작업이다.
   *
   * 창이 빈 폼으로 열릴지 돌던 진행으로 열릴지를 이 값이 정한다. 창 안에 두지 않는 이유는 여는
   * 쪽이 둘(나브 버튼과 하단 탭)이고 무엇으로 여는지는 그 둘이 아는 사실이기 때문이다.
   */
  let resumeTarget = $state<WorkTarget | null>(
    deferredRestore === null ? (restoredSession?.target ?? null) : null,
  );
  /** 초안을 버리라고 창에 알리기 위한 참조. 편집 중인 폼 값을 들고 있는 것이 창이다. */
  let wizard: ReturnType<typeof PlanWizardModal> | undefined = $state();
  /** 창이 지금 편집 중인 초안. 탭에서 뺀다(창이 곧 그 초안이다) */
  let editingDraftId = $state<string | null>(null);

  /**
   * 이 채널과 버전의 초안 목록(최근 순). 각자 자기 탭을 갖는다.
   *
   * 저장소 읽기는 효과에서 한다(파생 계산 안에서 상태를 쓰지 않기 위해). 채널을 옮기면 칸이 바뀌고
   * 그 칸도 한 번 읽어야 한다. 이 셸은 채널 전환에 리마운트되지 않으므로 초기화에서 한 번 읽으면
   * 옮겨 간 채널의 초안이 영영 보이지 않는다.
   */
  const draftBoxKey = $derived(draftsKey(data.version, data.currentChannelId));
  $effect(() => {
    planDraftStore.hydrate(draftBoxKey);
  });
  const drafts = $derived(profile.hasWorkContinuity ? planDraftStore.list(draftBoxKey) : []);

  /**
   * 하단 탭에 남길 라이브 배치(최신순). 이 목록이 곧 탭이고, 비면 바가 렌더되지 않는다.
   *
   * 버전 게이트를 여기 한 곳에 둔다. 마크업에도 걸면 같은 규칙이 둘이 되고, 여기 없으면 탭을 두지
   * 않는 버전에서도 아래 영상 목록 폴링이 켜진다(그 폴링의 근거가 이 목록이다)
   */
  const liveBatches = $derived(
    profile.hasWorkContinuity ? planGenerationStore.batchesFor(data.currentChannelId) : [],
  );

  /**
   * dev 진행 화면 미리보기가 도는 중인가(창이 알려 준다)
   *
   * 그 흐름은 배치를 만들지 않아 위 목록에 없다. prod 에는 그 버튼 자체가 없어 늘 거짓이다.
   */
  let previewRunning = $state(false);

  /** 나브의 생성 버튼: 빈 폼으로 연다(되돌아온 작업 없음) */
  function openCreate(): void {
    resumeTarget = null;
    createOpen = true;
  }

  /** 하단 탭: 그 작업의 화면으로 되돌아간다. 이 바의 항목이 아니면 무시한다. */
  function openWorkTab(tabId: string): void {
    const target = targetFromTabId(tabId);
    if (!target) return;
    resumeTarget = target;
    createOpen = true;
  }

  /**
   * 하단 탭의 닫기(×). 지금 닫을 수 있는 것은 초안뿐이다(그 항목만 `closable` 이다).
   *
   * 값을 들고 있는 것이 창이라 창에게 버리라고 한다. 여기서 저장 칸만 지우면 창의 폼에 남은 값이
   * 다음 입력에 다시 저장돼 탭이 되살아난다.
   */
  function closeWorkTab(tabId: string): void {
    const target = targetFromTabId(tabId);
    if (target?.kind !== 'draft') return;
    wizard?.discardDraft(target.draftId);
  }

  /**
   * 이 버전의 내 모델 선택: 생성 전 점검용. 워크스페이스 그리드가 쓰는 것과 같은 쿼리 키라
   * 요청이 늘지 않는다(TanStack 캐시 공유)
   */
  const aiModelQuery = createQuery(() => svc.myAiModelQueryOptions(data.version));

  /** 알림의 '설정 열기': 설정의 AI 모델 탭으로 바로 보낸다(어느 탭인지까지 주소에 담는다) */
  function openAiModelSettings(): void {
    void goto(settingsSectionUrl(basePath, 'ai-model'));
  }

  /**
   * 기획서 생성에 필요한 모델이 다 골라져 있는가. 없으면 우하단 알림으로 알리고 시작하지 않는다.
   *
   * 두 곳에서 부른다: 모달을 열 때(입력을 다 채운 뒤에 막히지 않게)와 확정할 때(그 사이 설정이
   * 바뀌었거나 선택 조회가 늦게 도착했을 수 있다). 알림은 같은 key 로 묶여 두 번 쌓이지 않는다.
   */
  function planModelsReady(): boolean {
    return ensureAiModelsReady('plan', aiModelQuery.data, data.version, {
      onOpenSettings: openAiModelSettings,
    });
  }

  /**
   * 생성 버튼(라벨은 버전마다 다르다) → 생성 배치를 스토어에 추가(네비 넘어 유지) + 그리드로 이동
   *
   * 시작한 배치 id 를 돌려준다. 시작하지 못했으면 null. 모달이 그 값으로 진행 화면으로 넘어갈지
   * 정한다: 모델이 비어 시작하지 못한 경우까지 진행 화면으로 넘기면, 아무것도 돌지 않는데 0% 짜리
   * 진행 바가 뜬다(알림은 이미 떠 있는데 화면은 시작했다고 말하는 상태다)
   */
  function handleGenerate(req: PlanGenerationRequest, draftId: string | null): number | null {
    if (!planModelsReady()) return null;
    // 동영상 수 상한. 화면이 번호를 세어 아는 만큼은 유료 호출 전에 막는다. 번호 없이 적어 여기서
    //   세지 못한 입력은 서버의 정제 단계가 같은 문장으로 거절하고 배치가 스스로 걷힌다.
    if (req.sceneCount > MAX_SCENE_COUNT) {
      toastStore.error('동영상 수 초과', segmentLimitMessage(req.sceneCount), {
        key: 'plan-segment-limit',
      });
      return null;
    }
    const batchId = planGenerationStore.addBatch(data.currentChannelId, req, draftId);
    // 창이 지금부터 다루는 작업. 닫았다가 하단 탭으로 되돌아올 때 같은 값으로 다시 연다.
    resumeTarget = { kind: 'batch', batchId };
    void goto(basePath);
    return batchId;
  }

  /**
   * 진행 화면의 '생성 취소'. 그리드 타일의 삭제와 같은 사가를 쓴다: 취소는 요청 중단과 목록
   * 제외와 캐시 제거를 순서대로 다 해야 실제로 멈추고, 그 셋을 두 곳에서 따로 적으면 한쪽이 낡는다.
   *
   * 결과를 돌려준다. 진행 화면은 이 값이 참일 때만 입력 폼으로 돌아간다. 절반만 취소된 채 폼이
   * 다시 눌리면 아직 도는 것과 새로 시작한 것 둘에 과금된다.
   */
  const queryClient = useQueryClient();
  function handleCancelGeneration(batchId: number): Promise<boolean> {
    return cancelGeneratingBatch(queryClient, data.version, batchId);
  }

  /**
   * 생성 창과 하단 탭이 자기 렌더를 관측하는 창구
   *
   * 워크스페이스 그리드와 같은 키라 캐시와 폴링을 공유한다(요청이 늘지 않는다). 이 셸의 구독은
   * 레이아웃 수명 하나뿐이라, 섹션을 오가도 다시 받지 않고 처음 한 번만 받는다.
   *
   * 탭을 두는 버전에서는 늘 켠다. 이 목록이 곧 탭의 근거인데(미배치 작업) "탭이 있으면 켠다" 로
   * 두면 켤 근거를 그 목록에서 얻어야 해서 아무것도 뜨지 않는다. 새로고침 직후가 정확히 그 상태다.
   *
   * 늘 켜도 상시 폴링이 아니다. 재조회 간격은 렌더 중인 항목이 있을 때만 붙고(`hasRendering`),
   * 끝났는데 배치하지 않은 작업만 남으면 멈춘다. 즉 4초 폴링이 도는 구간은 실제로 무언가 만들고
   * 있는 동안뿐이고, 그때는 그 진행률을 보는 사람이 있다.
   */
  const projectsQuery = createQuery(() =>
    svc.videoProjectsQueryOptions(
      data.version,
      data.currentChannelId,
      createOpen || profile.hasWorkContinuity,
    ),
  );

  /**
   * 이 배치가 만든 영상 프로젝트를 찾는다(아직 없으면 null)
   *
   * 저장본 id 로 잇는 이유: 배치는 화면 쪽 개념이고 프로젝트는 서버 쪽 개념이라, 그 사이를 잇는
   * 값이 자동 저장이 남긴 저장본 id 하나뿐이다. 목록에서 "방금 만든 것" 을 시각으로 추정하면
   * 연달아 두 번 누른 경우에 어긋난다.
   */
  function findRenderProject(batchId: number): VideoProject | null {
    const savedPlanIds = planGenerationStore.batch(batchId)?.savedPlanIds ?? [];
    if (savedPlanIds.length === 0) return null;
    const projects = projectsQuery.data ?? [];
    // 한 배치가 저장본을 여럿 만들 수 있다(기획서 여러 벌). 진행 화면은 하나를 보므로 가장 먼저
    //   만들어진 것을 고른다: 그 순서가 사용자가 보는 순서이고, 매 폴링마다 대상이 바뀌지 않는다.
    for (const savedPlanId of savedPlanIds) {
      const found = projects.find((p) => p.savedPlanId === savedPlanId);
      if (found) return found;
    }
    return null;
  }

  /** 세그먼트 하나만 다시 만들기: 붙어 있는 렌더 잡을 그 칸만 다시 돌린다(그 칸에만 과금된다) */
  const rerenderSegment = createMutation(() =>
    svc.rerenderVideoProjectSegmentMutationOptions(
      queryClient,
      data.version,
      data.currentChannelId,
    ),
  );
  async function handleRegenerateSegment(
    projectId: number,
    order: number,
    prompt: string,
  ): Promise<void> {
    await rerenderSegment.mutateAsync({ id: projectId, order, visualPrompt: prompt });
  }

  /**
   * 생성 창의 마지막 동작: 만든 영상을 작업 공간에 배치한다(썸네일이 있으면 함께 붙인다)
   *
   * 셸이 이 쓰기를 갖는 이유는 무효화 대상이 셸의 축이기 때문이다: 영상 목록은 (버전 × 채널)이고
   * 그 값을 아는 것이 여기다. 창은 어느 영상인지와 어떤 그림인지만 안다.
   */
  const placeVideo = createMutation(() =>
    svc.placeVideoProjectMutationOptions(queryClient, data.version, data.currentChannelId),
  );
  async function handlePlace(input: {
    projectId: number;
    thumbnail: Blob | null;
    batchId: number | null;
  }): Promise<void> {
    await placeVideo.mutateAsync({ id: input.projectId, thumbnail: input.thumbnail });
    // 그 배치가 하던 일이 여기서 끝난다(만든 영상이 작업 공간에 섰다). 걷지 않으면 끝난 작업이
    //   하단 탭에 남고, 눌러 봐야 이미 배치한 영상의 결과 화면이 다시 열린다.
    //   실패하면 걷지 않는다: 위에서 예외가 올라가고 창은 결과 화면에 머물러 다시 누를 수 있다.
    if (input.batchId === null) return;
    const draftId = planGenerationStore.batch(input.batchId)?.draftId ?? null;
    planGenerationStore.removeBatch(input.batchId);
    // 그 입력으로 만들 것은 다 만들었다. 남기면 끝낸 일의 입력이 초안 탭으로 되살아난다.
    //   배치가 걷히기만 하고 초안이 남는 경우는 실패다(그때는 적은 것으로 다시 시도한다).
    if (draftId) planDraftStore.remove(draftBoxKey, draftId);
  }

  /**
   * dev 프리뷰의 '영상 생성': 병합된 영상과 그림을 올려 실제 행을 만든다(배치까지 한 번에)
   *
   * 실제 경로와 갈라 두는 이유는 하나뿐이다: 그쪽은 렌더가 예약해 둔 행이 있어 그 id 를 배치하지만,
   * 프리뷰에는 렌더가 없어 만들 행부터 없다. 그 뒤는 똑같다. 만들어진 행이 실제 산출물과
   * 구별되지 않으므로 목록, 보관, 삭제가 실제와 같은 경로로 동작한다.
   *
   * 캐시에만 카드를 얹으면 목록에는 서지만 그 뒤 동작이 전부 서버가 모르는 id 로 나가 400 이 되고,
   * 확인하려던 흐름이 그 자리에서 끊긴다.
   */
  const createPreviewVideo = createMutation(() =>
    svc.createPreviewProjectMutationOptions(queryClient, data.version, data.currentChannelId),
  );
  async function handlePlacePreview(input: {
    video: Blob;
    thumbnail: Blob | null;
    title: string;
    videoModel: string;
  }): Promise<void> {
    await createPreviewVideo.mutateAsync(input);
  }

  /** 프로젝트 id 로 찾기. 새로고침 뒤 되돌아온 작업이 자기 렌더를 관측하는 창구다. */
  function findProject(projectId: number): VideoProject | null {
    return (projectsQuery.data ?? []).find((p) => p.id === projectId) ?? null;
  }

  /**
   * 아직 배치하지 않은 내 영상 작업(서버). 하단 탭이 새로고침을 넘어 남는 유일한 근거다.
   *
   * 되돌려진 것(취소/실패)은 뺀다. 보여줄 산출물이 없고 사유는 알림이 이미 말했다.
   * 버전 게이트가 여기에도 필요한 이유: 확정 단계가 없는 버전은 `placedAt` 을 아예 찍지 않아
   * 그 버전의 모든 영상이 '미배치' 로 읽힌다(그러면 탭이 목록만큼 늘어난다).
   */
  const unplacedProjects = $derived(
    profile.hasWorkContinuity
      ? (projectsQuery.data ?? []).filter(
          (p) => p.placedAt === null && !isRolledBackStatus(p.renderStatus),
        )
      : [],
  );

  /**
   * 아직 서버에 프로젝트가 없는 배치. 기획안을 만드는 짧은 구간이 여기 해당한다.
   *
   * 프로젝트가 생기면 그쪽이 같은 작업의 대표가 되므로 여기서 빠진다. 그러지 않으면 한 작업이
   * 탭 둘로 보이고, 그중 하나(배치)는 새로고침에 사라져 같은 일이 둘이었다는 착각만 남는다.
   */
  const pendingBatches = $derived(
    liveBatches.filter((b) => b.projectId === null && findRenderProject(b.id) === null),
  );

  /**
   * 이미 제출된 초안. 그 작업의 탭이 대표하므로 초안 탭으로 따로 서지 않는다.
   *
   * 제출한 입력을 지우지 않고 두는 이유: 기획안을 만드는 구간은 이 탭의 쿼리라 새로고침을 넘기지
   * 못한다. 그때 입력까지 지워져 있으면 사람은 처음부터 다시 적어야 한다. 배치가 사라지면 이 집합도
   * 비어 그 초안이 다시 탭으로 서고, 폼은 적은 그대로 다시 선다.
   */
  const submittedDraftIds = $derived(
    new Set(liveBatches.map((b) => b.draftId).filter((id): id is string => id !== null)),
  );

  /**
   * 새로고침 뒤에도 이 배치를 가리킬 수 있는 것(없으면 null)
   *
   * 서버에 같은 일의 이름이 생겼으면 그 프로젝트이고, 아직이면 그 배치를 시작한 초안이다. 돌던
   * 생성을 이어받지는 못하지만 적은 것은 그대로 서고, 그 구간에서 되살릴 수 있는 것은 그것뿐이다.
   */
  function durableBatchTarget(batchId: number): WorkTarget | null {
    const batch = planGenerationStore.batch(batchId);
    const projectId = batch?.projectId ?? findRenderProject(batchId)?.id ?? null;
    if (projectId !== null) return { kind: 'project', projectId };
    return batch?.draftId ? { kind: 'draft', draftId: batch.draftId } : null;
  }

  // 기획서 텍스트를 받아 오는 중인가. 그 구간에는 아직 서버 행이 없어 진행률의 근거가 이것뿐이다.
  const plansFetching = useIsFetching({ queryKey: ['marketing-plans'] });

  /**
   * 하단 탭 목록. 진행률은 창이 그리는 것과 같은 번역을 쓴다(renderProgress).
   *
   * 같은 함수를 쓰는 것이 핵심이다. 탭과 진행 화면이 각자 계산하면 같은 순간에 다른 수를 말하고,
   * 어느 쪽이 맞는지 화면만 봐서는 알 수 없다.
   *
   * 순서는 돌고 있는 것 먼저, 적어 둔 것 나중이다. 급한 쪽이 손에 가깝다.
   */
  const tabItems = $derived(
    composeWorkTabs({
      projects: unplacedProjects,
      batches: pendingBatches,
      drafts,
      // 편집 중인 초안은 창이 열려 있을 때만 뺀다. 닫혀 있으면 그것도 되돌아갈 자리다.
      editingDraftId: createOpen ? editingDraftId : null,
      submittedDraftIds,
      // 미리보기 자리는 dev 에서만. prod 에서는 이 값이 상수 false 라 그 분기가 빠진다.
      previewRunning: import.meta.env.DEV && previewRunning,
      // 시작 시각은 서버가 아는 것을 쓴다. 이 탭의 기억이 없어도(새로고침) 경과 시간이 이어진다.
      projectProgress: (project) =>
        progressFromProject(project, {
          splitting: false,
          startedAt: Date.parse(project.createdAt) || Date.now(),
        }),
      batchProgress: (batch) =>
        progressFromProject(null, {
          splitting: plansFetching.current > 0,
          startedAt: batch.startedAt,
        }),
    }),
  );

  /**
   * 열려 있는 창이 바에서 어느 탭인가. 닫으면 강조가 사라져 "보고 있는 것" 과 "돌고 있는 것" 이 갈린다.
   *
   * 목표를 그대로 쓰지 않는다. 배치로 시작한 창은 그 배치가 만든 프로젝트가 생기는 순간 탭이
   * 프로젝트 쪽으로 바뀌므로(같은 일의 서버 쪽 이름이다), 그때부터 강조가 어느 탭에도 붙지 않는다.
   */
  const activeTabId = $derived.by(() => {
    if (!createOpen || !resumeTarget) return null;
    const shown = durableTarget(resumeTarget, durableBatchTarget);
    return tabIdOf(shown ?? resumeTarget);
  });

  /**
   * 채널을 옮기면 창을 닫는다.
   *
   * 창의 내용은 채널의 것이다(초안 칸도 작업 목록도 채널로 갈린다). 이 셸은 채널 전환에
   * 리마운트되지 않아 열려 있던 창이 그대로 남는데, 그러면 앞 채널의 작업을 가리킨 창이 새 채널의
   * 목록에서 그것을 찾다가 빈 폼으로 떨어진다.
   *
   * 첫 실행은 건너뛴다. 그 시점의 화면은 방금 세션에서 복원한 것이라 닫으면 그 복원을 되돌린다.
   */
  let openedChannelId = untrack(() => data.currentChannelId);
  $effect(() => {
    if (data.currentChannelId === openedChannelId) return;
    openedChannelId = data.currentChannelId;
    untrack(() => {
      createOpen = false;
      resumeTarget = null;
    });
  });

  /**
   * 서버 작업을 가리키던 창 다시 세우기(새로고침 복원의 나머지 절반)
   *
   * 목록이 도착한 뒤 한 번만 판단한다. 이미 배치했거나 사라진 작업이면 열지 않는다. 그 창은 이제
   * 할 일이 없고, 열어 두면 끝난 일을 다시 끝내라는 화면을 마주하게 된다.
   */
  $effect(() => {
    const target = pendingRestore;
    if (target?.kind !== 'project' || !projectsQuery.data) return;
    const project = findProject(target.projectId);
    untrack(() => {
      if (project && project.placedAt === null) {
        resumeTarget = target;
        createOpen = true;
      }
      pendingRestore = null;
    });
  });

  /**
   * 창의 자리를 남긴다(새로고침 뒤 그대로 다시 세우기 위해)
   *
   * 복원이 끝나기 전에는 쓰지 않는다. 그때의 화면은 아직 그 세션이 아니라서, 지금 쓰면 되살릴 값을
   * 스스로 덮어쓴다.
   *
   * 목표가 없으면 편집 중인 초안으로 남긴다. 나브 버튼으로 연 창은 아무 목표도 갖지 않는데,
   * 그대로 두면 다시 들어온 창이 리셋을 거쳐 그 입력을 지운다.
   */
  $effect(() => {
    if (!profile.hasWorkContinuity || pendingRestore) return;
    saveWorkSession(sessionKey, {
      open: createOpen,
      target: durableTarget(
        resumeTarget ?? (editingDraftId ? { kind: 'draft', draftId: editingDraftId } : null),
        durableBatchTarget,
      ),
    });
  });

  /**
   * 이 배치의 일이 끝났는가(남길 산출물 없이). 둘 중 하나면 참이다.
   *
   * 걷지 않으면 하단 탭에 영영 끝나지 않는 작업이 남는다. 되돌려진 행은 다음 조회부터 목록에서
   * 빠지므로(서버가 제외한다) 진행률도 그 자리에 멈춘 채 굳는다.
   */
  function isDeadBatch(batch: GenerationBatch): boolean {
    // 확정 신호: 한 번 있었던 프로젝트가 목록에 없다(되돌려졌거나 지워졌다)
    //   이 판정은 시점에 걸리지 않는다. 브라우저 탭이 백그라운드였든, 되돌림 전이를 다른 탭이
    //   먼저 받았든 같은 답을 낸다.
    if (batch.projectId !== null && findProject(batch.projectId) === null) return true;
    // 전이가 이 응답에 실려 온 경우. 프로젝트 id 를 적어 두지 못한 배치(만들어지는 사이 이 화면을
    //   떠나 콜백을 놓친 경우)의 유일한 근거다.
    const project = findRenderProject(batch.id);
    return project !== null && isRolledBackStatus(project.renderStatus);
  }

  /**
   * 끝난 배치를 걷는다.
   *
   * 사유는 여기서 알리지 않는다. 워크스페이스가 같은 전이를 보고 이미 알림을 띄운다
   * (renderCancellation). 여기서 또 말하면 같은 실패가 두 번 뜬다.
   */
  $effect(() => {
    const dead = liveBatches.filter(isDeadBatch);
    if (dead.length === 0) return;
    untrack(() => {
      for (const batch of dead) planGenerationStore.removeBatch(batch.id);
    });
  });

</script>

<!-- landscape=가로(사이드바 왼쪽) / portrait=세로(보조앱바 위) -->
<div class="flex h-full min-h-0" class:flex-col={isPortrait}>
  <MarketingVideoNav
    portrait={isPortrait}
    {items}
    {activeKey}
    onSelect={(key) => void goto(sectionPath(basePath, key as WorkspaceSection))}
    onCreate={() => {
      // 모델이 비어 있으면 위저드를 열지 않는다: 다 채우고 확정에서 막히면 입력이 헛수고가 된다.
      if (planModelsReady()) openCreate();
    }}
    {createLabel}
  />

  <!--
    콘텐츠 열: 자식 라우트(그리드/상세/섹션) + 하단 탭.
    탭을 이 열 안에 두면 사이드바(가로)와 보조앱바(세로)를 덮지 않고 콘텐츠 폭만 차지한다.
      바깥 열에 두면 사이드바 아래까지 가로로 이어져 그만큼 사이드바가 짧아진다.
    in-flow 라 본문을 가리지도 않는다. 탭이 생기면 본문이 그 높이만큼 줄어들 뿐이다.
  -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-auto p-4">
      {@render children()}
    </div>

    <!-- 항목이 없으면 바 자체가 렌더되지 않는다. 탭을 두지 않는 버전은 목록이 늘 비어 있다. -->
    <BottomTabBar
      items={tabItems}
      activeId={activeTabId}
      onSelect={openWorkTab}
      onClose={closeWorkTab}
      label="끝내지 않은 영상 작업"
    />
  </div>

  <!--
    기획서 생성 모달: 생성 버튼 클릭 시 onGenerate 로 워크스페이스에 배치를 추가한다.
    채널이 바뀌면 창을 다시 만든다. 이 레이아웃은 채널 전환에 리마운트되지 않는데, 창은 자기 초안을
      채널 칸에서 한 번 읽어 폼 값으로 들고 있다. 다시 만들지 않으면 앞 채널에서 적던 것이 다음 채널
      폼에 남고, 그대로 저장돼 남의 칸을 덮어쓴다.
  -->
  {#key data.currentChannelId}
  <PlanWizardModal
    bind:this={wizard}
    bind:open={createOpen}
    channelId={data.currentChannelId}
    version={data.version}
    onGenerate={handleGenerate}
    onCancelGeneration={handleCancelGeneration}
    {findRenderProject}
    onRegenerateSegment={handleRegenerateSegment}
    onPlace={handlePlace}
    onPlacePreview={import.meta.env.DEV ? handlePlacePreview : undefined}
    {findProject}
    resume={resumeTarget}
    bind:previewRunning
    bind:editingDraftId
    submitLabel={createLabel}
  />
  {/key}
</div>

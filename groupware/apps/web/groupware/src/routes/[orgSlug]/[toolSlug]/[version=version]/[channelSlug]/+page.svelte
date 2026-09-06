<script lang="ts">
  // 워크스페이스 그리드. 셸(nav/위저드)은 상위 레이아웃
  //   구역 구성은 버전이 정한다(versionProfile.workspaceStages). v1.0 은 셋(기획안 / 원천 영상 /
  //   최종 영상)을 순서대로 밟고, v1.5 는 누른 한 번이 최종 영상까지 만들어 영상 하나뿐
  //   (그 구역의 영상이 곧 그 버전의 최종본이다). 이 파일의 분기들은 그 목록만 보고 갈리며 버전
  //   이름을 직접 읽지 않음
  //   생성 세션 상태(batches)는 planGenerationStore(모듈)라 상세와 섹션으로 이동해도 유지
  //   저장 기획안 상세는 별도 라우트(/plans/:id)로 이동한다. 라이브(미저장) 배치 상세만 여기 인라인 오버레이
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { createQuery, createMutation, useIsFetching, useQueryClient } from '@tanstack/svelte-query';
  import PlanBatch from '$lib/pages/tools/marketing-video/workspace/PlanBatch.svelte';
  import PlanProposalCard from '$lib/pages/tools/marketing-video/workspace/PlanProposalCard.svelte';
  import PlanTile from '$lib/pages/tools/marketing-video/workspace/PlanTile.svelte';
  import VideoProjectGrid from '$lib/pages/tools/marketing-video/shared/VideoProjectGrid.svelte';
  import ModeDropdown, {
    type WorkspaceMode,
  } from '$lib/pages/tools/marketing-video/shared/ModeDropdown.svelte';
  import SelectionActionBar from '$lib/pages/tools/marketing-video/shared/SelectionActionBar.svelte';
  import ResolutionSelect from '$lib/pages/tools/marketing-video/workspace/ResolutionSelect.svelte';
  import {
    aiModelDefaults,
    formatAiModelLine,
    usesSceneImages,
  } from '$lib/pages/tools/marketing-video/aiModelOptions';
  import { ensureAiModelsReady } from '$lib/pages/tools/marketing-video/aiModelReadiness';
  import { settingsSectionUrl } from '$lib/pages/tools/marketing-video/marketingSettingsSections';
  import { DEFAULT_VIDEO_RESOLUTION, videoResolutionsFor } from '@csc/video-capabilities';
  import { versionProfile } from '$lib/pages/tools/marketing-video/versionProfile';
  import {
    readTab,
    sectionPath,
    tabUrl,
    workspaceBasePath,
    TABS,
    type WorkspaceTab,
  } from '$lib/pages/tools/marketing-video/workspaceUrl';
  import DownloadSelectedButton from '$lib/pages/tools/marketing-video/shared/DownloadSelectedButton.svelte';
  import { createBulkDownload } from '$lib/shared/lib/utils/bulkDownload.svelte';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import {
    notifyRenderCancellations,
    rolledBackRenders,
    visibleRenders,
    workspaceRenders
  } from '$lib/features/marketing-channels/lib/renderCancellation';
  import { notifyRenderLimits } from '$lib/features/marketing-channels/lib/renderFailure';
  import { planSceneImagesStore } from '$lib/shared/lib/stores/planSceneImagesStore/planSceneImagesStore.svelte';
  import { planGenerationStore } from '$lib/shared/lib/stores/planGenerationStore/planGenerationStore.svelte';
  import { cancelGeneratingBatch } from '$lib/features/marketing-channels/lib/cancelGeneratingBatch';
  import type {
    ConceptChoice,
    PlanProposal,
    PlanScene,
    SavedPlan,
    SceneImageState,
    VideoProject,
    VideoFinal,
  } from '$lib/features/marketing-channels/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const currentChannelId = $derived(data.currentChannelId);
  // 세트 적용 피커용 에셋 세트(공통 ∪ 조직): SSR 로드(+page.server). 배경프레임 썸네일 리스트
  const assetSets = $derived(data.assetSets);

  // 주소는 손으로 잇지 않는다. 버전이 채널 위 세그먼트라, 여기서 이어붙이면 그 한 조각을 빠뜨려도
  //   화면은 멀쩡하고 링크를 눌러야 404 가 드러난다(실제로 기획안 상세가 그렇게 깨졌다)
  const basePath = $derived(
    workspaceBasePath({
      orgSlug: page.params.orgSlug ?? '',
      toolSlug: page.params.toolSlug ?? '',
      version: data.version,
      channelSlug: page.params.channelSlug ?? '',
    }),
  );

  // 기획안/원천/최종 탭 = URL 쿼리(?tab). 전환은 replaceState(히스토리 스팸 방지)
  const planTab = $derived<WorkspaceTab>(readTab(page.url));
  // 토글 슬라이딩 표시자용 활성 인덱스. 세그먼트 폭(rem) 하나로 표시자와 버튼, 구분선 위치를 계산
  const tabIndex = $derived(TABS.indexOf(planTab));
  // 탭 라벨은 버전마다 다름(v1.0 은 공정 이름, v1.5 는 산출물 이름). versionProfile 소유
  const version = $derived(data.version);
  const profile = $derived(versionProfile(version));
  const labels = $derived(profile.tabLabels);
  // 제작 단계 토글이 있는 버전인가. 없으면 구역이 한 화면에 쌓인다.
  const hasStageTabs = $derived(profile.hasStageTabs);
  /**
   * 이 버전이 보여주는 제작 구역. v1.5 에는 기획안 구역이 없다(중간 산출물이라 고를 물건이 아니다)
   * 구역이 없으면 그 구역의 목록도 받아 오지 않는다(답이 정해진 조회를 채널마다 하지 않게)
   */
  const showsStage = $derived((tab: WorkspaceTab) => profile.workspaceStages.includes(tab));
  /**
   * 라이브 배치가 마운트되는 구역. 목록의 첫 구역
   *
   * 보이는 자리가 아니라 도는 자리다. v1.0 은 거기서 기획안 타일이 실제로 그려지지만, v1.5 는
   * 배치 전까지 아무것도 그리지 않는다(그 버전의 워크스페이스는 배치된 것만 담는다). 그래도 배치는
   * 마운트는 필요. 자동 저장이 거기서 돌고 저장이 없으면 영상도 만들어지지 않기 때문
   */
  const liveStage = $derived<WorkspaceTab>(profile.workspaceStages[0]);
  /**
   * 지금 다루는 제작 단계. 하단 바의 동작과 삭제 대상이 이 값 하나로 갈림
   *
   * 탭이 있는 버전은 주소가 정하고(그 토글이 곧 화면의 상태다) 없는 버전은 구역이 하나뿐이라 그것이
   * 답. 두 버전이 같은 이름을 쓰므로 아래 분기들이 이 값 하나만 보고 버전 조건이 흩어지지 않음
   */
  const stage = $derived<WorkspaceTab>(hasStageTabs ? planTab : liveStage);
  /**
   * 빈 구역의 모양
   *
   * 탭이 있으면 그 구역이 곧 화면 전체이므로 크게 비운다. 없으면 짧게 알린다: 그 버전의 구역이
   * 화면 높이만큼 비면 새 채널의 첫 화면이 통째로 여백이 되기 때문
   */
  const emptyBoxClass = $derived(
    hasStageTabs
      ? 'flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-center text-fg-subtle'
      : 'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line py-6 text-center text-fg-subtle',
  );
  const SEG_W = 5.75; // rem: 세그먼트 한 칸 폭(두 버전 중 가장 긴 라벨 '프레임 적용' 이 들어가는 최소)
  function switchTab(tab: WorkspaceTab): void {
    setMode('view');
    void goto(tabUrl(basePath, page.url.searchParams, tab), {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }

  // 워크스페이스 모드: 보기 / 삭제 둘뿐이다(ModeDropdown). '영상 만들기'와 '세트 적용'과
  //   '보관함 보내기'는 모드가 아니라 선택 + 하단 바의 동작이라, 보기 모드에서도 타일을 고른다.
  //   삭제 모드가 따로 있는 이유는 그것만 되돌릴 수 없어 실수로 눌리면 안 되기 때문
  let manageMode = $state<WorkspaceMode>('view');
  let selectedIds = $state<number[]>([]);
  // 생성 중 기획안(라이브 배치) 선택분: 저장본(number id)과 id 공간이 달라(proposal id=string) 별도 관리
  //   삭제 모드에서 (batchId, proposal) 로 모아 하단 바에서 일괄 release(planSceneImagesStore.remove)
  let selectedProposals = $state<{ batchId: number; proposal: PlanProposal }[]>([]);
  const selectedProposalIds = $derived(new Set(selectedProposals.map((s) => s.proposal.id)));
  /**
   * 텍스트 생성 중인 배치 선택분(삭제 모드). 아직 기획안이 도착하지 않아 개별로 고를 것이 없으므로
   * 선택 단위가 배치다. 이걸 지우는 것이 생성 취소다(별도 취소 버튼을 두지 않는 이유)
   */
  let selectedGeneratingBatchIds = $state<Set<number>>(new Set());
  // 세트 적용 시 고른 세트 id(배경프레임+아웃트로). 프레임 피커에서 선택
  let selectedSet = $state('');
  function setMode(mode: WorkspaceMode): void {
    manageMode = mode;
    selectedIds = [];
    selectedProposals = [];
    selectedGeneratingBatchIds = new Set();
  }
  // 세트 적용: 선택한 완성 원천 영상 각각에 세트(프레임+아웃트로) 합성 잡을 등록하고 최종 탭으로 이동
  function applySet(): void {
    const setId = Number(selectedSet);
    if (!Number.isInteger(setId) || setId <= 0) return; // 세트 미선택이면 무시(하단 버튼 비활성)
    // 멱등키는 이 클릭 시점에 항목마다 만든다(MES clientOpId 와 같은 규약). 같은 원천에 같은 세트를
    //   다시 적용하는 것은 정상이므로 (sourceId, setId) 로 키를 만들면 두 번째가 막힌다.
    selectedIds.forEach((sourceId) =>
      createFinalMutation.mutate({ sourceId, setId, clientRequestId: crypto.randomUUID() }),
    );
    setMode('view');
    selectedSet = '';
    switchTab('final');
  }
  /**
   * 선택 토글. 구역을 함께 받지 않는다. 지금 다루는 구역은 `stage` 가 정한다(탭이거나 하나뿐인 구역)
   */
  function toggleSelect(id: number): void {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
  }
  // 생성 중 기획안 선택 토글(별도 id 공간). 삭제 모드에서만 쓰인다.
  function toggleProposal(batchId: number, proposal: PlanProposal): void {
    selectedProposals = selectedProposals.some((s) => s.proposal.id === proposal.id)
      ? selectedProposals.filter((s) => s.proposal.id !== proposal.id)
      : [...selectedProposals, { batchId, proposal }];
  }
  /** 생성 중 배치 선택 토글(삭제 모드). 새 Set 으로 갈아 반응 유발 */
  function toggleGeneratingBatch(batchId: number): void {
    const next = new Set(selectedGeneratingBatchIds);
    if (!next.delete(batchId)) next.add(batchId);
    selectedGeneratingBatchIds = next;
  }
  // 하단 바 표시/개수 = 저장본, 영상 선택 + 생성 중 기획안 선택 + 생성 중 배치 선택 총합
  const totalSelected = $derived(
    selectedIds.length + selectedProposals.length + selectedGeneratingBatchIds.size,
  );

  // 개인 저장본(영구, DB) + 영상 프로젝트: TanStack(캐시 공유). 저장/삭제/렌더 시 invalidate.
  const queryClient = useQueryClient();
  // 기획안 구역이 없는 버전에서는 묻지 않는다: 저장된 기획안을 아무도 그리지 않는다(중간 산출물이라
  //   저장되자마자 영상이 되고, 화면에는 그 영상이 선다)
  const savedQuery = createQuery(() =>
    svc.savedPlansQueryOptions(version, currentChannelId, showsStage('plan')),
  );
  const savedPlans = $derived<SavedPlan[]>(savedQuery.data ?? []);
  const saveMutation = createMutation(() => svc.saveSavedPlanMutationOptions(queryClient, version, currentChannelId));
  const deleteMutation = createMutation(() => svc.deleteSavedPlanMutationOptions(queryClient, version, currentChannelId));

  const videoQuery = createQuery(() => svc.videoProjectsQueryOptions(version, currentChannelId));
  // 되돌려진 작업(생성 불가로 취소)은 카드로 그리지 않음. 보여줄 산출물이 없기 때문
  //   사라진 이유는 아래 $effect 가 전역 알림으로 한 번 통보
  //
  // 확정 단계가 있는 버전은 배치된 것만 그린다: 생성 창의 마지막 동작('영상 생성')을 거친
  //   영상만 이 목록에 선다. 근거는 workspaceRenders 주석
  const videoProjects = $derived<readonly VideoProject[]>(
    workspaceRenders(videoQuery.data, profile.hasGenerationProgress),
  );
  const createVideoMutation = createMutation(() => svc.createVideoProjectMutationOptions(queryClient, version, currentChannelId));
  const rerenderVideoMutation = createMutation(() => svc.rerenderVideoProjectMutationOptions(queryClient, version, currentChannelId));
  const deleteVideoMutation = createMutation(() => svc.deleteVideoProjectMutationOptions(queryClient, version, currentChannelId));

  // 최종 영상(원천 + 세트 합성): 최종 구역. 렌더 중이면 폴링(videoFinalsQueryOptions)
  //   그 구역이 없는 버전에서는 묻지 않는다: 세트를 만들 수 없어 최종본이 생길 방법이 없고,
  //   답이 정해진 조회를 채널마다 한 번씩 하게 됨
  const finalQuery = createQuery(() =>
    svc.videoFinalsQueryOptions(version, currentChannelId, showsStage('final')),
  );
  const videoFinals = $derived<readonly VideoFinal[]>(visibleRenders(finalQuery.data));

  // 취소 통보: 목록에서는 이미 걷어냈으므로 이 알림이 없으면 작업이 왜 사라졌는지 알 수 없음
  //   서버가 취소된 항목을 전이 직후 한 번만 실어 오므로(어댑터가 이후 폴링에서 제외) 여기서
  //   중복 방지 상태를 들지 않는다. 파생으로 한 번 걸러 두면 취소가 없는 대부분의 틱에서는 값이
  //   같은 빈 배열이라 effect 가 아예 재실행되지 않음
  const cancelledSources = $derived(rolledBackRenders(videoQuery.data));
  const cancelledFinals = $derived(rolledBackRenders(finalQuery.data));
  // 한도, 크레딧, 키 문제의 조치는 모두 AI 모델 설정에 있다. 알림 버튼이 그 섹션을 바로 연다.
  const renderFailureActions = {
    openModelSettings: () => void goto(settingsSectionUrl(basePath, 'ai-model')),
  };
  $effect(() => {
    notifyRenderCancellations(cancelledSources, '원천영상', renderFailureActions);
  });
  $effect(() => {
    notifyRenderCancellations(cancelledFinals, '최종영상', renderFailureActions);
  });
  // 렌더 중 한도에 걸린 것은 취소가 아니다(서버가 재시도한다). 그래도 왜 오래 걸리는지는 말해 준다.
  //   항목마다 한 번만 알리는 기억은 헬퍼가 갖는다(같은 상태가 폴링마다 실려 오기 때문)
  $effect(() => {
    notifyRenderLimits(videoQuery.data, '원천영상');
  });
  const createFinalMutation = createMutation(() => svc.createVideoFinalMutationOptions(queryClient, version, currentChannelId));
  const rerenderFinalMutation = createMutation(() => svc.rerenderVideoFinalMutationOptions(queryClient, version, currentChannelId));
  const deleteFinalMutation = createMutation(() => svc.deleteVideoFinalMutationOptions(queryClient, version, currentChannelId));
  // 보관함 보내기: 버전이 어느 표의 산출물을 보관하는지 정한다(versionProfile.archiveSource)
  //   그 판정은 BFF 가 하므로 이 화면은 한 뮤테이션으로 두 버전을 다 다룬다.
  const archiveVideoMutation = createMutation(() => svc.archiveVideoMutationOptions(queryClient, version, currentChannelId));

  // 선택분 다운로드. 순차와 실패허용 정책은 공용 컨트롤러가 갖는다(보관함과 공유).
  //   완성본만 수신. 렌더 중이거나 실패한 것은 결과 파일이 없음
  //   대상은 지금 구역이 정한다. 최종 구역이 있는 버전에서는 최종본을, 없는 버전에서는 그 하나뿐인
  //   영상 구역을 받는다(그 버전에서는 그것이 완성본이다)
  const download = createBulkDownload();
  const stageItems = $derived<readonly (VideoProject | VideoFinal)[]>(
    stage === 'final' ? videoFinals : stage === 'source' ? videoProjects : [],
  );
  const downloadItems = $derived(
    selectedIds
      .map((id) => stageItems.find((f) => f.id === id))
      .filter((f): f is VideoProject | VideoFinal => !!f?.resultUrl && f.renderStatus === 'COMPLETED')
      .map((f) => ({ url: f.resultUrl as string, name: f.title })),
  );

  // 실패한 완성본도 '완성' 그룹에 섞여 선택된다(그리드는 렌더중 여부로만 나눈다). 서버는 완성본만
  //   보관을 허용하므로, 하나라도 미완성이 섞이면 버튼을 잠근다. 이 화면엔 에러 표시가 없어서
  //   그냥 두면 눌러도 아무 일도 안 일어나는 것처럼 보인다.
  //   대상은 지금 구역이 결정(다운로드와 같은 규칙). 보관 대상이 버전마다 다른 구역에 있기 때문
  const archiveBlocked = $derived(
    selectedIds.some((id) => stageItems.find((f) => f.id === id)?.renderStatus !== 'COMPLETED'),
  );

  /**
   * 보관함 보내기: 선택한 완성본을 조직 공유 보관함으로 이동하고 보관함 화면으로 전환
   * (탭이 아니라 별도 섹션 라우트라 switchTab 이 아니라 sectionPath 로 이동한다.)
   *
   * 이 목록의 카드는 전부 서버가 아는 행이다(미리보기 산출물도 실제 행으로 등록된다). 그래서
   * 여기서 대상을 가릴 것이 없음
   */
  function sendToArchive(): void {
    selectedIds.forEach((id) => archiveVideoMutation.mutate(id));
    setMode('view');
    void goto(sectionPath(basePath, 'archive'));
  }

  const deleteBusy = $derived(
    deleteVideoMutation.isPending || deleteMutation.isPending || deleteFinalMutation.isPending,
  );
  function confirmDelete(): void {
    // 생성 중인 것은 라이브 구역에 있다(버전마다 그 구역이 다르다). 저장본 삭제와 별개라 먼저 처리
    //   생성 중 타일의 삭제 = 그 생성의 취소. 진행 화면의 '생성 취소' 와 같은 사가 사용
    //   (여기서 다시 적으면 쿼리 키가 갈려 취소가 조용히 no-op 이 되는 사고가 되풀이된다)
    //   결과를 기다리지 않는다: 실패하면 사가의 보상이 타일을 되돌려 놓고 알림이 뜬다.
    if (stage === liveStage) {
      selectedProposals.forEach((s) => planSceneImagesStore.remove(s.batchId, s.proposal));
      selectedGeneratingBatchIds.forEach((id) => {
        void cancelGeneratingBatch(queryClient, version, id);
      });
    }
    // 구역별 저장본 삭제: 원천 영상 / 최종 영상 / 기획안
    if (stage === 'source') selectedIds.forEach((id) => deleteVideoMutation.mutate(id));
    else if (stage === 'final') selectedIds.forEach((id) => deleteFinalMutation.mutate(id));
    else if (stage === 'plan') {
      selectedIds.forEach((id) => deleteMutation.mutate(id));
    }
    setMode('view');
  }
  // 원천 영상 화질: 내가 고른 영상 모델이 화질 조정을 지원할 때만 선택 가능
  //   모델을 바꾸거나 미지원 모델이면 고른 값이 무의미해져 기본값으로 복귀
  //   서버도 같은 규칙으로 clamp 하므로 여기 값이 어긋나도 잘못된 화질로 렌더되지는 않음
  const aiModelQuery = createQuery(() => svc.myAiModelQueryOptions(version));
  const videoModelKey = $derived(aiModelQuery.data?.video || aiModelDefaults(version).video || '');
  let pickedResolution = $state(DEFAULT_VIDEO_RESOLUTION);
  const resolution = $derived(
    videoResolutionsFor(videoModelKey).includes(pickedResolution)
      ? pickedResolution
      : DEFAULT_VIDEO_RESOLUTION,
  );

  /**
   * 저장이 끝난 기획안을 곧바로 영상으로 만든다(기획안 구역이 없는 버전)
   *
   * 사람이 누르는 '영상 만들기' 와 같은 호출이다. 다른 것은 고르는 단계가 없다는 것뿐이라,
   * 모델 점검도 같이 한다: 모델이 비어 있으면 백엔드가 자기 기본값으로 만들어 화면이 말한 적 없는
   * 방식의 결과물이 나온다. 그때는 만들지 않고 알림만 띄운다(기획안은 이미 저장돼 있다)
   *
   * 멱등키를 저장본 id 로 만든다. 이 경로는 저장본 하나당 정확히 한 번이고, 자동 저장이 어떤 이유로
   * 두 번 성공해도(재시도) 렌더 잡이 둘이 되면 안 된다. 사람이 누르는 쪽은 같은 기획안으로 다시
   * 만드는 것이 정상이라 매번 새 키
   */
  function autoCreateVideo(savedPlanId: number, batchId: number): void {
    const ready = ensureAiModelsReady('sourceVideo', aiModelQuery.data, version, {
      onOpenSettings: () => void goto(settingsSectionUrl(basePath, 'ai-model')),
    });
    if (!ready) return;
    createVideoMutation.mutate(
      {
        savedPlanId,
        resolution,
        clientRequestId: `auto:${savedPlanId}`,
      },
      {
        // 만들어진 프로젝트를 배치에 적어 둔다. 그 시점이 이 작업이 서버로 넘어간 시점이고,
        //   하단 탭도 그때부터 프로젝트를 대표로 세운다(스토어의 linkProject 주석 참고).
        //   이 콜백이 유실될 수 있다(이 화면을 떠나면 호출되지 않는다). 그때는 저장본 id 로 찾는
        //   기존 경로가 그대로 동작하므로 잃는 것은 "사라졌다" 를 확정하는 근거뿐이다.
        onSuccess: (project) => planGenerationStore.linkProject(batchId, project.id),
      },
    );
  }

  // 영상 만들기 모드: 선택한 기획안들을 한 번에 원천 영상으로 만들고 원천 영상 탭으로 이동
  function confirmMakeVideo(): void {
    // 영상/TTS 모델을 고르지 않았으면 시작하지 않는다. 빈 값으로 보내면 백엔드가 자기 기본값
    //   (슬라이드쇼/edge-tts)으로 만들어 화면이 말한 적 없는 방식의 결과물이 나옴
    const ready = ensureAiModelsReady('sourceVideo', aiModelQuery.data, version, {
      onOpenSettings: () => void goto(settingsSectionUrl(basePath, 'ai-model')),
    });
    if (!ready) return;
    // 멱등키: 이 클릭 한 번. 같은 기획안으로 다시 만드는 것은 정상이라 저장본 id 로 만들지 않음
    selectedIds.forEach((id) =>
      createVideoMutation.mutate({
        savedPlanId: id,
        resolution,
        clientRequestId: crypto.randomUUID(),
      }),
    );
    setMode('view');
    switchTab('source');
  }
  // 하단 확정 바의 동작: (모드, 구역) 하나의 표에서 도출
  //   이전엔 라벨/변형/pending/onConfirm 을 각각 삼항으로 늘어놓아, 분기를 하나 늘릴 때마다 네 군데를
  //   같이 고쳐야 했고 최종 탭은 실제로 '영상 만들기' 분기로 잘못 떨어져 있었다(선택이 막혀 있어 안 보였을 뿐)
  //   above = 바 위에 얹을 보조 컨트롤(화질 선택, 다운로드). 분기마다 하나만 뜨는 것이 여기서 보장됨
  //
  // 보관 분기는 구역 이름이 아니라 `archiveSource` 로 판정한다. 그 값이 그 버전의 배포본이 어느
  //   구역에 있는지를 말하고(세트를 입히는 버전은 최종, 아닌 버전은 그 하나뿐인 영상), 서버가 어느
  //   표에 쓰는지도 같은 값이 정한다. 두 구역에 같은 분기를 따로 적으면 표에 같은 답이 두 줄이 되고
  //   한쪽만 고치는 순간 화면과 쓰기가 어긋남
  const barAction = $derived(
    manageMode === 'delete'
      ? { label: '삭제하기', variant: 'danger' as const, pending: deleteBusy, run: confirmDelete, above: null }
      : stage === 'source' && showsStage('final')
        ? {
            // 최종 구역이 있는 버전의 영상 구역: 여기서 할 일은 세트를 입혀 배포본을 만드는 것
            label: '세트 적용',
            variant: 'primary' as const,
            // 세트 미선택뿐 아니라 진행 중에도 잠근다. isPending 이 빠지면 빠른
            //   두 번 클릭이 합성 잡을 두 개 만들 수 있었다(멱등키가 사고를 막지만 버튼은 잠근다)
            pending: !selectedSet || createFinalMutation.isPending,
            run: applySet,
            above: null,
          }
        : stage === profile.archiveSource
          ? {
              // 배포본이 있는 구역: 갈 곳은 보관함. 자리 규칙이 두 버전과 보관함 화면에서 동일
              //   (위=다운로드(보조), 가운데=이동)
              label: '보관함 보내기',
              variant: 'primary' as const,
              pending: archiveVideoMutation.isPending || archiveBlocked,
              run: sendToArchive,
              above: 'download' as const,
            }
          : { label: '영상 만들기', variant: 'primary' as const, pending: createVideoMutation.isPending, run: confirmMakeVideo, above: 'resolution' as const },
  );

  // 저장본 상세 = 별도 라우트로 이동(레이아웃 유지 → 생성 안 끊김, 딥링크/새로고침 지원)
  function openSaved(sp: SavedPlan): void {
    void goto(`${basePath}/plans/${sp.id}`);
  }
  // 저장본 썸네일: 첫 씬 이미지 접근 URL(없으면 null)
  function savedThumb(sp: SavedPlan): string | null {
    return sp.sceneImages.length > 0 ? sp.sceneImages[0].url : null;
  }

  // 생성 중 라이브 배치(스토어): 현재 채널 것만. 저장 완료된 proposal 은 savedIds 로 그리드에서 숨김
  const batches = $derived(planGenerationStore.batchesFor(currentChannelId));
  const savedIds = $derived(planGenerationStore.savedIds);

  // '만드는 중' 실제 개수 = 배치별 라이브 타일 수 합(배치 개수가 아님). 각 PlanBatch 가 onLiveCount 로 보고
  //   아직 보고 전(마운트 직후)엔 요청 개수(proposalCount)로 낙관 추정 → 텍스트 생성 중에도 정확한 수를 보인다.
  //   전부 저장/삭제되면 0 → '만드는 중' 섹션이 사라진다(빈 섹션/유령 카운트 방지)
  //
  // 기획안 구역이 없는 버전에서는 늘 0이다. 그 버전은 완성 전까지 워크스페이스에 아무것도
  //   보여주지 않는다. 낙관 추정까지 그 규칙을 따라야 한다: 안 그러면 첫 보고가 오기 전 한 프레임
  //   동안 "만드는 중 3" 이 떴다 사라진다.
  let liveCounts = $state<Record<number, number>>({});
  const inProgressCount = $derived(
    showsStage('plan')
      ? batches.reduce((sum, b) => sum + (liveCounts[b.id] ?? b.req.proposalCount), 0)
      : 0,
  );

  // 워크스페이스 상단 진행 요약: 텍스트 생성(TanStack) → 씬 이미지 생성(스토어)
  const plansFetching = useIsFetching({ queryKey: ['marketing-plans'] });
  const imageProgress = $derived(planSceneImagesStore.progress());
  const statusText = $derived(
    plansFetching.current > 0
      ? '기획안 텍스트 생성중…'
      : imageProgress.inProgress
        ? `씬 이미지 생성중… ${imageProgress.done}/${imageProgress.total}`
        : null,
  );

  // 공유 이미지 GPU(자체 모델) 현황: 그리드가 떠 있는 동안만 폴링. 외부 벤더면 서버가 null(큐 없음)
  //   씬 이미지를 만들지 않는 버전에서는 아예 묻지 않는다. 그 버전은 이 큐에 아무것도 넣지 않아
  //   답이 늘 남의 대기열이고, 화면도 그 값을 그리지 않는다(5초마다 버려질 요청만 남는다)
  const imageLoadQuery = createQuery(() =>
    svc.imageEngineLoadQueryOptions(version, usesSceneImages(version)),
  );
  const imageLoad = $derived(imageLoadQuery.data ?? null);
  const sharedWaiting = $derived(imageLoad ? imageLoad.running + imageLoad.pending : null);

  // 라이브(미저장) 배치 상세: 비영속이라 라우팅 불가 → 그리드 인라인 오버레이(로컬)
  //   imageFor = 씬 번호 → 이미지 상태. 라이브 배치는 반응형 접근자(생성 중이면 상세에서 채워짐)
  interface DetailView {
    proposal: PlanProposal;
    // 씬 이미지를 쓰지 않는 버전에서는 오지 않는다(카드가 이미지 자리를 그리지 않게)
    imageFor?: (sceneIndex: number) => SceneImageState | undefined;
    onRetry?: (scene: PlanScene, imagePrompt?: string) => void;
    onPickImage?: (scene: PlanScene, file: File) => void;
    promptEditFor?: (sceneIndex: number) => string | undefined;
    onEditPrompt?: (scene: PlanScene, imagePrompt: string) => void;
    onDelete?: () => void;
  }
  let liveDetail = $state<DetailView | null>(null);

  // 상세로 열려 있어 아직 해제하지 못한 기획안(proposalId → batchId): 상세를 닫을 때 해제
  const pendingRelease = new Map<string, number>();
  function openDetail(view: DetailView): void {
    liveDetail = view;
  }
  function closeDetail(): void {
    if (liveDetail) {
      const id = liveDetail.proposal.id;
      const batchId = pendingRelease.get(id);
      if (batchId != null) {
        planSceneImagesStore.release(batchId, liveDetail.proposal);
        pendingRelease.delete(id);
      }
      liveDetail = null;
    }
  }

  // 기획안 완성(자동 저장): 완성 씬 이미지를 개인 스토리지에 올리고 저장. 성공 시 저장본 그리드로 이관
  function handleProposalComplete(
    batchId: number,
    proposal: PlanProposal,
    images: Record<number, SceneImageState>,
    llmModel: string,
  ): void {
    // 작업자가 상세에서 고친 브리프(imagePrompt)를 씬에 반영해 저장
    const editedProposal: PlanProposal = {
      ...proposal,
      scenes: proposal.scenes.map((s) => {
        const edit = planSceneImagesStore.promptEdit(batchId, proposal.id, s.index);
        return edit === undefined ? s : { ...s, imagePrompt: edit };
      }),
    };
    saveMutation.mutate(
      {
        channelId: currentChannelId,
        brandName: brandNameFor(batchId),
        brandConcepts: conceptsFor(batchId),
        videoModel: videoModelFor(batchId),
        segmentMode: segmentModeFor(batchId),
        // 멱등키: 자동 저장은 기획안 하나당 정확히 한 번이라 결정적 값이 그 의미를 그대로 표현
        //   '다시 저장' 이 전체를 재실행해도 같은 키라 같은 행을 집는다(중복 저장이 생기지 않는다)
        clientRequestId: `${batchId}:${proposal.id}`,
        // 이 기획안을 실제로 만든 기획 LLM(생성 응답이 말한 값). 배치가 운반
        llmModel,
        proposal: editedProposal,
        images,
      },
      {
        onSuccess: (savedPlan) => {
          planGenerationStore.markSaved(proposal.id);
          // 이 배치가 만든 저장본을 배치에 기록. 진행 화면이 자기 렌더를 찾는 유일한 실
          //   (markSaved 는 타일 숨김이라 관심사가 다르다: 스토어의 두 메서드 주석 참고)
          planGenerationStore.linkRender(batchId, savedPlan.id);
          // 기획안 구역이 없는 버전에서는 저장이 끝나는 즉시 영상을 만든다. 그 버전의 '영상 생성' 은
          //   누른 한 번으로 영상까지 가는 버튼이고, 기획안은 그 도중에 저장되는 중간 산출물
          //   고를 자리가 없으니 기다릴 것도 없다(기다리면 아무도 누르지 않아 영원히 기획안으로 남는다)
          if (!showsStage('plan')) autoCreateVideo(savedPlan.id, batchId);
          // 상세로 열어 둔 기획안은 이 상태를 라이브로 읽으므로 그대로 두고(닫을 때 해제), 아니면 즉시 해제
          if (liveDetail?.proposal.id === proposal.id) pendingRelease.set(proposal.id, batchId);
          else planSceneImagesStore.release(batchId, proposal);
        },
      },
    );
  }
  // 배치의 브랜드명: 저장 시 필요(생성 요청에서). 스토어 배치에서 조회
  function brandNameFor(batchId: number): string {
    return batches.find((b) => b.id === batchId)?.req.brandName ?? '';
  }
  /**
   * 배치의 연출 축 조합: 저장본에 스냅샷으로 함께 저장
   *
   * 브랜드 이름만 저장하면 재현되지 않는다. 기획서 생성 모달에서 조합을 바꿔 뽑을 수 있고 그 변경은
   * 세트에 남지 않으므로, 나중에 씬 이미지를 다시 만들 때 세트의 현재 조합을 쓰게 되어 처음 만든
   * 그림과 화풍이 어긋나기 때문
   */
  function conceptsFor(batchId: number): ConceptChoice[] {
    return batches.find((b) => b.id === batchId)?.req.concepts ?? [];
  }
  /**
   * 배치의 영상 모델: 저장본에 스냅샷으로 함께 저장
   *
   * 연출 축 조합과 같은 이유다. 생성 모달에서 설정과 다른 모델을 골라 뽑을 수 있고 그 선택은
   * 설정에 남지 않으므로, 저장해 두지 않으면 나중에 이 기획안으로 영상을 만들 때 그때의 설정을
   * 쓰게 됨. 고른 적 없으면 빈 문자열이고 그때는 서버가 설정 참조
   */
  function videoModelFor(batchId: number): string {
    return batches.find((b) => b.id === batchId)?.req.videoModel ?? '';
  }
  /** 배치의 세그먼트 연결 방식: 영상 모델과 같은 이유로 저장본에 함께 저장 */
  function segmentModeFor(batchId: number): string {
    return batches.find((b) => b.id === batchId)?.req.segmentMode ?? '';
  }
</script>

<!-- 제작 3단계 전환 토글(라벨은 versionProfile.tabLabels): 상세를 볼 때는 숨김
     (상세가 콘텐츠 전체를 차지). 우측: 생성 진행/공유 GPU 현황
     토글이 없는 버전이 있다(versionProfile.hasStageTabs). 만들면 바로 영상이 나오는 구성이라
     단계를 오갈 일이 없어 세 구역이 아래에 제목을 달고 쌓인다. 모드 드롭다운은 그때도 유지
     (삭제/세트 적용은 단계와 무관한 조작이다) -->
{#if liveDetail === null}
  <div class="mb-4 flex items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <!-- 세그먼트 토글: 활성 표시자가 미끄러지고(transition-transform), 인접하지 않은 세그먼트 사이엔 구분선 -->
      {#if hasStageTabs}
      <div class="relative inline-flex rounded-lg border border-line p-0.5 text-sm">
        <!-- 슬라이딩 표시자: 활성 탭 칸으로 이동. 폭=세그먼트 한 칸이라 translateX(index*100%)로 정렬 -->
        <div
          class="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-md bg-fg transition-transform duration-200 ease-out"
          style="width: {SEG_W}rem; transform: translateX({tabIndex * 100}%)"
          aria-hidden="true"
        ></div>
        <!-- 세그먼트 사이 구분선: 인접 세그먼트가 활성이면(표시자와 겹침) 숨김 -->
        {#each TABS.slice(1) as tab, gap (tab)}
          <span
            class="pointer-events-none absolute inset-y-1.5 w-px -translate-x-1/2 bg-line transition-opacity duration-200 {tabIndex !==
              gap && tabIndex !== gap + 1
              ? 'opacity-100'
              : 'opacity-0'}"
            style="left: calc(0.125rem + {(gap + 1) * SEG_W}rem)"
            aria-hidden="true"
          ></span>
        {/each}
        {#each TABS as tab (tab)}
          <button
            type="button"
            onclick={() => switchTab(tab)}
            style="width: {SEG_W}rem"
            class="relative z-10 rounded-md py-1 text-center transition-colors {planTab === tab
              ? 'font-medium text-surface'
              : 'text-fg-subtle hover:text-fg'}"
          >
            {labels[tab]}
          </button>
        {/each}
      </div>
      {/if}
      <!-- 모드 드롭다운: 보기/삭제. '영상 만들기'와 '세트 적용'은 타일 선택 + 하단 바가 맡는다(모드 아님)
           토글이 없는 버전에서는 이것이 줄의 맨 앞이라 메뉴를 버튼 왼쪽 모서리에 맞춘다. 오른쪽에
           맞추면 메뉴가 버튼 왼쪽으로 삐져나와 아래 그리드와 어긋난 자리에 뜬다. -->
      <ModeDropdown value={manageMode} onChange={setMode} align={hasStageTabs ? 'end' : 'start'} />
    </div>

    <div class="flex items-center gap-2">
      {#if stage === liveStage && statusText}
        <div class="flex items-center gap-1.5 text-xs text-fg-subtle" role="status">
          <svg class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" />
            <path class="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          </svg>
          <span class="tabular-nums">{statusText}</span>
        </div>
      {:else if stage === liveStage && sharedWaiting !== null}
        <div
          class="flex items-center gap-1.5 text-xs text-fg-subtle"
          role="status"
          title="자체 이미지 GPU는 조직 전체가 함께 씁니다. 지금 진행/대기 중인 작업 수입니다."
        >
          <span
            class="inline-block h-1.5 w-1.5 shrink-0 rounded-full {sharedWaiting === 0
              ? 'bg-emerald-500'
              : sharedWaiting <= 3
                ? 'bg-amber-500'
                : 'bg-rose-500'}"
          ></span>
          {#if sharedWaiting === 0}
            <span>공유 이미지 GPU 여유</span>
          {:else}
            <span>공유 이미지 GPU <span class="tabular-nums font-medium text-fg">{sharedWaiting}건</span> 진행/대기</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<!--
  생성 중인 배치. 라이브 구역에서 돈다(버전마다 그 구역이 다르다: v1.0 은 기획안, v1.5 는 영상)
  v1.5 에서는 돌기만 하고 아무것도 그리지 않는다(PlanBatch 안의 showsPlanTiles)

  스니펫으로 빼 둔 이유는 자리만 옮기는 것이 아니기 때문. 이 컴포넌트가 기획안 자동 저장을 담당
  (onProposalComplete). 기획안 구역이 없는 버전에서 이것까지 함께 빠지면 만들어진 기획안이 저장되지
  않고, 저장이 없으면 영상도 만들어지지 않는다. 그래서 구역이 사라져도 이것은 유지
-->
{#snippet generatingBatches()}
  <!-- 마운트와 표시를 가른다. 배치가 있으면 PlanBatch 는 무조건 마운트한다(자동 저장이 여기서
       돈다). 사람에게 보이는 머리글과 칸은 `inProgressCount` 가 정하고, 그 값은 그리지 않는
       버전에서 0 이라 아무것도 나타나지 않음
       이 스니펫 전체를 `inProgressCount > 0` 안에 두면 그리지 않는 버전에서 컴포넌트가 아예
       마운트되지 않아 기획안이 저장되지 않고 영상도 만들어지지 않음 -->
  {#if batches.length > 0}
    <section>
      {#if inProgressCount > 0}
        <div class="mb-2 flex items-center gap-1.5 text-xs font-medium">
          <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"></span>
          <span class="text-fg">만드는 중</span>
          <span class="tabular-nums text-fg-subtle">{inProgressCount}</span>
        </div>
      {/if}
      <div class="grid grid-cols-[repeat(auto-fill,11rem)] content-start justify-start gap-4">
        {#each batches as batch (batch.id)}
          <PlanBatch
            channelId={currentChannelId}
            {version}
            req={batch.req}
            batchId={batch.id}
            onOpen={openDetail}
            onProposalComplete={(proposal, images, llmModel) =>
              handleProposalComplete(batch.id, proposal, images, llmModel)}
            {savedIds}
            selectMode={manageMode === 'delete'}
            {selectedProposalIds}
            onToggleProposal={(p) => toggleProposal(batch.id, p)}
            onLiveCount={(c) => (liveCounts[batch.id] = c)}
            batchSelected={selectedGeneratingBatchIds.has(batch.id)}
            onToggleBatch={() => toggleGeneratingBatch(batch.id)}
          />
        {/each}
      </div>
    </section>
  {/if}
{/snippet}

<!-- 기획안 구역: 개인 저장본(영구) + 생성 중 라이브 배치
     탭이 있는 버전에서는 다른 탭일 때 숨긴다(언마운트하지 않는다: 생성 상태 보존)
     이 구역이 없는 버전이 있다(versionProfile.workspaceStages). 누른 한 번이 영상까지 가는
     구성에서 기획안은 도중에 저장되는 중간 산출물이라 골라서 다음으로 넘길 물건이 아님 -->
{#if showsStage('plan')}
<div class:hidden={hasStageTabs && planTab !== 'plan'}>
  {#if inProgressCount === 0 && savedPlans.length === 0 && !savedQuery.isPending}
    <div class={emptyBoxClass}>
      {#if hasStageTabs}
        <svg class="h-10 w-10 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2" y="5" width="15" height="14" rx="2" />
          <path d="m17 9 5-3v12l-5-3" />
        </svg>
      {/if}
      <p class="text-sm">아직 생성한 기획서가 없습니다.</p>
      <p class="text-xs">‘기획서 생성’ 버튼으로 새 기획서를 시작하세요.</p>
    </div>
  {:else}
    <!-- 기획안: 만드는 중(생성 배치) / 완성(저장본) 그룹. 상세를 볼 때도 언마운트하지 않고 숨긴다(생성 상태 보존) -->
    <div class="flex flex-col gap-5" class:hidden={liveDetail !== null}>
      {@render generatingBatches()}
      {#if savedPlans.length > 0}
        <section>
          <div class="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"></span>
            <span class="text-fg">완성</span>
            <span class="tabular-nums text-fg-subtle">{savedPlans.length}</span>
          </div>
          <div class="grid grid-cols-[repeat(auto-fill,11rem)] content-start justify-start gap-4">
            <!-- selectMode 는 '만드는 중' 타일과 같은 규칙: 선택 여부로 갈리면 뭔가 체크된 순간
                 본체 클릭이 상세 열기 대신 선택 토글이 되어 "클릭이 안 먹는" 것처럼 보인다. -->
            {#each savedPlans as sp (sp.id)}
              <PlanTile
                {version}
                src={savedThumb(sp)}
                title={sp.title}
                onOpen={() => openSaved(sp)}
                selectable
                selectMode={manageMode === 'delete'}
                selected={selectedIds.includes(sp.id)}
                onToggleSelect={() => toggleSelect(sp.id)}
                info={sp.llmModel || sp.imageModel
                  ? [
                      { label: '기획 LLM', value: formatAiModelLine('llm', sp.llmModel) },
                      { label: '씬 이미지', value: formatAiModelLine('image', sp.imageModel) },
                    ]
                  : undefined}
              />
            {/each}
          </div>
        </section>
      {/if}
    </div>

    {@render liveDetailView()}
  {/if}
</div>
{/if}

<!--
  라이브 배치 인라인 상세: 생성 중 기획안의 씬/이미지. 뒤로가기로 그리드 복귀
  라이브 구역과 함께 다닌다(그 구역의 타일을 눌러 열기 때문). 기획안 구역이 없는 버전에서는
  영상 구역 아래에 뜬다.
-->
{#snippet liveDetailView()}
  {#if liveDetail}
    {@const d = liveDetail}
    <div class="flex flex-col gap-3">
      <button
        type="button"
        onclick={closeDetail}
        class="inline-flex w-fit items-center gap-1 text-sm text-fg-subtle transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
        워크스페이스
      </button>
      <PlanProposalCard
        proposal={d.proposal}
        {version}
        order={1}
        alwaysOpen
        imageFor={d.imageFor}
        onRetry={d.onRetry}
        onSaveBrief={d.onEditPrompt}
        onPickImage={d.onPickImage}
        promptEditFor={d.promptEditFor}
      />
    </div>
  {/if}
{/snippet}

<!-- 영상 구역: 기획안에서 AI 합성한 영상들(렌더 중, 완성, 실패). 세트를 적용하면 최종 영상
     탭이 있는 버전에서는 다른 탭일 때 숨김(상태 보존)
     기획안 구역이 없는 버전에서는 여기가 라이브 구역이지만 만드는 중인 것은 그려지지 않음
     (완성된 영상만 담는다). 라이브 배치는 자동 저장을 굴리려고 마운트만 됨 -->
<div class:hidden={hasStageTabs && planTab !== 'source'}>
  {#if liveStage === 'source'}
    <div class:mb-5={inProgressCount > 0} class:hidden={liveDetail !== null}>
      {@render generatingBatches()}
    </div>
    {@render liveDetailView()}
  {/if}
  <!-- 세트 적용 피커(UI만): 영상을 선택하면 나타난다(보기 모드). 배경프레임 썸네일을 가로로 리스트업(많아지면 가로 스크롤). 고른 뒤 하단 ‘세트 적용’
       최종 구역이 있는 버전에만 있다. 세트를 입히는 것이 곧 최종본을 만드는 일이라, 그 구역이
       없는 버전에서는 만들어도 담길 데가 없다(그 버전엔 세트를 만드는 에셋 화면도 없다) -->
  {#if showsStage('final') && stage === 'source' && manageMode === 'view' && selectedIds.length > 0}
    <div class="mb-3 rounded-lg border border-line bg-elevated px-3 py-2">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium text-fg">적용할 세트</span>
        <span class="rounded-full bg-accent-bg px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">배경프레임 + 아웃트로</span>
        <span class="text-xs text-fg-subtle">세트를 고르고 아래 ‘세트 적용’을 누르세요.</span>
      </div>
      {#if assetSets.length === 0}
        <p class="py-2 text-xs text-fg-subtle">등록된 세트가 없습니다. ‘에셋’ 화면에서 세트를 먼저 만드세요.</p>
      {:else}
        <!-- 가로 스크롤 배경프레임 리스트: 세트가 많아지면 가로로 스크롤(overflow-x-auto) -->
        <div class="flex gap-2 overflow-x-auto pb-1">
          {#each assetSets as set (set.id)}
            <button
              type="button"
              onclick={() => (selectedSet = String(set.id))}
              aria-pressed={selectedSet === String(set.id)}
              class="w-24 shrink-0 overflow-hidden rounded-md border-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/30 {selectedSet ===
              String(set.id)
                ? 'border-fg'
                : 'border-line hover:border-fg/40'}"
            >
              <!-- 프레임 그림은 자기 모양 그대로 보여준다. 상자 비율을 정해 잘라내면 고른 것이
                   실제로 어떤 테두리인지 안 보이고, 최종 영상의 캔버스도 영상이 아니라 이 프레임의
                   모양을 따르므로 여기서 영상 비율을 쓰는 것은 틀린 미리보기다. -->
              <div class="w-full bg-surface">
                {#if set.frameUrl}
                  <img src={set.frameUrl} alt={set.name} class="block h-auto w-full" />
                {:else}
                  <div class="flex h-32 w-full items-center justify-center text-[10px] text-fg-subtle">
                    프레임 없음
                  </div>
                {/if}
              </div>
              <span class="block truncate px-1.5 py-1 text-[11px] text-fg">{set.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  <!-- 라이브 상세를 열면 그리드를 감춘다(언마운트하지 않는다: 생성 상태 보존). 기획안 구역이 있는
       버전에서는 그쪽이 이미 같은 일을 하므로 여기서는 라이브 구역일 때만 적용 -->
  <div class:hidden={liveStage === 'source' && liveDetail !== null}>
    {#if videoProjects.length === 0 && !videoQuery.isPending}
      <!-- 빈 안내는 그 버전에 실제로 있는 길을 가리킨다. 기획안 구역이 없는 버전에서 "기획안에서
           만들면" 이라고 적으면 화면에 없는 단계를 찾게 만듦 -->
      <div class={emptyBoxClass}>
        {#if hasStageTabs}
          <svg class="h-10 w-10 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="5" width="15" height="14" rx="2" />
            <path d="m17 9 5-3v12l-5-3" />
          </svg>
        {/if}
        <p class="text-sm">아직 만든 영상이 없습니다.</p>
        <p class="text-xs">
          {#if showsStage('plan')}
            위 ‘{labels.plan}’ 에서 골라 영상을 만들면 여기에 나타납니다.
          {:else}
            ‘{profile.createLabel}’ 으로 만들면 여기에 나타납니다.
          {/if}
        </p>
      </div>
    {:else}
      <!-- 썸네일 따로 보기는 그 그림이 사람이 만든 썸네일인 버전에만 준다. 결과 확인 화면이
           있는 버전(hasGenerationProgress)이 그 그림을 만드는 유일한 자리이고, 그 버전은 씬
           이미지를 만들지 않아 카드의 그림이 곧 그 썸네일이다. 다른 버전에서 카드의 그림은 첫 씬
           이미지라 '썸네일' 이라는 이름이 사실과 다름 -->
      <VideoProjectGrid
        projects={videoProjects}
        selectable
        allowRenderingSelect={manageMode === 'delete'}
        {selectedIds}
        onToggleSelect={(id) => toggleSelect(id)}
        onRerender={(id) => rerenderVideoMutation.mutate(id)}
        thumbnailPreview={profile.hasGenerationProgress}
      />
    {/if}
  </div>
</div>

<!-- 최종 영상 구역: 원천 영상에 세트(프레임+아웃트로)를 입힌 배포본(원천 1:N 최종). 다른 탭일 땐 숨김(상태 보존)
     보기 모드에서도 선택할 수 있다(하단 바 = 보관함 보내기). 단 완성본만: 렌더 중 항목은
     보관해도 폴링이 끊겨 상태가 멈추므로 allowRenderingSelect 를 삭제 모드로 한정한다(서버도 400 으로 막는다)
     개별 다시 만들기는 카드 버튼
     이 구역이 없는 버전이 있다(versionProfile.workspaceStages). 누른 한 번이 최종 영상까지 만드는
     구성에서는 원천과 최종을 가를 것이 없고, 세트를 만들 에셋 화면도 없어 여기 담길 것이 없음 -->
{#if showsStage('final')}
<div class:hidden={hasStageTabs && planTab !== 'final'}>
  {#if videoFinals.length === 0 && !finalQuery.isPending}
    <div class={emptyBoxClass}>
      {#if hasStageTabs}
        <svg class="h-10 w-10 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <path d="m10 13 4 2.5-4 2.5z" />
        </svg>
      {/if}
      <p class="text-sm">아직 최종 영상이 없습니다.</p>
      <p class="text-xs">
        {hasStageTabs ? `‘${labels.source}’ 탭에서` : `위 ‘${labels.source}’ 에서`} 세트(프레임+아웃트로)를
        적용하면 최종본이 여기에 만들어집니다.
      </p>
    </div>
  {:else}
    <VideoProjectGrid
      projects={videoFinals}
      selectable={true}
      allowRenderingSelect={manageMode === 'delete'}
      {selectedIds}
      onToggleSelect={(id) => toggleSelect(id)}
      onRerender={(id) => rerenderFinalMutation.mutate(id)}
    />
  {/if}
</div>
{/if}

<!-- 다중 선택 확정 바: 선택 1개 이상일 때 화면 하단 중앙. 동작은 barAction 표가 정한다. 상세 볼 땐 숨김 -->
{#if liveDetail === null && totalSelected > 0}
  <!-- 화질 선택은 '영상 만들기'에만 의미가 있다(삭제/세트 적용/보관은 렌더가 아니다) -->
  {#snippet resolutionControl()}
    <ResolutionSelect
      {videoModelKey}
      value={resolution}
      onChange={(r) => (pickedResolution = r)}
    />
  {/snippet}
  <!-- 보관 보조 자리: 다운로드(보관함 화면과 같은 위치) + 보관이 잠긴 사유
       두 버전이 같은 자리 사용. 보관 대상 구역만 다르고 하는 일은 동일
       사유를 안 적으면 미완성이 섞였을 때 가운데 버튼이 왜 안 눌리는지 알 수 없음 -->
  {#snippet downloadControl()}
    <div class="flex flex-col items-center gap-1">
      {#if archiveBlocked}
        <span class="rounded-full bg-elevated px-2.5 py-1 text-[11px] text-fg-subtle shadow">
          완성되지 않은 영상이 포함되어 보관할 수 없습니다. 다운로드는 가능합니다.
        </span>
      {/if}
      <DownloadSelectedButton
        items={downloadItems}
        state={download}
        onDownload={() => void download.run(downloadItems)}
      />
    </div>
  {/snippet}
  {@const aboveControl =
    barAction.above === 'resolution'
      ? resolutionControl
      : barAction.above === 'download'
        ? downloadControl
        : undefined}
  <SelectionActionBar
    count={totalSelected}
    above={aboveControl}
    confirmLabel={barAction.label}
    variant={barAction.variant}
    pending={barAction.pending}
    onConfirm={barAction.run}
    onCancel={() => setMode('view')}
  />
{/if}

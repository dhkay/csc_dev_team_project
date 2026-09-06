<script lang="ts">
  // 기획서 생성 배치(워크스페이스): 한 번의 '기획서 생성'이 만든 기획안 N개를 타일 그리드로 표시
  //  - 진입 시 요청(req)으로 텍스트 기획안 N개를 만들고 각 씬 이미지를 자동 생성
  //  - 타일 = 기획안 1개(첫 씬 썸네일 + 제목 + 생성상태). 씬 이미지가 모두 정리되면 클릭해 상세를 연다.
  //  - 배치별 독립 생성(batchId = 생성 쿼리 키). 페이지가 이 컴포넌트를 누적 렌더한다(여러 번 생성 = 배치 누적)
  //
  // 비싼 생성물은 전부 컴포넌트 밖에 있다. 기획안 텍스트는 TanStack 캐시(plans.query), 씬 이미지는
  // planSceneImagesStore. 그래서 이 컴포넌트는 언제 언마운트돼도 재생성을 유발하지 않음
  import { untrack } from 'svelte';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { cancelGeneratingBatch } from '$lib/features/marketing-channels/lib/cancelGeneratingBatch';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import type {
    PlanGenerationRequest,
    PlanProposal,
    PlanScene,
    SceneImageState,
  } from '$lib/features/marketing-channels/types';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import {
    planSceneImagesStore,
    type SceneImageJob,
  } from '$lib/shared/lib/stores/planSceneImagesStore/planSceneImagesStore.svelte';
  import { resolveMime, validateImageFile } from '$lib/shared/lib/image/imageFile';
  import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
  import Spinner from '$lib/shared/ui/Spinner.svelte';
  import { cancelPlanBatch } from '$lib/features/marketing-channels/lib/planCancellation';
  import SelectToggle from '../shared/SelectToggle.svelte';
  import {
    failureTitleSuffix,
    isModelSetupError,
  } from '$lib/features/marketing-channels/lib/modelSetupError';
  import { renderInfographicImage } from '../infographicImage';
  import { versionProfile } from '../versionProfile';
  import { usesSceneImages } from '../aiModelOptions';
  import { versionAspectCss } from '../marketingAspect';
  import PlanTile from './PlanTile.svelte';

  interface Props {
    channelId?: number | null;
    // 이 배치를 만든 도구 버전(주소의 축). 프롬프트 조립과 모델 슬롯이 이 값으로 갈림
    version: VersionMode;
    // 이 배치의 생성 요청(위저드 선택): 브랜드/개수/인포그래픽 배제
    req: PlanGenerationRequest;
    // 배치 식별자: 생성 쿼리 키(고유)
    batchId: number;
    // 기획안 타일 클릭: 상세를 연다. 씬 이미지 라이브 접근자(생성 중이면 상세에서 채워진다) +
    // 씬 이미지 편집 콜백(다시 생성, 외부 이미지)을 함께 전달
    //
    // 이미지 관련 항목은 선택이다. 씬 이미지를 쓰지 않는 버전에서는 넘기지 않으며, 그러면
    // 카드가 이미지 자리를 아예 그리지 않는다(넘기고 undefined 를 주면 스피너가 남는다)
    onOpen?: (view: {
      proposal: PlanProposal;
      imageFor?: (sceneIndex: number) => SceneImageState | undefined;
      onRetry?: (scene: PlanScene, imagePrompt?: string) => void;
      onPickImage?: (scene: PlanScene, file: File) => void;
      // 씬의 편집된 브리프 조회(없으면 원본 사용)
      promptEditFor?: (sceneIndex: number) => string | undefined;
      // 씬 브리프 편집: 재생성과 자동저장이 이 값을 사용
      onEditPrompt?: (scene: PlanScene, imagePrompt: string) => void;
      // 기획안 삭제(라이브 배치에서 제거)
      onDelete: () => void;
    }) => void;
    // 기획안이 완성(모든 씬 이미지 정리)되면 1회 발화. 자동 저장은 페이지 담당
    //
    // `llmModel` 을 함께 넘기는 이유: 이 배치를 실제로 쓴 모델을 아는 것은 생성 응답을 들고 있는
    // 이 컴포넌트뿐이다. 페이지가 저장 시점에 설정을 다시 읽으면, 생성 후 설정을 바꾼 경우
    // 쓰지 않은 모델이 원장에 남기 때문
    onProposalComplete?: (
      proposal: PlanProposal,
      images: Record<number, SceneImageState>,
      llmModel: string,
    ) => void;
    // 자동 저장 완료된 기획안 id 집합(반응). 저장 완료 타일은 배치에서 숨기고 저장본 그리드로 이관
    savedIds?: Set<string>;
    // 삭제 모드: 생성 중 기획안 타일에 선택 체크박스. 페이지가 선택분을 하단 바에서 일괄 삭제(release)
    selectMode?: boolean;
    // 선택된 생성 중 기획안 id 집합(반응)
    selectedProposalIds?: Set<string>;
    // 선택 토글: 페이지가 (batchId, proposal) 로 선택분을 모은다.
    onToggleProposal?: (proposal: PlanProposal) => void;
    // 이 배치의 '만드는 중' 실제 개수 보고. 페이지가 배치별 합으로 헤더와 섹션을 계산
    onLiveCount?: (count: number) => void;
    // 텍스트 생성 중 이 배치가 선택됐는가(삭제 모드). 배치는 쪼갤 수 없다: 아직 기획안이 도착하지
    // 않아 개별로 고를 대상이 없으므로 선택 단위가 배치다.
    batchSelected?: boolean;
    // 텍스트 생성 중 배치 선택 토글. 페이지가 배치 id 집합으로 모아 하단 바에서 일괄 삭제(= 취소)
    onToggleBatch?: () => void;
  }
  let {
    channelId = null,
    version,
    req,
    batchId,
    onOpen,
    onProposalComplete,
    savedIds,
    selectMode = false,
    selectedProposalIds,
    onToggleProposal,
    onLiveCount,
    batchSelected = false,
    onToggleBatch,
  }: Props = $props();

  const plansQuery = createQuery(() =>
    svc.generatePlansQueryOptions(version, channelId, req, batchId),
  );
  const plans = $derived(plansQuery.data?.proposals ?? []);

  /**
   * 기획안 타일을 그리는가. 오케스트레이션과 표시는 다른 문제다.
   *
   * 기획안 구역이 없는 버전(v1.5)에서도 이 컴포넌트는 남아야 한다: 자동 저장을 굴리는 것이 여기고,
   * 저장이 없으면 영상이 만들어지지 않는다. 그런데 그리는 것까지 남기면 영상을 만들라고 누른
   * 사람의 워크스페이스에 기획안 타일이 뜨고, 눌러 기획안 상세가 열리고, 실패하면 "기획서를 생성하지
   * 못했습니다" 라고 말한다. 그 버전에서 기획안은 도중에 저장되는 중간 산출물이지 사람이 보고 고를
   * 물건이 아니기 때문
   *
   * 판정 근거는 페이지와 같은 표다(versionProfile.workspaceStages). 조건을 여기서 다시 세면 한쪽만
   * 따라감
   */
  const showsPlanTiles = $derived(versionProfile(version).workspaceStages.includes('plan'));

  // 생성 실패 통보: 기획서는 동기 생성이라 실패하면 아무것도 저장되지 않는다(작업이 그 자체로 취소)
  //   전역 알림이 사유를 전한다(타일은 좁아 사유를 못 담는다). 서버 문구(엔진 혼잡, 상한 초과, 모델
  //   없음 등)를 그대로 적재. 조치가 이미 그 문구에 있음
  //   배치 id 를 알림 키로 써서 재시도로 여러 번 실패해도 알림이 쌓이지 않는다(스토어가 병합, 횟수 표기)
  //   같은 실패로 반복 호출되지 않게 에러 객체를 기억한다. 쿼리는 다른 이유로도 알림을 보내므로,
  //   가드가 없으면 한 번의 실패가 '3회' 로 세어지고 알림이 매번 다시 렌더됨
  //
  // 실패한 배치의 운명은 타일 유무로 갈린다.
  //   타일이 있는 버전: 아래 재시도 타일이 배치를 되살린다. 알림에 '다시 시도' 를 붙이되 설정/과금
  //     사유(키 미등록, 한도 초과)는 재시도해도 같은 실패라 그때만 버튼을 뺀다.
  //   타일이 없는 버전: 되살릴 자리가 없어 배치가 화면에 남을 이유가 없다. 취소와 같은 사가로 걷는다
  //     (요청 중단, 목록 제외, 캐시 제거). 걷히면 진행 화면이 폼으로 돌아가고 입력은 그대로 남는다.
  //     알림은 걷지 않는다. 배치가 사라져도 사유(상한 초과 등)는 읽혀야 한다.
  const queryClient = useQueryClient();
  let notifiedError: unknown = undefined;
  $effect(() => {
    if (!plansQuery.isError || plansQuery.error === notifiedError) return;
    notifiedError = plansQuery.error;
    const detail =
      plansQuery.error instanceof Error && plansQuery.error.message
        ? plansQuery.error.message
        : '기획서를 생성하지 못했습니다. 잠시 후 다시 시도하세요.';
    const retryable = showsPlanTiles && !isModelSetupError(plansQuery.error);
    // 제목이 조치의 방향을 먼저 말한다(결제 확인 / 기다리기). 코드를 모르는 실패는 사유 없이 취소만
    const title = `${versionProfile(version).createLabel} 취소${failureTitleSuffix(plansQuery.error)}`;
    const id = toastStore.error(title, detail, {
      key: `plan-batch-failed:${batchId}`,
      ...(retryable ? { action: { label: '다시 시도', run: () => void plansQuery.refetch() } } : {}),
    });
    if (!showsPlanTiles) {
      void cancelGeneratingBatch(queryClient, version, batchId);
      return;
    }
    // 배치가 화면에서 사라지면 이 알림의 '다시 시도' 는 의미가 없다(그 쿼리를 소비할 화면이 없다)
    //   실패 알림은 자동 소멸하지 않으므로 여기서 걷지 않으면 죽은 재시도 버튼이 탭 수명 동안 남음
    return () => toastStore.dismiss(id);
  });

  // 기획안이 그리드에서 사라지는 조건: 저장 완료(savedIds, 페이지 소유) 또는 사용자 삭제(스토어 소유)
  //   저장되면 같은 그리드의 저장본 타일이 그 자리를 대신한다(중복 방지)
  const isGone = (id: string): boolean =>
    (savedIds?.has(id) ?? false) || planSceneImagesStore.isRemoved(batchId, id);

  // '만드는 중' 실제 개수: 텍스트 생성중이면 요청 개수, 도착 후엔 미저장, 미삭제 타일 수, 실패면 1(재시도 타일)
  //   저장이나 삭제로 타일이 줄면 즉시 감소(savedIds, removed 반응). 페이지가 배치별로 합산해 헤더에 사용
  //
  // 기획안 구역이 없는 버전은 늘 1이다. 그 버전이 그리는 것은 만들어지는 영상 한 칸이고, 이 값이
  //   헤더의 개수이자 섹션 표시 여부라 타일 수와 어긋나면 "만드는 중 3" 아래 칸이 하나만 남음
  //   저장이 끝나 영상 프로젝트가 생기면 그 카드가 자리를 대신하므로 여기서는 0
  // 그리지 않는 버전은 늘 0이다. 이 값이 페이지의 '만드는 중' 헤더와 섹션 표시를 정하므로,
  //   그리지 않으면서 수를 보고하면 아무 칸도 없는 "만드는 중 3" 이 남음
  const liveCount = $derived(
    !showsPlanTiles
      ? 0
      : plansQuery.isSuccess
        ? plans.filter((p) => !isGone(p.id)).length
        : plansQuery.isError
          ? 1
          : req.proposalCount,
  );
  $effect(() => {
    onLiveCount?.(liveCount);
  });

  // 씬 이미지 오케스트레이션
  // 상태와 동시성, 재시도는 planSceneImagesStore(모듈 싱글톤, batchId 로 격리) 소유
  // 이 컴포넌트는 "어떻게 만들지"(produce)만 정의하고 "언제 얼마나" 는 스토어가 결정
  // 상태가 컴포넌트 밖에 있어 배치가 언마운트되거나 재마운트돼도 이미지가 다시 생성되지 않음
  //
  // 씬 이미지를 쓰지 않는 버전(v1.5)에서는 이 오케스트레이션이 아예 돌지 않는다. 영상 모델이
  //   텍스트에서 씬 영상을 바로 만들어 이미지가 필요 없다. 그대로 두면 씬마다 호출이 나가 전부
  //   400 으로 돌아오고 그 실패를 설정 오류로 읽어 배치가 취소됨
  const usesImages = $derived(usesSceneImages(version));


  /**
   * 씬 하나를 실제로 만든다. 인포그래픽은 로컬 캔버스 렌더, 나머지는 이미지 엔진 호출
   * `batch` = 이 씬이 속한 기획안 묶음(취소 시 함께 되돌릴 대상). 라이브 파생값이 아니라 그 실행의
   * 데이터를 붙잡아 둔다. '다시 생성' 으로 교체된 뒤 뒤늦게 실패한 호출이 새 배치를 지우지 않게
   */
  function produceScene(
    batch: PlanProposal[],
    p: PlanProposal,
    scene: PlanScene,
  ): (signal: AbortSignal, variant: number) => Promise<SceneImageState> {
    return async (signal, variant) => {
      // 인포그래픽 씬: FLUX 사진 대신 데이터(제목+항목)로 즉시 렌더(네트워크/GPU 없음, 결정적)
      if (scene.infographic) {
        const dataUrl = renderInfographicImage(scene.infographic, version);
        return dataUrl
          ? { status: 'done', dataUrl }
          : { status: 'error', error: '인포그래픽 렌더 실패' };
      }
      const res = await svc.generateSceneImage(
        version,
        channelId as number,
        {
          brandName: req.brandName,
          // 영어 시각 브리프만 보낸다. 한국어 연출/자막/나레이션은 이미지 모델이 못 읽고,
          // 그 의미는 기획 LLM 이 이 브리프에 접어넣음. 작업자가 상세에서 고쳤으면 그 값 사용
          // 이 경로는 씬 이미지를 만드는 버전에서만 돈다(위 usesImages 게이트). 그 버전의 파서가
          //   이 값을 늘 채우므로 빈 값은 도달하지 않음. 만들지 않는 버전의 씬에는 키가 아예 없음
          imagePrompt:
            planSceneImagesStore.promptEdit(batchId, p.id, scene.index) ?? scene.imagePrompt ?? '',
          proposalTitle: p.title,
          variant,
        },
        signal,
      );
      if (res.success) {
        // prompt = 백엔드가 실제로 모델에 보낸 최종 조립 결과: 상세의 '프롬프트 보기'가 그대로 띄운다.
        return { status: 'done', dataUrl: res.data.dataUrl, prompt: res.data.prompt };
      }
      // 설정과 과금 사유는 이 씬만의 문제가 아님. 남은 씬도 전부 같은 이유로 실패
      //   반쪽 기획안을 남기지 않고 배치를 되돌린 뒤(진행 중 생성 중단 + 타일 제거) 사유를 한 번 통보
      //   저장은 애초에 막혀 있지만(모든 씬 성공이 조건) 화면에서도 걷어야 헛된 재시도가 없음
      if (isModelSetupError(res)) cancelPlanBatch(batchId, batch, res.error);
      return { status: 'error', error: res.error ?? '이미지 생성 실패' };
    };
  }
  const jobsFor = (data: PlanProposal[]): SceneImageJob[] =>
    data.flatMap((p) =>
      p.scenes.map((scene) => ({ proposalId: p.id, scene, produce: produceScene(data, p, scene) })),
    );

  // 텍스트 기획안이 도착하면 씬 이미지 생성 가동
  //   스토어가 '이미 시작함' 래치를 들고 있어 재마운트는 무해하고, 데이터가 바뀌면('다시 생성') restart.
  //   deps = plansQuery.data. 내부 쓰기는 untrack: 자기 갱신 루프 방지
  let startedData: PlanProposal[] | null = null;
  $effect(() => {
    const data = plansQuery.data?.proposals;
    if (!data || data.length === 0 || channelId == null || !req.brandName) return;
    if (!usesImages) return; // 이 버전은 씬 이미지를 만들지 않는다
    untrack(() => {
      if (startedData === data) return; // 같은 결과로 재실행되면 무시
      const isRegenerate = startedData !== null; // '다시 생성': 이전 결과를 버리고 새로 돌린다
      startedData = data;
      if (isRegenerate) planSceneImagesStore.restart(batchId, jobsFor(data));
      else planSceneImagesStore.start(batchId, jobsFor(data));
    });
  });

  // 기획안이 완성(모든 씬 이미지 '성공')되면 자동 저장 콜백을 기획안당 한 번 발화
  //   실패(error)가 남아 있으면 저장하지 않는다. 재시도로 전부 성공해야 저장(부분 이미지 저장 방지)
  //   중복 발화 차단(markReported)도 스토어가 들고 있어 재마운트가 재저장을 만들지 않음
  $effect(() => {
    const data = plansQuery.data;
    if (!data) return;
    for (const p of data.proposals) {
      if (planSceneImagesStore.isRemoved(batchId, p.id) || !allDone(p)) continue;
      const snap: Record<number, SceneImageState> = {};
      for (const s of p.scenes) {
        const st = sceneImg(p, s.index);
        if (st) snap[s.index] = st;
      }
      if (planSceneImagesStore.markReported(batchId, p.id)) {
        onProposalComplete?.(p, snap, data.llmModel);
      }
    }
  });

  // 기획안별 파생 상태
  const sceneImg = (p: PlanProposal, idx: number): SceneImageState | undefined =>
    planSceneImagesStore.image(batchId, p.id, idx);
  const doneCount = (p: PlanProposal): number =>
    p.scenes.filter((s) => sceneImg(p, s.index)?.status === 'done').length;
  // 모든 씬 이미지가 정리(성공/실패)되면 타일을 클릭할 수 있다(상세 열기 + 실패 씬 재시도)
  //   이미지를 쓰지 않는 버전은 기다릴 것이 없어 문안이 도착한 순간 정리된 상태다. 그러지 않으면
  //   오지 않을 이미지를 기다리며 타일이 영원히 잠기고 자동 저장도 발화하지 않음
  const resolved = (p: PlanProposal): boolean =>
    !usesImages ||
    (p.scenes.length > 0 && p.scenes.every((s) => sceneImg(p, s.index)?.status !== 'loading'));
  const hasError = (p: PlanProposal): boolean =>
    usesImages && p.scenes.some((s) => sceneImg(p, s.index)?.status === 'error');
  // 모든 씬 이미지가 '성공': 자동 저장 조건(실패가 남아 있으면 저장 보류)
  //   상태가 loading/done/error 셋뿐이라 '정리됐고 실패가 없다'와 같다(별도 순회 불필요)
  const allDone = (p: PlanProposal): boolean => resolved(p) && !hasError(p);
  function thumb(p: PlanProposal): string | null {
    for (const s of p.scenes) {
      const st = sceneImg(p, s.index);
      if (st?.status === 'done' && st.dataUrl) return st.dataUrl;
    }
    return null;
  }

  // 진행 안내는 이 배치 소유가 아님. 페이지가 워크스페이스 상단(토글 우측)에 한 줄로 모아 표시
  //   텍스트 생성은 쿼리 캐시(useIsFetching), 씬 이미지는 planSceneImagesStore.progress 를 페이지가 직접 조회
  //   여기가 소유하는 것은 생성 실패(에러) 표시뿐이고 씬별 진행도는 각 타일 담당

  /** File → data URL. 실효 MIME 으로 감싸 읽는다. .svg 처럼 file.type 이 비면 data URL 에 MIME 이 빠져
   *  저장 업로드가 엉뚱한 타입으로 올라간다(imageFile.resolveMime 과 같은 보정) */
  function fileToDataUrl(file: File): Promise<string> {
    const mime = resolveMime(file);
    const blob = file.type === mime ? file : new Blob([file], { type: mime });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 외부 이미지 가져오기: 검증 → data URL → 생성 결과와 같은 자리에 배치
   * 그래서 이후 자동 저장이 생성물과 구분 없이 그대로 올린다(별도 저장 경로가 없다)
   * 거부된 씬을 이걸로 채우면 기획안이 완성되어 저장까지 이어진다.
   */
  async function applyExternalImage(p: PlanProposal, scene: PlanScene, file: File): Promise<void> {
    const setState = (s: SceneImageState) =>
      planSceneImagesStore.setImage(batchId, p.id, scene.index, s);
    const invalid = validateImageFile(file);
    if (invalid) return setState({ status: 'error', error: invalid });
    setState({ status: 'loading' });
    try {
      setState({ status: 'done', dataUrl: await fileToDataUrl(file) });
    } catch {
      setState({ status: 'error', error: '이미지를 읽지 못했습니다.' });
    }
  }

  // 텍스트 기획안이 준비되면(타일이 보이면) 이미지 생성 중에도 상세 열기 가능
  //   스냅샷이 아니라 라이브 접근자를 넘겨, 상세에서 씬 이미지가 로딩→완료로 채워진다.
  //
  // 씬 이미지를 쓰지 않는 버전에서는 이미지 관련 콜백을 아예 넘기지 않는다. 접근자를 넘기고
  //   undefined 를 돌려주면 카드가 그 자리를 '생성 중'(스피너)으로 그려, 오지 않을 이미지를
  //   영원히 기다리는 화면이 됨
  function openProposal(p: PlanProposal): void {
    onOpen?.({
      proposal: p,
      ...(usesImages
        ? {
            imageFor: (idx: number) => sceneImg(p, idx),
            // 재생성: 편집 브리프를 주면 스토어에 얹고(produceScene 가 그 값을 읽는다) 재실행
            onRetry: (scene: PlanScene, imagePrompt?: string) => {
              if (imagePrompt !== undefined)
                planSceneImagesStore.setPromptEdit(batchId, p.id, scene.index, imagePrompt);
              planSceneImagesStore.retry(batchId, {
                proposalId: p.id,
                scene,
                // 사용자가 지금 보고 있는 배치 = 현재 목록(취소 시 이 묶음을 되돌린다)
                produce: produceScene(plans, p, scene),
              });
            },
            onPickImage: (scene: PlanScene, file: File) =>
              void applyExternalImage(p, scene, file),
            // 브리프 조회/편집: 편집값은 스토어에 얹혀 재생성/자동저장이 함께 쓴다(원본 텍스트는 캐시에 불변)
            //   씬 브리프는 이미지 생성 입력이라 이미지를 쓰지 않는 버전에는 편집할 대상이 없음
            promptEditFor: (idx: number) => planSceneImagesStore.promptEdit(batchId, p.id, idx),
            onEditPrompt: (scene: PlanScene, imagePrompt: string) =>
              planSceneImagesStore.setPromptEdit(batchId, p.id, scene.index, imagePrompt),
          }
        : {}),
      onDelete: () => planSceneImagesStore.remove(batchId, p),
    });
  }
</script>

<!-- 씬 이미지 자리의 플레이스홀더. 카드가 snippet 으로 받으므로 공용 스피너를 감싸 넘긴다. -->
{#snippet spinner()}
  <Spinner class="h-5 w-5 text-fg-subtle" />
{/snippet}

<!-- 텍스트 기획안 작성 중 플레이스홀더: 한 칸을 차지하며 '텍스트가 써지는' 타이핑 모션(라인 + 캐럿) -->
{#snippet typingTile()}
  <div class="flex flex-col gap-1.5" aria-hidden="true">
    <div
      style="aspect-ratio: {versionAspectCss(version)}"
      class="relative w-full overflow-hidden rounded-lg border border-line bg-surface text-fg"
    >
      <div class="absolute inset-0 flex flex-col justify-center gap-2.5 p-4">
        <span class="tw-line" style="--tw-target: 88%; --tw-delay: 0s"></span>
        <span class="tw-line" style="--tw-target: 72%; --tw-delay: 0.45s"></span>
        <span class="tw-row">
          <span class="tw-line" style="--tw-target: 54%; --tw-delay: 0.9s"></span>
          <span class="tw-caret"></span>
        </span>
      </div>
    </div>
    <span class="h-3 w-2/3 rounded bg-fg/10"></span>
  </div>
{/snippet}

<!-- 자기 그리드를 만들지 않음. `contents` 로 타일을 페이지의 단일 그리드에 그대로 노출
     그래야 생성 중인 것과 저장본이 한 그리드에서 최근순으로 섞여 보인다(배치 = 화면 단위가 아니라 생성 단위) -->
<div class="contents">
  {#if !showsPlanTiles}
    <!-- 이 버전은 완성 전까지 워크스페이스에 아무것도 그리지 않는다. 그래도 이 컴포넌트는
         마운트되어야 한다: 자동 저장을 굴리는 것이 여기고(onProposalComplete), 저장이 없으면 영상이
         만들어지지 않는다. 그래서 '돌지만 그리지 않는' 상태가 이 버전의 정상
         만들어지는 동안 무엇이 일어나는지는 생성 진행 화면 담당 -->
  {:else if plansQuery.isError}
    <!-- 텍스트 생성 실패: 타일 한 칸으로. 이 배치를 되살릴 유일한 수단이라 재시도도 여기 -->
    <div
      style="aspect-ratio: {versionAspectCss(version)}"
      class="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 text-center"
      role="alert"
    >
      <span class="text-xs text-danger-fg">기획서를 생성하지 못했습니다.</span>
      <button
        type="button"
        onclick={() => plansQuery.refetch()}
        disabled={plansQuery.isFetching}
        class="rounded-md border border-line px-2 py-0.5 text-xs text-fg transition hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        다시 시도
      </button>
    </div>
  {:else if plansQuery.isSuccess}
    {#each plans as p (p.id)}
      {#if !isGone(p.id)}
        {@const ok = resolved(p)}
        {@const failed = hasError(p)}
        <!-- 배지: 생성 중이면 진행수, 정리됐는데 실패가 있으면 경고. 둘 다 아니면 배지 없음(오버레이 미전달) -->
        {#snippet badge()}
          {#if !ok}
            <span class="tabular-nums">생성 중 {doneCount(p)}/{p.scenes.length}</span>
          {:else}
            일부 이미지 실패
          {/if}
        {/snippet}
        <!-- 라이브 타일은 생성 중이라 '영상 만들기'(업로드) 버튼을 두지 않는다. 완성되면 저장본 타일로 넘어가 거기서 뜬다.
             단건 삭제는 상세(제목 우측 onDelete), 일괄 삭제는 삭제 모드의 선택 체크박스 + 하단 바(페이지 소유) -->
        <PlanTile
          {version}
          src={thumb(p)}
          title={p.title}
          onOpen={() => openProposal(p)}
          placeholder={ok ? undefined : spinner}
          overlay={!ok || failed ? badge : undefined}
          selectable={selectMode}
          {selectMode}
          selected={selectedProposalIds?.has(p.id) ?? false}
          onToggleSelect={() => onToggleProposal?.(p)}
        />
      {/if}
    {/each}
  {:else}
    <!-- 텍스트 기획안 작성 중. 요청 개수만큼 타이핑 플레이스홀더로 칸을 채운다(도착하면 실제 타일로 교체) -->
    {#each Array.from({ length: req.proposalCount }) as _, i (i)}
      {#if selectMode}
        <!-- 삭제 모드에선 이 타일도 고를 수 있다. 삭제가 취소를 겸하기 때문이다(별도 취소 버튼을 두지
             않는다). 어느 칸을 눌러도 배치 전체가 선택된다: 텍스트 생성은 한 번의 호출이라
             절반만 취소할 수 없다. 타일 내용은 보기 모드와 같은 스니펫을 그대로 쓴다(화면 무변경) -->
        <div class="relative">
          <button
            type="button"
            onclick={() => onToggleBatch?.()}
            aria-pressed={batchSelected}
            aria-label="생성 중인 기획서 선택"
            class="block w-full cursor-pointer text-left focus:outline-none"
          >
            <div class="rounded-lg transition {batchSelected ? 'ring-2 ring-fg' : ''}">
              {@render typingTile()}
            </div>
          </button>
          <SelectToggle
            checked={batchSelected}
            onToggle={() => onToggleBatch?.()}
            label="생성 중인 기획서 선택"
          />
        </div>
      {:else}
        {@render typingTile()}
      {/if}
    {/each}
  {/if}
</div>

<style>
  /* 타이핑 라인: 폭이 0→목표로 계단식(steps)으로 늘어 '글자가 찍히는' 느낌. 지연을 줘 줄 단위로 이어 써진다. */
  .tw-line {
    display: block;
    align-self: flex-start;
    height: 0.5rem;
    width: 0;
    border-radius: 9999px;
    background: currentColor;
    opacity: 0.16;
    animation: tw-type 3.4s var(--tw-delay, 0s) infinite steps(18, end);
  }
  .tw-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  /* 깜빡이는 커서: 마지막 줄 끝에서 타이핑 위치를 추적 */
  .tw-caret {
    flex: none;
    width: 2px;
    height: 0.85rem;
    background: currentColor;
    opacity: 0.55;
    animation: tw-blink 1.05s steps(1, end) infinite;
  }
  @keyframes tw-type {
    0% {
      width: 0;
    }
    26% {
      width: var(--tw-target, 70%);
    }
    90% {
      width: var(--tw-target, 70%);
    }
    100% {
      width: 0;
    }
  }
  @keyframes tw-blink {
    0%,
    49% {
      opacity: 0.55;
    }
    50%,
    100% {
      opacity: 0;
    }
  }
  /* 모션 최소화 선호 시: 애니메이션 없이 정적 스켈레톤으로 */
  @media (prefers-reduced-motion: reduce) {
    .tw-line {
      width: var(--tw-target, 70%);
      animation: none;
    }
    .tw-caret {
      animation: none;
      opacity: 0.35;
    }
  }
</style>

<script lang="ts">
  // 생성 모달의 컨셉입력 폼: 브랜드/컨셉 세트에서 톤을 골라 기획안을 받는다.
  //
  // 프롬프트 폼(PromptForm)과 나눠 둔 이유는 두 방식이 실제로 다른 일을 하기 때문이다. 이쪽은
  // 저장된 세트를 시작점으로 삼아 연출을 고르고, 그 선택이 기획안의 주제이자 씬 이미지를 다시
  // 만들 때의 기준이 된다. 그래서 브랜드 쿼리와 선택 유효성 유지, 버전 분기가 이 폼에만 있다.
  //
  // 두 폼이 함께 쓰는 것은 영상 설정 묶음(VideoSettingsSection)뿐이다. 목적 키워드와 키워드 검색
  // 화면은 위저드가 입력 방식 탭 위에서 그린다. 어느 방식으로 만들든 같은 결정이라 방식 안에 두면
  // 탭을 옮길 때마다 같은 값을 다시 고르는 것처럼 보인다.
  //
  // 채널 id 를 받지 않는다. 세트도 모델 설정도 사람에게 붙는 값이라 채널과 무관하다.
  import { createQuery } from '@tanstack/svelte-query';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import {
    CONSTRAINTS_PLACEHOLDER,
    DEFAULT_PROPOSAL_COUNT,
    DEFAULT_SCENE_COUNT,
    DEFAULT_SEGMENT_MODE,
    SCENE_BRIEF_PLACEHOLDER,
    resolvePlanComposeLimit,
    type SegmentMode,
  } from '../planComposeOptions';
  import PlanComposeSection from './PlanComposeSection.svelte';
  import BrandConceptSection from './BrandConceptSection.svelte';
  import BriefInputSection from './BriefInputSection.svelte';
  import VideoSettingsSection from './VideoSettingsSection.svelte';
  import type { BrandConceptSet, ConceptChoice } from '$lib/features/marketing-channels/types';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import { versionProfile } from '../versionProfile';

  interface Props {
    // 이 워크스페이스의 도구 버전(주소의 축): 폼 구성이 이 값으로 갈린다.
    version: VersionMode;
    // 선택된 브랜드/컨셉(brandName, bindable): 기획서 생성 기준. 없으면 첫 세트 자동 선택
    selectedBrand?: string | null;
    // 이번 생성에 쓸 축 조합(bindable): 세트 조합에서 출발해 작업자가 바꾼 최종값
    // 세트에 저장하지 않는다(이번 생성에만). 생성 요청과 저장본 스냅샷이 이 값을 쓴다.
    concepts?: ConceptChoice[];
    // 만들 기획서 개수(bindable): 생성 요청에 전달
    proposalCount?: number;
    // 기획서당 씬 개수(bindable): 생성 요청에 전달
    sceneCount?: number;
    // 인포그래픽 배제(bindable): 켜면 LLM 이 인포그래픽 씬을 만들지 않는다.
    excludeInfographic?: boolean;
    // 씬/사용자 입력사항(bindable): 무엇을 담을지 직접 적은 값
    sceneBrief?: string;
    // 제한사항(bindable): 무엇을 피할지 직접 적은 값
    constraints?: string;
    // 이번 생성에 쓸 영상 모델 key(bindable)
    videoModel?: string;
    // 세그먼트 연결 방식(bindable)
    segmentMode?: SegmentMode;
  }
  let {
    version,
    selectedBrand = $bindable(null),
    concepts = $bindable([]),
    proposalCount = $bindable(DEFAULT_PROPOSAL_COUNT),
    sceneCount = $bindable(DEFAULT_SCENE_COUNT),
    excludeInfographic = $bindable(false),
    sceneBrief = $bindable(''),
    constraints = $bindable(''),
    videoModel = $bindable(''),
    segmentMode = $bindable(DEFAULT_SEGMENT_MODE),
  }: Props = $props();

  /** 이 버전의 폼 구성. 어떤 칸이 있는지는 화면 구성이라 프로필이 갖는다. */
  const profile = $derived(versionProfile(version));

  // 내 AI 모델 선택(설정): 자체 모델이 끼면 기획서 개수를 묶는다(사내 GPU 공유 자원)
  //   판단 규칙과 근거는 planComposeOptions.resolvePlanComposeLimit 에 있다(여기선 적용만)
  const aiModelQuery = createQuery(() => svc.myAiModelQueryOptions(version));
  const composeLimit = $derived(resolvePlanComposeLimit(aiModelQuery.data, version));

  // 제한이 걸리면 선택값을 허용 범위 안으로 되돌린다(예: 5개 고른 뒤 설정에서 자체 모델로 바꾼 경우)
  //   고를 자리가 있는 버전에서만 본다. 없는 버전에서는 이 값을 읽는 화면도, 요청에 싣는 경로도
  //   없어(개수는 위저드가 파생시킨다) 아무도 읽지 않는 상태를 고쳐 쓰는 일이 된다.
  $effect(() => {
    if (!profile.hasPlanCompose) return;
    if (!composeLimit.proposalCounts.includes(proposalCount)) {
      proposalCount = composeLimit.proposalCounts[0];
    }
  });

  // 내 브랜드/컨셉 세트(설정에서 등록): 하나 선택해 기획서 생성 기준에 포함(brandName 으로 식별)
  //   채널 무관이다: 세트는 만드는 사람에게 붙으므로 채널을 옮겨도 같은 목록을 고른다.
  const brandConceptQuery = createQuery(() => svc.myBrandConceptQueryOptions(version));
  const brandConcepts = $derived(brandConceptQuery.data ?? []);
  // 축 이름과 표시 순서는 서버 카탈로그를 따른다(화면이 목록을 갖지 않는다)
  const conceptAxesQuery = createQuery(() => svc.brandConceptCatalogQueryOptions());
  const conceptAxes = $derived(conceptAxesQuery.data ?? []);

  /** 세트의 저장 조합 → 이번 생성의 시작 조합. 문구(label/note)는 떼어 낸다(서버가 카탈로그에서 채운다) */
  const toChoices = (set: BrandConceptSet): ConceptChoice[] =>
    set.concepts.map((c) => ({ axis: c.axis, option: c.option }));

  /**
   * 세트를 바꾸면 연출 조합도 그 세트의 것으로 되돌린다.
   *
   * 같은 세트를 다시 누르면 그대로 둔다: 바꿔 둔 조합이 클릭 한 번에 날아가면, 되돌릴 방법이 없다.
   * ('세트값으로' 는 있지만 그 반대가 없다)
   */
  function selectBrand(brandName: string): void {
    if (brandName === selectedBrand) return;
    selectedBrand = brandName;
    const set = brandConcepts.find((b) => b.brandName === brandName);
    concepts = set ? toChoices(set) : [];
  }

  // 세트 목록이 바뀌면 선택을 유효하게 유지한다(기본값 = 첫 세트, 사라진 이름이면 첫 세트로)
  //   조합도 함께 맞춘다: 선택이 옮겨졌는데 조합이 이전 세트의 것으로 남으면 화면과 요청이 어긋난다.
  $effect(() => {
    const names = brandConcepts.map((b) => b.brandName);
    if (brandConcepts.length > 0 && (selectedBrand === null || !names.includes(selectedBrand))) {
      selectedBrand = brandConcepts[0].brandName;
      concepts = toChoices(brandConcepts[0]);
    } else if (brandConcepts.length === 0 && selectedBrand !== null) {
      selectedBrand = null;
      concepts = [];
    }
  });
</script>

<div class="flex flex-col gap-6">
  <!--
    기획서 구성: 기획안 개수, 씬 개수, 인포그래픽 배제
    이 섹션이 없는 버전이 있다. v1.5 는 영상 한 편이 목적지라 개수를 고르지 않고, 몇 씬으로
      만들지는 아래 '씬 / 사용자 입력사항' 이 정한다. 두 곳에서 정하면 값이 어긋날 수 있다.
  -->
  {#if profile.hasPlanCompose}
    <PlanComposeSection
      limit={composeLimit}
      {proposalCount}
      {sceneCount}
      {excludeInfographic}
      onChange={(patch) => {
        if (patch.proposalCount !== undefined) proposalCount = patch.proposalCount;
        if (patch.sceneCount !== undefined) sceneCount = patch.sceneCount;
        if (patch.excludeInfographic !== undefined) excludeInfographic = patch.excludeInfographic;
      }}
    />
  {/if}

  <!--
    씬 / 사용자 입력사항: 무엇을 담을지 직접 적는 자리(선택). 카테고리 선택 바로 위에 둔다.
    톤(브랜드/컨셉)을 고르기 전에 무엇을 만들지부터 적는 순서라, 두 지시가 한 화면에서 이어진다.

    이 칸에는 톤을 적지 않는다. 그것은 아래 카테고리가 정하고, 여기 또 적으면 같은 것을 두
      자리에서 정하는 셈이 된다(두 값이 어긋나면 모델이 무엇을 따를지 알 수 없다). 그래서 이 폼의
      예시는 프롬프트 폼의 것과 다르다: 거기서는 적지 않으면 아무도 정해 주지 않는다.
  -->
  {#if profile.hasDirectBriefs}
    <BriefInputSection
      title="씬 / 사용자 입력사항"
      value={sceneBrief}
      onChange={(next) => (sceneBrief = next)}
      placeholder={SCENE_BRIEF_PLACEHOLDER}
    />
  {/if}

  <!-- 브랜드/컨셉(카테고리 선택): 이 폼에만 있다. 프롬프트 폼은 톤을 세트에서 고르지 않는다. -->
  <BrandConceptSection
    sets={brandConcepts}
    axes={conceptAxes}
    selected={selectedBrand}
    onSelect={selectBrand}
    {concepts}
    onChangeConcepts={(next) => (concepts = next)}
    isPending={brandConceptQuery.isPending}
    isError={brandConceptQuery.isError}
    onRetry={() => brandConceptQuery.refetch()}
  />

  <!--
    제한사항: 무엇을 피할지 적는 자리(선택). 카테고리 선택 아래에 둔다.
    무엇을 만들지와 어떤 톤으로를 정한 뒤에야 "다만 이건 하지 말 것" 이 말이 된다.
  -->
  {#if profile.hasDirectBriefs}
    <BriefInputSection
      title="제한사항 입력"
      value={constraints}
      onChange={(next) => (constraints = next)}
      placeholder={CONSTRAINTS_PLACEHOLDER}
    />
  {/if}

  <!--
    영상 설정(모델 → 세그먼트 → 나레이션): 프롬프트 폼과 함께 쓰는 유일한 묶음
    직접 적는 칸과 다른 플래그로 가린다. 지금은 같은 버전에서 함께 켜지지만, 무엇을 적을지와
      무엇으로 만들지는 다른 결정이다.
  -->
  {#if profile.hasVideoSettings}
    <VideoSettingsSection {version} bind:videoModel bind:segmentMode />
  {/if}
</div>

<script lang="ts">
  // 저장 기획안 상세: /{channelSlug}/plans/:id. 씬/이미지 + 씬 편집(재생성/외부 이미지/브리프)
  //   셸(nav/위저드)은 상위 레이아웃이 유지하므로, 여기로 와도 생성이 끊기지 않는다.
  //   딥링크/새로고침: 서버 로드분(data.initialPlan)으로 즉시 렌더하고, 클라 목록 쿼리가 로드되면 최신본으로
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import PlanProposalCard from '$lib/pages/tools/marketing-video/workspace/PlanProposalCard.svelte';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import { workspaceBasePath } from '$lib/pages/tools/marketing-video/workspaceUrl';
  import { usesSceneImages } from '$lib/pages/tools/marketing-video/aiModelOptions';
  import { resolveMime, validateImageFile } from '$lib/shared/lib/image/imageFile';
  import type { SavedPlan, SceneImageState } from '$lib/features/marketing-channels/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // 주소는 공용 빌더로만 만든다(버전 세그먼트를 빠뜨리면 돌아가기 링크가 404 가 된다)
  const basePath = $derived(
    workspaceBasePath({
      orgSlug: page.params.orgSlug ?? '',
      toolSlug: page.params.toolSlug ?? '',
      version: data.version,
      channelSlug: page.params.channelSlug ?? '',
    }),
  );
  const planId = $derived(Number(page.params.planId));
  // 워크스페이스는 채널별로 분리되므로 목록 쿼리/캐시 키에 현재 채널이 필요하다(상위 레이아웃 로드분)
  const currentChannelId = $derived(data.currentChannelId);
  const version = $derived(data.version);

  const queryClient = useQueryClient();
  const savedQuery = createQuery(() => svc.savedPlansQueryOptions(version, currentChannelId));
  // 클라 목록에서 찾고, 아직이면 서버 로드분(data.initialPlan) 사용 → 직접진입도 즉시 렌더
  const plan = $derived<SavedPlan>(
    savedQuery.data?.find((p) => p.id === planId) ?? data.initialPlan,
  );
  const deleteMutation = createMutation(() => svc.deleteSavedPlanMutationOptions(queryClient, version, currentChannelId));
  const savedSceneMutation = createMutation(() => svc.updateSavedPlanSceneMutationOptions(queryClient, version, currentChannelId));

  // 편집용 로컬 이미지/브리프: 저장본으로 1회 초기화(refetch 로 편집중 값이 덮이지 않게 id 가드)
  let savedImages = $state<Record<number, SceneImageState>>({});
  let savedBriefs = $state<Record<number, string>>({});
  let initedPlanId = $state<number | null>(null);
  $effect(() => {
    if (initedPlanId === planId) return;
    initedPlanId = planId;
    const imgs: Record<number, SceneImageState> = {};
    for (const img of plan.sceneImages)
      imgs[img.index] = { status: 'done', dataUrl: img.url, prompt: img.prompt };
    savedImages = imgs;
    savedBriefs = {};
  });

  function fileToImageDataUrl(file: File): Promise<string> {
    const mime = resolveMime(file);
    const blob = file.type === mime ? file : new Blob([file], { type: mime });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function back(): void {
    void goto(basePath);
  }

  // 재생성은 채널이 있어야 가능(브랜드/컨셉 조립 근거)
  /**
   * 씬 이미지를 쓰는 버전인가. 쓰지 않는 버전(v1.5)의 기획안에는 이미지가 없으므로 그 자리를 아예
   * 그리지 않는다. 접근자만 넘기고 값을 비우면 카드가 '생성 중' 스피너를 영구히 띄운다.
   */
  const showImages = $derived(usesSceneImages(version));
  const canRegen = $derived(showImages && plan.channelId != null);
</script>

<div class="flex flex-col gap-3">
  <button
    type="button"
    onclick={back}
    class="inline-flex w-fit items-center gap-1 text-sm text-fg-subtle transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
    워크스페이스
  </button>

  <PlanProposalCard
    proposal={{ id: `saved-${plan.id}`, title: plan.title, summary: plan.summary, scenes: plan.scenes, bgm: plan.bgm }}
    {version}
    order={1}
    alwaysOpen
    imageFor={showImages ? (idx) => savedImages[idx] : undefined}
    promptEditFor={showImages ? (idx) => savedBriefs[idx] : undefined}
    onSaveBrief={showImages
      ? (scene, imagePrompt) => {
          savedBriefs[scene.index] = imagePrompt;
          savedSceneMutation.mutate({ planId: plan.id, index: scene.index, imagePrompt });
        }
      : undefined}
    onPickImage={!showImages ? undefined : async (scene, file) => {
      const invalid = validateImageFile(file);
      if (invalid) return void (savedImages[scene.index] = { status: 'error', error: invalid });
      savedImages[scene.index] = { status: 'loading' };
      try {
        const dataUrl = await fileToImageDataUrl(file);
        savedImages[scene.index] = { status: 'done', dataUrl };
        savedSceneMutation.mutate({ planId: plan.id, index: scene.index, dataUrl });
      } catch {
        savedImages[scene.index] = { status: 'error', error: '이미지를 읽지 못했습니다.' };
      }
    }}
    onRetry={canRegen
      ? async (scene, imagePrompt) => {
          const brief = imagePrompt ?? savedBriefs[scene.index] ?? scene.imagePrompt ?? '';
          if (imagePrompt !== undefined) savedBriefs[scene.index] = imagePrompt;
          savedImages[scene.index] = { status: 'loading' };
          const res = await svc.generateSceneImage(version, plan.channelId as number, {
            brandName: plan.brandName,
            // 만들 때 쓴 조합으로 다시 만든다. 이 값을 빼면 서버가 세트의 현재 조합을 쓰고,
            //   그 사이 세트가 바뀌었으면 다른 화풍의 씬 하나가 끼어든다.
            concepts: plan.brandConcepts,
            imagePrompt: brief,
            proposalTitle: plan.title,
          });
          if (res.success) {
            savedImages[scene.index] = { status: 'done', dataUrl: res.data.dataUrl, prompt: res.data.prompt };
            savedSceneMutation.mutate({
              planId: plan.id,
              index: scene.index,
              dataUrl: res.data.dataUrl,
              prompt: res.data.prompt,
              imagePrompt: brief,
            });
          } else {
            savedImages[scene.index] = { status: 'error', error: res.error ?? '이미지 생성 실패' };
          }
        }
      : undefined}
    onDelete={() => {
      deleteMutation.mutate(plan.id);
      back();
    }}
  />
</div>

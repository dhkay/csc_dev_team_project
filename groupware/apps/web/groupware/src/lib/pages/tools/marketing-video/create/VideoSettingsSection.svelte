<script lang="ts">
  // 영상 설정 묶음: 영상 모델 → 세그먼트 연결 방식
  //
  // 두 입력 방식이 이 묶음을 공유한다. 폼은 다르지만 무엇으로 어떻게 만들지는 같은 결정이다.
  // 이 묶음까지 복제하면 설정을 하나 더할 때마다 두 폼을 고쳐야 하고, 한쪽만 고친 상태는 탭을
  // 옮겨 봐야 드러난다.
  //
  // 순서에 뜻이 있다. 무엇으로 만들지 다음에 어떻게 이어붙일지다. 뒤의 결정이 앞의 것을 전제하므로
  // 거꾸로 두면 아직 정하지 않은 것에 대해 답하게 된다.
  //
  // 쿼리를 이 컴포넌트가 갖는다. 폼이 들고 있으면 폼마다 같은 조회를 다시 배선해야 한다.
  // 같은 쿼리 키라 TanStack 이 캐시를 공유하므로 어느 폼에서 열어도 네트워크는 한 번이다.
  import { createQuery } from '@tanstack/svelte-query';
  import { marketingChannelsService as svc } from '$lib/features/marketing-channels/services/marketingChannels.service';
  import { apiCredentialsService } from '$lib/features/api-credentials/services/apiCredentials.service';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import VideoModelSection from './VideoModelSection.svelte';
  import SegmentModeSection from './SegmentModeSection.svelte';
  import { AI_CAPABILITIES, effectiveAiModel, visibleAiModelOptions } from '../aiModelOptions';
  import { versionProfile } from '../versionProfile';
  import type { SegmentMode } from '../planComposeOptions';

  interface Props {
    // 이 워크스페이스의 도구 버전: 선택지와 저장값 해석이 이 값으로 갈린다.
    version: VersionMode;
    // 이번 생성에 쓸 영상 모델 key(bindable). 설정 저장값에서 시작한다.
    videoModel: string;
    // 세그먼트 연결 방식(bindable)
    segmentMode: SegmentMode;
  }
  let {
    version,
    videoModel = $bindable(''),
    segmentMode = $bindable('sequential'),
  }: Props = $props();

  const profile = $derived(versionProfile(version));

  // 내 AI 모델 선택(설정): 영상 모델의 시작점
  const aiModelQuery = createQuery(() => svc.myAiModelQueryOptions(version));
  // 판정은 카탈로그가 소유한다(effectiveAiModel): 이 버전이 쓰지 않는 모델이 저장돼 있으면
  //   고르지 않은 것으로 본다. 설정 화면과 같은 함수라 두 화면이 다른 말을 하지 않는다.
  const savedVideoModel = $derived(
    effectiveAiModel('video', aiModelQuery.data?.video, version) ?? '',
  );
  const videoOptions = $derived(
    visibleAiModelOptions(AI_CAPABILITIES.find((c) => c.key === 'video')!, version),
  );

  // 조직 키 게이팅: 설정 화면(AiModelEditor)과 같은 출처를 본다.
  const configuredQuery = createQuery(() => apiCredentialsService.configuredProvidersOptions());
  const configuredProviders = $derived(new Set(configuredQuery.data ?? []));

  // 저장값을 읽으면 그것으로 시작한다. 사람이 바꾼 뒤에는 덮지 않는다: 쿼리가 다시 돌 때마다
  //   임시 선택이 되돌아가면, 바꿔 놓고 다른 칸을 채우는 사이에 원래 값으로 돌아가 있다.
  let videoTouched = $state(false);
  $effect(() => {
    if (!videoTouched && savedVideoModel && videoModel !== savedVideoModel) {
      videoModel = savedVideoModel;
    }
  });
</script>

<VideoModelSection
  options={videoOptions}
  value={videoModel}
  onSelect={(key) => {
    videoTouched = true;
    videoModel = key;
  }}
  savedValue={savedVideoModel}
  configured={configuredProviders}
  isPending={aiModelQuery.isPending}
/>

<SegmentModeSection value={segmentMode} onSelect={(m) => (segmentMode = m)} />

<!-- 나레이션 스위치 자리 아님. 이 버전은 합성 단계가 없어 끄고 켤 것이 없고, 누가 말할지는 동영상마다
     달라 영상 전체 설정으로 묶이지 않음('씬 / 사용자 입력사항' 에서 동영상별로 정함) -->

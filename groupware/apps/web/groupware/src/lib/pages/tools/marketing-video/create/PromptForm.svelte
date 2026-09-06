<script lang="ts">
  // 생성 모달의 프롬프트 폼: 만들 영상을 문장으로 직접 적는다.
  //
  // 컨셉입력 폼(ConceptForm)과 나눠 둔 이유는 이쪽이 저장된 세트를 시작점으로 삼지 않기 때문이다.
  // 브랜드 쿼리도, 선택 유효성을 지키는 효과도, 버전 분기도 없다. 이 방식은 v1.5 가 들여온 것이라
  // 이 폼을 그리는 버전이 하나뿐이다.
  //
  // 두 폼이 함께 쓰는 것은 영상 설정 묶음(VideoSettingsSection)뿐이다. 목적 키워드는 여기 없고
  // 위저드가 입력 방식 탭 위에서 그린다.
  //
  // 이 방식은 완전 자율이다. 적은 문장이 곧 주제이자 연출이고, 적히지 않은 것은 모델이 정한다.
  // 연출 성격 7축을 직접 적는 칸은 두지 않는다. 고를 것을 없앤 방식에 적을 것을 일곱 개 만들면
  // 컨셉입력보다 손이 더 간다.
  import {
    CONSTRAINTS_PLACEHOLDER,
    DEFAULT_SEGMENT_MODE,
    PROMPT_BRIEF_PLACEHOLDER,
    type SegmentMode,
  } from '../planComposeOptions';
  import BriefInputSection from './BriefInputSection.svelte';
  import VideoSettingsSection from './VideoSettingsSection.svelte';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';

  interface Props {
    // 이 워크스페이스의 도구 버전: 영상 설정의 선택지와 저장값 해석에 쓰인다.
    version: VersionMode;
    // 씬/사용자 입력사항(bindable): 무엇을 담을지 직접 적은 값. 이 방식에서는 곧 주제다.
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
    sceneBrief = $bindable(''),
    constraints = $bindable(''),
    videoModel = $bindable(''),
    segmentMode = $bindable(DEFAULT_SEGMENT_MODE),
  }: Props = $props();
</script>

<div class="flex flex-col gap-6">
  <!--
    씬 / 사용자 입력사항: 이 방식에서는 이 칸이 지시의 전부다(주제도 연출도 여기서 나온다)
    그래서 컨셉입력 폼과 달리 선택이 아니고, 예시도 그 폼과 다르다(거기서는 브랜드가 톤을 정하지만
    여기서는 적지 않으면 아무도 정해 주지 않는다)
  -->
  <BriefInputSection
    title="씬 / 사용자 입력사항"
    value={sceneBrief}
    onChange={(next) => (sceneBrief = next)}
    placeholder={PROMPT_BRIEF_PLACEHOLDER}
  />

  <!-- 제한사항: 무엇을 피할지. 무엇을 만들지 적은 뒤에야 "다만 이건 하지 말 것" 이 말이 된다. -->
  <BriefInputSection
    title="제한사항 입력"
    value={constraints}
    onChange={(next) => (constraints = next)}
    placeholder={CONSTRAINTS_PLACEHOLDER}
  />

  <!-- 영상 설정(모델 → 세그먼트 → 나레이션): 컨셉입력 폼과 함께 쓰는 유일한 묶음 -->
  <VideoSettingsSection {version} bind:videoModel bind:segmentMode />
</div>

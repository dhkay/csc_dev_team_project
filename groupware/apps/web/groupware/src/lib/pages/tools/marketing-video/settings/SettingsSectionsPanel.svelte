<script lang="ts">
  // 설정 컨테이너: 섹션을 탭으로 오간다(브랜드/컨셉 ↔ AI 모델)
  //  - 진입하면 첫 섹션(브랜드/컨셉)이 바로 보인다. 고를 것이 둘뿐이라 목록 화면을 한 단계 두면
  //    누구나 매번 같은 클릭을 한 번 더 하게 된다.
  //  - 열린 섹션은 URL(?section)이 단일 출처다. 라우트가 값을 넘기고 변경은 onSelectSection 으로
  //    URL 을 갱신한다(새로고침/뒤로가기/링크공유로 복원)
  //  - 섹션 추가 = 레지스트리 한 줄 + 아래 분기 한 줄. 탭 목록은 레지스트리에서 나온다.
  //  - 탭 모양은 이 도구의 다른 탭(에셋 풀)과 같은 밑줄 관용구다. 걷어낸 back 헤더가 있던 자리와
  //    같은 위치, 같은 구분선이라 본문 레이아웃(스크롤 본문 + 하단 저장 바)이 그대로 유지된다.
  //  - landscape 에서 폼이 가로로 늘어지지 않게 가운데 정렬 최대폭 컬럼(max-w-2xl)으로 담는다.
  //  - prop 은 섹션 선택 + 편집 대상 버전뿐이다: 두 섹션 모두 개인 설정이라 채널도 편집 권한도
  //    필요하지 않다. 브랜드/컨셉 아래에 세트 탭이 한 단 더 있는데, 그건 알약이라 겹쳐 보이지 않는다.
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import { MARKETING_SETTINGS_SECTIONS, type SettingsSectionKey } from '../marketingSettingsSections';
  import BrandConceptEditor from './BrandConceptEditor.svelte';
  import AiModelEditor from './AiModelEditor.svelte';

  interface Props {
    // 열린 섹션: URL(?section)이 단일 출처. 라우트가 유효한 값으로 좁혀 넘긴다.
    section: SettingsSectionKey;
    // 편집 대상 버전: 두 설정 모두 버전 슬롯에 저장된다(주소의 버전 세그먼트)
    version: VersionMode;
    onSelectSection?: (key: SettingsSectionKey) => void;
  }
  let { section, version, onSelectSection }: Props = $props();
</script>

<!-- 가운데 정렬 최대폭 컬럼: landscape 에서 전체폭으로 늘어지지 않게. narrow/portrait 는 w-full 로 채움 -->
<div class="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col">
  <div class="mb-4 flex shrink-0 flex-wrap gap-1 border-b border-line" role="tablist">
    {#each MARKETING_SETTINGS_SECTIONS as s (s.key)}
      {@const active = section === s.key}
      <button
        type="button"
        role="tab"
        aria-selected={active}
        title={s.description}
        onclick={() => onSelectSection?.(s.key)}
        class="-mb-px border-b-2 px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {active
          ? 'border-fg font-medium text-fg'
          : 'border-transparent text-fg-subtle hover:text-fg'}"
      >
        {s.label}
      </button>
    {/each}
  </div>

  <!--
    {#key version}: 버전이 바뀌면 편집기를 리마운트해 스테이징 편집을 버린다.
    버전만 바뀌는 이동은 라우트 id 가 같아 SvelteKit 이 컴포넌트를 다시 만들지 않는다. 그대로 두면
    서버값만 새 버전 것으로 갈리고 편집 중이던 값이 남아, 저장 시 다른 버전에서 하던 편집이 이
    버전 슬롯에 저장된다. 편집기마다 $effect 로 비우던 것을 경계 하나로 대신한다(앞으로 추가될
    편집기도 같은 버그를 못 만든다)
  -->
  {#key version}
    {#if section === 'ai-model'}
      <AiModelEditor {version} />
    {:else}
      <BrandConceptEditor {version} />
    {/if}
  {/key}
</div>

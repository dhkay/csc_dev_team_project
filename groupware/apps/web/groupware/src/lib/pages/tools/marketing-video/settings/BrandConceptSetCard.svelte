<script lang="ts">
  // 브랜드/컨셉 세트 1개 카드: 브랜드명 + 축별 단일 선택 칩
  //
  // 축 목록은 서버 카탈로그의 기본 축 + 이 세트가 더한 카테고리다(mergeAxes). 카탈로그만 그리면
  //   그 세트가 더한 카테고리가 화면에서 사라져 보인다.
  // 칩에 hover/focus 하면 그 옵션의 감독 노트를 축 아래 설명 패널에 표시한다(선택된 옵션이 기본 표시)
  // 순수 표현 컴포넌트: 값/편집/삭제는 부모(BrandConceptEditor)가 소유해 prop 으로 내려준다.
  //
  // 부모는 활성 세트 하나만 넘긴다(세트를 탭으로 오간다). 그래서 onChange/onRemove 에 인덱스가
  //   없다: 화면에 보이지 않는 세트를 고칠 경로가 아예 없어야 한다.
  import ConceptCategoryModal from './ConceptCategoryModal.svelte';
  import {
    mergeAxes,
    type DisplayAxis,
  } from '$lib/features/marketing-channels/lib/conceptCategories';
  import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
  import type {
    BrandConceptAxis,
    BrandConceptSetInput,
  } from '$lib/features/marketing-channels/types';

  interface Props {
    set: BrandConceptSetInput;
    // 기본 선택지 목록(서버 카탈로그): 이 화면은 목록을 소유하지 않고 받아서 그린다.
    axes: BrandConceptAxis[];
    // 편집 중인 도구 버전. 카테고리 관리가 자기 저장 요청에 싣는다.
    version: VersionMode;
    // 이 세트가 서버에 저장돼 있는 이름. 저장된 적 없으면 null.
    //
    // 카테고리 정의는 그 이름의 세트 안에 살기 때문에, 새로 추가했거나 이름을 고쳐 둔(아직 저장하지
    // 않은) 세트에는 붙일 자리가 없다. 그때는 관리 버튼을 막고 이유를 적는다.
    savedBrandName: string | null;
    // 표시용 세트 번호(1-based)
    index: number;
    // 추가 직후에만 true: 부모가 켠다. 새 세트는 이름부터 정해야 나머지가 의미를 갖는다.
    focusName?: boolean;
    // 필드 변경: 부모가 스테이징에 반영
    onChange: (patch: Partial<BrandConceptSetInput>) => void;
    // 이 세트 삭제
    onRemove: () => void;
  }
  let {
    set,
    axes,
    version,
    savedBrandName,
    index,
    focusName = false,
    onChange,
    onRemove,
  }: Props = $props();

  /**
   * 브랜드명/브랜드 설명 최대 길이
   *
   * 백엔드 `BRAND_CONCEPT_TEXT_MAX_LEN` 의 복제다. 이름이 달라 grep 으로 짝이 걸리지 않으므로
   * `scripts/check-brand-concept-limits.mjs` 가 두 값을 비교해 CI 에서 세운다. 여기가 더 크면
   * 사용자가 넣은 뒤쪽 글자가 저장 때 잘리고, 화면은 저장 성공을 보여준다.
   */
  const MAX_TEXT = 2000;

  // 축별 hover/focus 프리뷰 옵션 key(null = 없음 → 선택값 표시)
  let preview = $state<Record<string, string | null>>({});
  /**
   * 삭제 확인 단계. 탭 구조에서 삭제는 데이터 파괴와 화면 이동을 함께 하고, '되돌리기' 는 이 삭제만
   * 되살리지 못하고 편집 전체를 버리므로 undo 가 아니다(ChannelSwitcher 와 같은 인라인 2단 확인)
   * 카드가 이 상태를 소유한다: 부모가 탭을 바꾸면 카드가 리마운트되어 자동으로 풀린다.
   */
  let confirming = $state(false);
  let nameEl = $state<HTMLInputElement | null>(null);
  /** 카테고리/레퍼런스 관리 모달. 카드가 소유한다: 탭을 바꾸면 카드가 리마운트되어 함께 닫힌다. */
  let categoryOpen = $state(false);

  // 탭을 눌러 옮길 때는 포커스를 빼앗지 않는다(빼앗으면 좌우 화살표 이동이 끊긴다)
  $effect(() => {
    if (focusName) nameEl?.focus();
  });

  /**
   * 그릴 축 목록: 카탈로그의 기본 축 + 이 세트가 더한 카테고리
   *
   * 커스텀 축을 시각적으로 구분하지 않는다. 카드에서 하는 일은 고르는 것 하나이고 그 행위는 둘이
   * 같다. 기본 제공이 불변이라는 사실은 관리 모달에서만 드러나면 된다.
   */
  const displayAxes = $derived<DisplayAxis[]>(mergeAxes(axes, set));

  function selectedKey(a: DisplayAxis): string {
    return set.concepts.find((c) => c.axis === a.key)?.option ?? '';
  }
  function pick(a: DisplayAxis, key: string): void {
    // 이 축의 기존 선택을 제거하고 새 선택을 넣는다(같은 값 = 해제). 문구는 담지 않는다.
    const rest = set.concepts.filter((c) => c.axis !== a.key);
    onChange({
      concepts: key === selectedKey(a) ? rest : [...rest, { axis: a.key, option: key }],
    });
  }
  /** 설명 패널 텍스트: 프리뷰(hover) 우선, 없으면 선택값, 둘 다 없으면 축 안내 */
  function activeDescription(a: DisplayAxis): string {
    const key = preview[a.key] ?? selectedKey(a);
    return a.options.find((o) => o.key === key)?.description ?? a.description;
  }
</script>

<div class="flex flex-col gap-3 rounded-xl border border-line bg-elevated p-3">
  <div class="flex items-center justify-between gap-2">
    <span class="text-xs font-medium text-fg-muted">세트 {index}</span>
    {#if confirming}
      <span class="flex items-center gap-1">
        <button
          type="button"
          onclick={onRemove}
          class="rounded-md px-2 py-0.5 text-[11px] font-medium text-danger-fg transition hover:bg-danger-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-fg/40"
          aria-label={`세트 ${index} 삭제 확인`}
        >
          삭제
        </button>
        <button
          type="button"
          onclick={() => (confirming = false)}
          class="rounded-md px-2 py-0.5 text-[11px] text-fg-subtle transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
          aria-label="삭제 취소"
        >
          취소
        </button>
      </span>
    {:else}
      <button
        type="button"
        onclick={() => (confirming = true)}
        class="rounded-md px-2 py-0.5 text-[11px] text-danger-fg transition hover:bg-danger-bg"
        aria-label={`세트 ${index} 삭제`}
      >
        삭제
      </button>
    {/if}
  </div>

  <input
    type="text"
    bind:this={nameEl}
    maxlength={MAX_TEXT}
    value={set.brandName}
    oninput={(e) => onChange({ brandName: e.currentTarget.value })}
    placeholder="브랜드명"
    class="w-full rounded-md border border-line bg-elevated px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-subtle transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
  />

  <textarea
    rows="2"
    maxlength={MAX_TEXT}
    value={set.brandDescription}
    oninput={(e) => onChange({ brandDescription: e.currentTarget.value })}
    placeholder="브랜드 설명 (무엇을 파는 브랜드인지, 핵심 강점, 타깃 등)"
    class="w-full resize-y rounded-md border border-line bg-elevated px-2.5 py-2 text-sm text-fg placeholder:text-fg-subtle transition focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15"
  ></textarea>

  <!-- 축(카테고리) 영역 머리. 버튼을 여기 두는 이유: 아래 칩들이 무엇의 목록인지 이름을 붙이는
       자리이고, 그 이름 옆이라야 '무엇을' 추가하는 버튼인지 읽힌다. 카드 안이므로 세트 단위라는
       것도 위치로 드러난다(카드 = 세트 하나). 브랜드명/설명 아래, 칩 위가 그 경계다. -->
  <div class="flex items-center justify-between gap-2 pt-1">
    <span class="text-xs font-semibold text-fg-muted">카테고리</span>
    <span class="flex items-center gap-2">
      {#if !savedBrandName}
        <span class="text-[11px] text-fg-subtle">브랜드명을 먼저 저장하세요</span>
      {/if}
      <button
        type="button"
        onclick={() => (categoryOpen = true)}
        disabled={!savedBrandName}
        title={savedBrandName
          ? undefined
          : '카테고리는 저장된 브랜드에 붙습니다. 화면 하단에서 먼저 저장하세요.'}
        class="rounded-full border border-line px-2.5 py-1 text-xs text-fg-muted transition hover:bg-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
      >
        카테고리 추가/변경
      </button>
    </span>
  </div>

  {#each displayAxes as a (a.key)}
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-medium text-fg-muted">{a.label}</span>
      <div class="flex flex-wrap gap-1.5">
        {#each a.options as o (o.key)}
          {@const on = selectedKey(a) === o.key}
          <button
            type="button"
            title={o.description}
            aria-pressed={on}
            onclick={() => pick(a, o.key)}
            onmouseenter={() => (preview[a.key] = o.key)}
            onmouseleave={() => (preview[a.key] = null)}
            onfocus={() => (preview[a.key] = o.key)}
            onblur={() => (preview[a.key] = null)}
            class="rounded-full px-2.5 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 {on
              ? 'bg-fg text-surface'
              : 'bg-hover text-fg-subtle hover:text-fg'}"
          >
            {o.label}
          </button>
        {/each}
      </div>
      <!-- 감독 노트: hover/선택 옵션 설명(min-h 로 hover 시 레이아웃 점프 완화) -->
      <p
        class="min-h-[2.25rem] rounded-md bg-hover px-2.5 py-1.5 text-[11px] leading-relaxed text-fg-subtle"
        aria-live="polite"
      >
        {activeDescription(a)}
      </p>
    </div>
  {/each}
</div>

<!-- 카테고리/레퍼런스 관리. 카드 마크업 밖에 두어 카드 레이아웃에 끼어들지 않게 한다.
     제목의 채널명은 모달이 page 데이터에서 직접 읽는다(그 이유는 모달 머리 주석)
     모달이 스스로 저장하고, 그 결과를 onChange 로 올려 카드가 방금 저장한 값을 그리게 한다.
     이 올림이 없으면 스테이징이 낡은 값을 들고 있어 하단 바가 저장하지 않은 변경으로 읽고, 그
     저장이 방금 저장된 선택을 되돌린다. -->
{#if savedBrandName}
  <ConceptCategoryModal
    bind:open={categoryOpen}
    {set}
    {axes}
    {version}
    {savedBrandName}
    onSaved={onChange}
  />
{/if}

<script lang="ts">
  // 활동 로그 필터 바. 기준(criteria)을 편집만 하고 판정/변환은 갖지 않는다:
  // 순수 모듈(activityLogFilter)이 소유한다(보관함의 ArchiveFilterBar 와 같은 배치)
  //
  // 액션 묶음(초기화/CSV)이 필터 카드 안에 있는 이유: 내보내는 대상이 '현재 필터 조건'이라
  // 조건과 실행이 붙어 있어야 무엇을 받는지 헷갈리지 않는다.
  import {
    createActivityLogCriteria,
    isActivityLogFilterActive,
    type ActivityLogCriteria,
  } from '$lib/features/marketing-activity-logs/lib/activityLogFilter';
  import {
    ACTIVITY_GROUPS,
    type ActivityFilterOption,
  } from '$lib/features/marketing-activity-logs/types';
  import { formatMemberLabel, type MemberRosterEntry } from '$lib/features/members/lib/roster';
  import { FILTER_CONTROL } from '$lib/shared/ui/controls/controlClasses';

  interface Props {
    criteria: ActivityLogCriteria;
    // 채널 선택지. 비어 있으면 채널 필터를 감춘다(고를 게 없다)
    channels?: ActivityFilterOption[];
    // 사용자 선택지(조직 멤버 로스터)
    members?: MemberRosterEntry[];
    // 세로 화면인가: 액션 묶음의 자리만 바뀐다(아래 참고)
    portrait?: boolean;
    // CSV 내보내기 진행 상태. 버튼 라벨/비활성에 쓴다.
    exporting?: boolean;
    exportedCount?: number;
    // 내보낼 게 없으면(결과 0건) 버튼을 잠근다.
    exportDisabled?: boolean;
    onExport: () => void;
  }

  let {
    criteria = $bindable(),
    channels = [],
    members = [],
    portrait = false,
    exporting = false,
    exportedCount = 0,
    exportDisabled = false,
    onExport,
  }: Props = $props();

  const active = $derived(isActivityLogFilterActive(criteria));

  function reset(): void {
    criteria = createActivityLogCriteria();
  }
</script>

<div class="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
  {#if channels.length > 0}
    <label class="flex flex-col gap-1 text-xs text-fg-subtle">
      채널
      <select bind:value={criteria.channelId} class={FILTER_CONTROL}>
        <option value={null}>전체</option>
        {#each channels as c (c.id)}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </label>
  {/if}

  {#if members.length > 0}
    <label class="flex flex-col gap-1 text-xs text-fg-subtle">
      사용자
      <select bind:value={criteria.actorId} class={FILTER_CONTROL}>
        <option value={null}>전체</option>
        {#each members as m (m.id)}
          <option value={m.id}>{formatMemberLabel(m)}</option>
        {/each}
      </select>
    </label>
  {/if}

  <label class="flex flex-col gap-1 text-xs text-fg-subtle">
    활동
    <select bind:value={criteria.actionPrefix} class={FILTER_CONTROL}>
      {#each ACTIVITY_GROUPS as g (g.prefix)}
        <option value={g.prefix}>{g.label}</option>
      {/each}
    </select>
  </label>

  <label class="flex flex-col gap-1 text-xs text-fg-subtle">
    시작일
    <input type="date" bind:value={criteria.sinceDate} class={FILTER_CONTROL} />
  </label>
  <label class="flex flex-col gap-1 text-xs text-fg-subtle">
    종료일
    <input type="date" bind:value={criteria.untilDate} class={FILTER_CONTROL} />
  </label>

  <label class="flex items-center gap-1.5 pb-1 text-xs text-fg-muted">
    <input type="checkbox" bind:checked={criteria.failedOnly} class="h-3.5 w-3.5" />
    실패만
  </label>

  <!--
    비용 발생만. '무료'와 '측정 안 됨'은 여기서 빠진다: 셋을 구분해 보여주는 건 표의 비용
    칸이 이미 하는 일이고, 이 체크박스가 답하는 질문은 "돈이 나간 게 뭐냐" 하나다.
    그래서 라벨도 '비용 있음'이 아니라 '비용 발생만'이다(0원 무료가 포함되지 않는다는 뜻)
  -->
  <label
    class="flex items-center gap-1.5 pb-1 text-xs text-fg-muted"
    title="청구액이 발생한 활동만 봅니다. 요금이 없는 모델과 측정되지 않은 활동은 제외됩니다."
  >
    <input type="checkbox" bind:checked={criteria.billedOnly} class="h-3.5 w-3.5" />
    비용 발생만
  </label>

  <!--
    액션 묶음. 방향에 따라 자리가 갈린다.
      landscape: 필터 행 오른쪽 끝(ml-auto). 조건을 왼쪽부터 채우고 실행을 끝에 두는 읽기 순서
      portrait:  필터 아래 전체 폭 한 줄. 좁은 화면에서 필터 사이에 끼면 줄바꿈에 밀려 자리가
                 매번 달라지고, 화면 위쪽에 걸려 엄지로 닿기 어렵다.
  -->
  <div class={portrait ? 'flex w-full gap-2 pt-1' : 'ml-auto flex items-center gap-2'}>
    <button
      type="button"
      onclick={reset}
      disabled={!active}
      class="h-8 rounded-md border border-line px-3 text-xs font-medium text-fg-muted transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50 {portrait
        ? 'flex-1'
        : 'shrink-0'}"
    >
      초기화
    </button>

    <button
      type="button"
      onclick={onExport}
      disabled={exporting || exportDisabled}
      title="현재 필터 조건에 해당하는 활동 전체를 CSV 파일로 내려받습니다"
      class="flex h-8 items-center justify-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-fg transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60 {portrait
        ? 'flex-1'
        : 'shrink-0'}"
    >
      <!-- 아래 화살표(내려받기). 라벨과 함께 쓰므로 아이콘은 장식이다. -->
      <svg
        class="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 4v11" />
        <path d="m7 11 5 5 5-5" />
        <path d="M5 20h14" />
      </svg>
      {exporting ? `내보내는 중 ${exportedCount.toLocaleString('ko-KR')}건` : 'CSV 내보내기'}
    </button>
  </div>
</div>

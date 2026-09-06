<script lang="ts">
  // 활동 로그. 조직 구성원이 이 도구에서 한 작업의 원장(누가, 어떤 채널에서, 무엇을, 얼마)
  //
  // 버전으로 거르지 않는다. 이 화면은 다른 화면들과 반대다. 프로세스와 가격표는 지금 보고 있는
  // 버전의 사실만 말해야 하지만 원장은 실제로 일어난 일을 말한다. v1.5 를 보고 있다고 v1.0 기록을
  // 감추면 그 달에 나간 돈의 절반이 사라진다. 대신 활동마다 버전을 배지로 달아 가릴 수 있게 한다.
  //
  // 비용은 이벤트 시점에 동결된 값이다. 단가가 나중에 바뀌어도 과거 행은 변하지 않는다.
  // 금액이 없는 행은 세 가지로 갈린다.
  //   free          = 요금이 없는 모델이라 청구가 없다(확정)
  //   usage-missing = 사용량을 못 받았다(모름. 0 으로 위장하지 않는다)
  //   rate-unknown  = 단가표에 없는 모델(CI 게이트가 잡는다)
  //
  // 원장은 at-least-once 이고 손실 가능하다. 활동 원장이지 회계 장부가 아니므로 합계는 참고치다.
  import { createInfiniteQuery } from '@tanstack/svelte-query';
  import {
    createMemberIdentityLookup,
    type MemberRosterEntry
  } from '$lib/features/members/lib/roster';
  import {
    activityLogsService,
    EXPORT_MAX_ROWS
  } from '$lib/features/marketing-activity-logs/services/activityLogs.service';
  import {
    activityLogCsvBaseName,
    buildActivityLogCsv
  } from '$lib/features/marketing-activity-logs/lib/activityLogsCsv';
  import {
    ACTION_LABELS,
    type ActivityCost,
    type ActivityFilterOption,
    type ActivityLogRecord
  } from '$lib/features/marketing-activity-logs/types';
  import {
    createActivityLogCriteria,
    toActivityLogFilter
  } from '$lib/features/marketing-activity-logs/lib/activityLogFilter';
  import { formatMicroUsd } from '@csc/pricing';
  import { infiniteScroll } from '$lib/shared/lib/actions/infiniteScroll';
  import { downloadTextAsFile } from '$lib/shared/lib/utils/downloadFile';
  import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
  import { viewportModeStore } from '$lib/shared/lib/stores/viewport/viewportModeStore/viewportModeStore.svelte';
  import LogFilterBar from './LogFilterBar.svelte';

  interface Props {
    // 채널 필터 선택지(SSR 로드). 비어 있으면 채널 필터를 숨긴다.
    channels?: ActivityFilterOption[];
    // 사용자 필터 선택지(조직 멤버 로스터, SSR 로드). 표의 행위자 조인에도 쓴다.
    members?: MemberRosterEntry[];
  }
  let { channels = [], members = [] }: Props = $props();

  // 필터 기준은 한 객체로 들고 필터 바가 편집한다. 기준 → 조회 필터 변환(날짜 경계 포함)은
  // 순수 모듈이 소유하므로, 표와 CSV 내보내기가 같은 규칙을 쓰는 것이 구조적으로 보장된다.
  let criteria = $state(createActivityLogCriteria());
  const filter = $derived(toActivityLogFilter(criteria));

  // 필터가 바뀌면 쿼리 키가 바뀌어 첫 페이지부터 다시 받는다(커서도 함께 초기화)
  const logsQuery = createInfiniteQuery(() => activityLogsService.list(filter));

  const records = $derived<ActivityLogRecord[]>(
    (logsQuery.data?.pages ?? []).flatMap((p) => p.records)
  );

  /**
   * 조건에 맞는 전체 건수(서버 집계). 총계는 필터의 성질이라 첫 페이지 응답에만 실린다.
   *
   * records.length 를 건수로 쓰면 안 되는 이유: 한 페이지는 50건인데 원장이 그보다 크면,
   * 더 보기를 누른 목록(예: 93건)과 필터를 바꿔 되감긴 목록(50건)이 다른 숫자를 보여준다.
   * 데이터가 같아도 필터 결과가 달라 보이므로, 비교에 쓰는 숫자는 총계여야 한다.
   */
  const totalCount = $derived<number | null>(logsQuery.data?.pages?.[0]?.total ?? null);

  // 표시 조인(id → 이름 + 이메일)
  // 행위자 없는 레코드(id=null)만 여기서 처리하고, 나머지는 공용 조회(보관함과 동일 규칙)에 맡긴다.
  const memberIdentity = $derived.by(() => {
    const lookup = createMemberIdentityLookup(members);
    return (id: number | null) =>
      id == null ? { name: '시스템', email: null } : lookup(id);
  });
  const channelName = $derived.by(() => {
    const map = new Map(channels.map((c) => [c.id, c.name]));
    return (id: number | undefined) =>
      id == null ? '-' : (map.get(id) ?? `삭제된 채널 (#${id})`);
  });

  function actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  function formatWhen(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * 비용 셀 표시. 금액이 없는 이유를 문구로 구분한다(0 으로 뭉개지 않는다)
   *
   * 'metered'(크레딧/플랜 벤더)는 결함이 아니라 그 벤더의 과금 방식이라 '측정 안 됨' 과 갈라야
   * 한다. 후자는 우리가 받아야 할 사용량을 못 받은 상태이고, 이쪽은 애초에 곱할 단가가 없다.
   */
  function costText(cost: ActivityCost | undefined): string {
    if (!cost) return '-';
    if (cost.status === 'free') return '무료';
    if (cost.status === 'metered') return '벤더 청구';
    if (cost.micro_usd == null) return cost.status === 'rate-unknown' ? '단가 미등록' : '측정 안 됨';
    return formatMicroUsd(cost.micro_usd);
  }

  /** 비용 셀 보조 설명(모델/토큰). 금액만으로는 어디에 쓴 돈인지 알 수 없다. */
  function costHint(r: ActivityLogRecord): string {
    const parts: string[] = [];
    const model = r.payload.cost?.model;
    if (model) parts.push(model);
    if (r.tokenInput || r.tokenOutput) {
      parts.push(`토큰 ${r.tokenInput ?? 0}/${r.tokenOutput ?? 0}`);
    }
    return parts.join(', ');
  }

  /** 합계. 화면에 실제로 로드된 행의 금액만 더한다(전체 기간 합계가 아니다) */
  const loadedTotal = $derived(
    records.reduce((acc, r) => acc + (r.payload.cost?.micro_usd ?? 0), 0)
  );
  const failedCount = $derived(records.filter((r) => r.level !== 'INFO').length);

  // CSV 내보내기
  //
  // 화면에 불러온 만큼이 아니라 현재 필터 조건 전체를 담는다. 표는 스크롤한 만큼만 이어
  // 붙지만 파일은 보고와 대조에 쓰이므로, 본 만큼만 들어가면 받은 사람이 그걸 전체로 오해한다.
  // 상한(EXPORT_MAX_ROWS)에 걸리면 파일은 주되 잘렸다는 사실을 토스트로 알린다.
  let exporting = $state(false);
  let exportedCount = $state(0);

  async function exportCsv(): Promise<void> {
    if (exporting) return;
    exporting = true;
    exportedCount = 0;
    try {
      const { records: all, truncated } = await activityLogsService.collectForExport(
        filter,
        (loaded) => (exportedCount = loaded)
      );

      if (all.length === 0) {
        toastStore.show({ variant: 'info', title: '내보낼 활동이 없습니다.' });
        return;
      }

      const csv = buildActivityLogCsv(all, { actor: memberIdentity, channel: channelName });
      downloadTextAsFile(
        csv,
        activityLogCsvBaseName(new Date()),
        'csv',
        'text/csv;charset=utf-8'
      );

      if (truncated) {
        toastStore.show({
          variant: 'warning',
          title: `상한 ${EXPORT_MAX_ROWS.toLocaleString('ko-KR')}행까지만 내보냈습니다.`,
          detail: '기간이나 필터를 좁혀 나눠 내보내세요.'
        });
      }
    } catch (error) {
      toastStore.error(
        'CSV 내보내기 실패',
        error instanceof Error ? error.message : '활동 로그를 불러오지 못했습니다.'
      );
    } finally {
      exporting = false;
    }
  }

  // 버튼 배치는 방향에 따라 갈린다(아래 마크업 참고). 판정은 뷰포트 SSOT 를 그대로 쓴다.
  const isPortrait = $derived(viewportModeStore.isPortrait);
</script>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
  <header class="flex flex-col gap-1">
    <h1 class="text-lg font-semibold text-fg">로그</h1>
    <p class="text-sm text-fg-subtle">
      조직 구성원이 마케팅 영상 제작 도구에서 한 작업과, 각 단계에서 발생한 비용입니다.
    </p>
  </header>

  <LogFilterBar
    bind:criteria
    {channels}
    {members}
    portrait={isPortrait}
    {exporting}
    {exportedCount}
    exportDisabled={records.length === 0}
    onExport={exportCsv}
  />

  <!--
    요약. 첫 칸만 조건 전체(서버 집계)이고 나머지 둘은 불러온 범위다. 기준이 다르면 라벨에
    적어 둔다: 같은 줄에 놓인 숫자는 같은 모집단이라고 읽히기 때문이다.
  -->
  <div class="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
    <div class="flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-4">
      <span class="text-xs text-fg-subtle">조건에 맞는 활동</span>
      <span class="text-xl font-bold tabular-nums text-fg">
        {(totalCount ?? records.length).toLocaleString('ko-KR')}<span
          class="ml-0.5 text-sm font-medium text-fg-subtle">건</span
        >
      </span>
      <!-- 아직 다 못 불러온 동안만. 총계와 표의 행 수가 다른 이유를 그 자리에서 설명한다. -->
      {#if totalCount !== null && records.length < totalCount}
        <span class="text-[11px] text-fg-subtle">
          불러온 {records.length.toLocaleString('ko-KR')}건
        </span>
      {/if}
    </div>
    <div class="flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-4">
      <span class="text-xs text-fg-subtle">불러온 범위의 비용</span>
      <span class="text-xl font-bold tabular-nums text-fg">{formatMicroUsd(loadedTotal)}</span>
    </div>
    <div
      class="flex flex-col gap-0.5 rounded-xl border bg-surface p-4 {failedCount > 0
        ? 'border-warning-fg/40'
        : 'border-line'}"
    >
      <span class="text-xs text-fg-subtle">불러온 범위의 실패/경고</span>
      <span class="text-xl font-bold tabular-nums {failedCount > 0 ? 'text-warning-fg' : 'text-fg'}">
        {failedCount.toLocaleString('ko-KR')}<span
          class="ml-0.5 text-sm font-medium text-fg-subtle">건</span
        >
      </span>
    </div>
  </div>

  <div class="overflow-x-auto rounded-xl border border-line bg-surface">
    <table class="w-full min-w-[52rem] border-collapse text-left text-sm">
      <thead>
        <tr class="border-b border-line text-xs text-fg-subtle">
          <th class="px-3 py-2 font-medium">일시</th>
          <th class="px-3 py-2 font-medium">사용자</th>
          <th class="px-3 py-2 font-medium">채널</th>
          <th class="px-3 py-2 font-medium">활동</th>
          <th class="px-3 py-2 font-medium">내용</th>
          <th class="px-3 py-2 text-right font-medium">비용</th>
        </tr>
      </thead>
      <tbody>
        {#if logsQuery.isPending}
          <tr><td colspan="6" class="px-3 py-8 text-center text-fg-subtle">불러오는 중…</td></tr>
        {:else if logsQuery.isError}
          <tr>
            <td colspan="6" class="px-3 py-8 text-center text-danger-fg">
              {logsQuery.error instanceof Error
                ? logsQuery.error.message
                : '활동 로그를 불러오지 못했습니다.'}
            </td>
          </tr>
        {:else if records.length === 0}
          <tr>
            <td colspan="6" class="px-3 py-8 text-center text-fg-subtle">
              조건에 맞는 활동이 없습니다.
            </td>
          </tr>
        {:else}
          {#each records as r (r.eventId)}
            <!-- 실행자: 이름 아래 이메일(로그인 ID). 이유는 roster.ts 참고(동명이인 허용) -->
            {@const actor = memberIdentity(r.actorId)}
            <tr class="border-b border-line/60 last:border-0">
              <td class="whitespace-nowrap px-3 py-2 tabular-nums text-fg-muted">
                {formatWhen(r.occurredAt)}
              </td>
              <td class="whitespace-nowrap px-3 py-2">
                <span class="block text-fg">{actor.name}</span>
                {#if actor.email}
                  <span class="block text-xs text-fg-subtle">{actor.email}</span>
                {/if}
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-fg-muted">
                {channelName(r.payload.channel_id)}
              </td>
              <td class="whitespace-nowrap px-3 py-2">
                <span class="text-fg">{actionLabel(r.action)}</span>
                {#if r.payload.version}
                  <span
                    class="ml-1.5 rounded-full border border-line px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-fg-subtle"
                  >
                    {r.payload.version}
                  </span>
                {/if}
                {#if r.level !== 'INFO'}
                  <span
                    class="ml-1.5 rounded bg-warning-bg px-1.5 py-0.5 text-[11px] font-medium text-warning-fg"
                  >
                    실패
                  </span>
                {/if}
              </td>
              <td class="px-3 py-2 text-fg-muted">{r.message}</td>
              <td class="whitespace-nowrap px-3 py-2 text-right">
                <span class="tabular-nums text-fg">{costText(r.payload.cost)}</span>
                {#if costHint(r)}
                  <span class="block text-[11px] text-fg-subtle">{costHint(r)}</span>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>

  <!--
    페이징: 표 끝에 닿으면 다음 페이지가 이어 붙는다(무한 스크롤)

    버튼을 남겨 두는 이유는 장식이 아니다. 스크롤 관측은 마우스/터치로 굴려 내려온 사람에게만
    닿는다. 키보드와 보조기술 사용자, 그리고 IntersectionObserver 가 없는 환경에는 눌러서
    다음 장을 여는 경로가 따로 있어야 원장을 끝까지 볼 수 있다.
    (감사 표라 '끝까지 볼 수 있음'이 편의보다 앞선다는 원래 판단은 그대로다.)
  -->
  {#if logsQuery.hasNextPage}
    <div
      use:infiniteScroll={{
        hasMore: logsQuery.hasNextPage,
        busy: logsQuery.isFetchingNextPage,
        load: () => logsQuery.fetchNextPage()
      }}
      class="flex flex-col items-center gap-2"
    >
      <button
        type="button"
        onclick={() => logsQuery.fetchNextPage()}
        disabled={logsQuery.isFetchingNextPage}
        class="h-9 rounded-md border border-line px-4 text-sm font-medium text-fg-muted transition hover:bg-hover disabled:opacity-60"
      >
        {logsQuery.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
      </button>
    </div>
  {/if}

  <!--
    스크린리더 통지: 스크롤로 행이 늘어난 것은 시각적으로만 드러난다. 표가 조용히 길어지면
    보조기술 사용자는 로드가 끝났는지 알 수 없어 계속 기다리거나 중복해서 버튼을 누른다.
  -->
  <p aria-live="polite" class="sr-only">
    {#if logsQuery.isFetchingNextPage}
      활동을 더 불러오는 중입니다.
    {:else if totalCount !== null}
      {totalCount.toLocaleString('ko-KR')}건 중 {records.length.toLocaleString('ko-KR')}건을
      불러왔습니다.
    {/if}
  </p>

  <p class="text-xs text-fg-subtle">
    비용은 각 작업이 실행된 시점의 단가로 계산되어 고정됩니다(이후 단가가 바뀌어도 과거 기록은
    변하지 않습니다). 요금이 없는 모델을 쓴 작업은 <strong class="font-medium text-fg-muted">무료</strong>로,
    사용량을 받지 못한 작업은 <strong class="font-medium text-fg-muted">측정 안 됨</strong>으로
    표시되며 0원으로 합산하지 않습니다. 활동 기록은 참고용이며 회계 증빙 목적의 정산 자료가 아닙니다.
  </p>
</div>

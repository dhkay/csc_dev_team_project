<script lang="ts">
  import { onMount } from 'svelte';
  import { loadAppConfig, type AppConfig } from '$lib/app/config/appConfig';
  import {
    isTauri,
    localStore,
    type LocalStoreInfo,
    type OutboxFailure,
    type OutboxSummary,
  } from '$lib/infrastructure/local';
  import { syncStore } from '$lib/shared/lib/stores/syncStore/syncStore.svelte';
  import { version as appVersion } from '$lib/app/config/appVersion';

  /**
   * 진단 화면
   *
   * Phase 0 에 넣는 이유: 나중에 넣으면 이미 장애가 난 뒤다. 현장 PC 는 원격 접속이 어렵고
   * 문제를 알려주는 사람은 개발자가 아니다. 설계 기준은 하나다. 전화로 진단이 되는가
   */
  let config = $state<AppConfig | null>(null);
  let storeInfo = $state<LocalStoreInfo | null>(null);
  let outbox = $state<OutboxSummary | null>(null);
  let failures = $state<OutboxFailure[]>([]);

  async function refresh() {
    config = await loadAppConfig();
    storeInfo = await localStore().info();
    outbox = await localStore().outboxSummary();
    failures = await localStore().recentFailures(5);
  }

  onMount(() => {
    void refresh();
  });

  let status = $derived(syncStore.status);
</script>

<section class="flex flex-col gap-8 p-8">
  <header class="flex items-center gap-4">
    <h1 class="text-figure font-bold">진단</h1>
    <button
      class="min-h-(--size-touch) rounded border border-neutral-400 px-4"
      onclick={() => void refresh()}
    >
      새로고침
    </button>
    <a class="ml-auto underline" href="/">돌아가기</a>
  </header>

  <div class="grid gap-8 md:grid-cols-2">
    <article class="flex flex-col gap-2">
      <h2 class="font-bold">연결</h2>
      <dl class="grid grid-cols-2 gap-1">
        <dt>상태</dt>
        <dd data-testid="diag-connectivity">{status.connectivity}</dd>
        <dt>마지막 pull</dt>
        <dd>{status.lastPullAt ?? '없음'}</dd>
        <dt>마지막 push</dt>
        <dd>{status.lastPushAt ?? '없음'}</dd>
      </dl>
    </article>

    <article class="flex flex-col gap-2">
      <h2 class="font-bold">큐</h2>
      <dl class="grid grid-cols-2 gap-1">
        <dt>대기</dt>
        <dd data-testid="diag-pending">{outbox?.pending ?? 0}</dd>
        <dt>전송 중</dt>
        <dd>{outbox?.sending ?? 0}</dd>
        <dt>실패</dt>
        <dd>{outbox?.failed ?? 0}</dd>
        <dt>충돌</dt>
        <dd>{outbox?.conflict ?? 0}</dd>
        <dt>격리</dt>
        <dd>{outbox?.dead ?? 0}</dd>
        <dt>가장 오래된 미전송</dt>
        <dd>{outbox?.oldestPendingAt ?? '없음'}</dd>
      </dl>
    </article>

    <article class="flex flex-col gap-2">
      <h2 class="font-bold">신원</h2>
      <dl class="grid grid-cols-2 gap-1">
        <dt>앱 버전</dt>
        <dd data-testid="diag-app-version">{appVersion}</dd>
        <dt>런타임</dt>
        <dd>{isTauri() ? 'Tauri' : '브라우저(개발)'}</dd>
        <dt>로컬 스키마</dt>
        <dd data-testid="diag-schema">
          {storeInfo?.schemaVersion ?? '-'} / 기대 {storeInfo?.expectedSchemaVersion ?? '-'}
        </dd>
        <dt>단말 ID</dt>
        <dd data-testid="diag-device-id">{config?.deviceId ?? '미등록'}</dd>
        <dt>사이트</dt>
        <dd>{config?.siteCode ?? '미설정'}</dd>
      </dl>
    </article>

    <article class="flex flex-col gap-2">
      <h2 class="font-bold">설정</h2>
      <dl class="grid grid-cols-2 gap-1">
        <dt>API 주소</dt>
        <dd data-testid="diag-api-base-url">{config?.apiBaseUrl ?? '-'}</dd>
        <dt>업데이트 엔드포인트</dt>
        <dd>{config?.updateEndpoint ?? '-'}</dd>
        <dt>채널</dt>
        <dd>{config?.channel ?? '-'}</dd>
      </dl>
      <!-- 이 값들이 config.json 에서 왔는지 빌드 상수에서 왔는지는 현장 문의의 절반이다. -->
      <p class="text-sm text-neutral-600">
        우선순위: config.json &gt; 빌드 상수 &gt; 기본값
      </p>
    </article>
  </div>

  {#if storeInfo?.readOnly}
    <!--
      앱을 롤백했는데 DB 는 신버전인 경우. 그냥 열면 신버전 컬럼의 데이터가 조용히 잘려 나간다.
      그래서 자동 처리하지 않고 읽기 전용으로 떨어뜨린 뒤 사람에게 알린다.
    -->
    <p class="border border-neutral-400 p-4" data-testid="diag-readonly">
      로컬 DB 가 이 앱보다 최신입니다. 읽기 전용으로 동작 중이며 새 입력이 저장되지 않습니다.
      앱을 최신 버전으로 올린 뒤 다시 시도하세요.
    </p>
  {/if}

  <article class="flex flex-col gap-2">
    <h2 class="font-bold">최근 실패</h2>
    {#if failures.length === 0}
      <p class="text-neutral-600">없습니다.</p>
    {:else}
      <ul class="flex flex-col gap-1">
        {#each failures as failure (failure.clientOpId)}
          <li>
            {failure.entity} / {failure.status} / 시도 {failure.attemptCount}회 /
            {failure.lastErrorCode ?? '사유 없음'}
          </li>
        {/each}
      </ul>
    {/if}
  </article>

  <article class="flex flex-col gap-2">
    <h2 class="font-bold">지원</h2>
    <!--
      진단 번들이 이 화면 가치의 대부분이다. 최근 로그 + 스키마 버전 + config(비밀 마스킹) +
      outbox 요약을 zip 으로 바탕화면에 저장한다. 전화로 "바탕화면에 생긴 파일 보내주세요" 가
      되는 것과, 원격 지원 도구를 설치하러 공장에 가는 것의 차이다.
      Phase 1 에서 Rust 명령으로 구현한다.
    -->
    <p class="text-neutral-600">진단 번들 내보내기는 Phase 1 에서 제공됩니다.</p>
  </article>
</section>

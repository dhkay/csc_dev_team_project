<script lang="ts">
  // 사용량 요약: 영역별 용량과 파일 수. 상한은 두지 않으므로 이 값은 현황이지 제한이 아니다.
  //
  // 값이 아직 없으면 하이픈으로 둔다. 그럴듯한 0 을 채우면 연결이 끝난 화면처럼 보여, 진짜 0 일
  // 때와 구분되지 않는다.
  //
  // 방향은 CSS 로만 다룬다. 좁은 화면에서는 한 줄로 감싸고, 넓은 화면(레일 하단)에서는 세로로 쌓는다.
  // 마크업은 하나라 항목이 늘어도 한 곳만 고친다.
  import { formatBytes } from '$lib/features/storage/lib/bytes';
  import type { StorageUsageSummary } from '$lib/features/storage/types';

  interface Props {
    usage: StorageUsageSummary | undefined;
  }
  let { usage }: Props = $props();

  const trashTotal = $derived(
    Object.values(usage?.trashByArea ?? {}).reduce(
      (sum, entry) => ({ bytes: sum.bytes + entry.bytes, files: sum.files + entry.files }),
      { bytes: 0, files: 0 }
    )
  );

  const rows = $derived(
    usage
      ? [
          { key: 'common', label: '공통', entry: usage.common },
          { key: 'department', label: '조직', entry: usage.department },
          { key: 'personal', label: '개인', entry: usage.personal },
          // 여기는 "전부 합쳐 얼마나 쓰고 있나" 를 보는 자리라 세 영역의 휴지통을 합친다.
          //   (사이드바 배지는 지금 영역의 것이다. 그쪽은 눌러서 보이는 목록과 맞아야 한다.)
          { key: 'trash', label: '휴지통', entry: trashTotal }
        ]
      : []
  );
  const total = $derived(
    usage ? usage.common.bytes + usage.department.bytes + usage.personal.bytes : 0
  );
</script>

<section class="px-1 py-1 lg:border-t lg:border-line lg:px-3 lg:py-3">
  <div class="flex items-baseline gap-2 lg:block">
    <h2 class="text-xs font-semibold text-fg-subtle">사용 용량</h2>
    <p class="text-sm font-semibold text-fg lg:mt-1">{usage ? formatBytes(total) : '-'}</p>
  </div>

  {#if usage}
    <ul class="flex flex-wrap gap-x-3 text-xs lg:mt-2 lg:flex-col lg:gap-1">
      {#each rows as row (row.key)}
        <li class="flex items-baseline gap-1 lg:justify-between lg:gap-2">
          <span class="text-fg-subtle">{row.label}</span>
          <span class="text-fg-subtle">
            {formatBytes(row.entry.bytes)}
            <!-- 파일 수는 넓은 화면에서만. 좁은 화면에서는 한 줄에 담을 값이 이미 많다. -->
            <span class="hidden text-fg-subtle/70 lg:inline">({row.entry.files})</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

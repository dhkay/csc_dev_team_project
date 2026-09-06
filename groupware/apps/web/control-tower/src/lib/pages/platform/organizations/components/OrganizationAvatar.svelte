<script lang="ts">
  // 조직 프로필 이미지(로고) 표시. URL 이 있으면 이미지를, 없으면 이름 이니셜 placeholder 를 보여준다.
  // 목록(테이블/카드), 상세에서 재사용. 크기는 sizeClass 로 호출측이 결정
  interface Props {
    name: string;
    profileImageUrl?: string | null;
    // Tailwind 크기 클래스(정사각). 예: 'h-8 w-8', 'h-16 w-16'
    sizeClass?: string;
    // 이미지 맞춤 방식
    // - 'cover'(기본): 정사각을 가득 채우되 잘릴 수 있음(목록/테이블 아바타)
    // - 'contain': 어떤 비율의 로고든 잘리지 않고 정사각 틀 안에 전부 들어오게(편집 미리보기)
    fit?: 'cover' | 'contain';
  }
  let { name, profileImageUrl = null, sizeClass = 'h-8 w-8', fit = 'cover' }: Props =
    $props();

  const initial = $derived((name ?? '').trim().charAt(0).toUpperCase() || '?');
</script>

{#if profileImageUrl}
  {#if fit === 'contain'}
    <!-- 고정 정사각 틀: 로고 원본 비율 유지하며 틀 안에 전부 들어오게(여백 + 옅은 배경/테두리) -->
    <div
      class="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-50 p-1 ring-1 ring-gray-200 {sizeClass}"
      aria-hidden="true"
    >
      <img src={profileImageUrl} alt="" class="max-h-full max-w-full object-contain" />
    </div>
  {:else}
    <img
      src={profileImageUrl}
      alt=""
      aria-hidden="true"
      class="shrink-0 rounded-md object-cover {sizeClass}"
    />
  {/if}
{:else}
  <div
    class="flex shrink-0 items-center justify-center rounded-md bg-brand/10 font-semibold text-brand {sizeClass}"
    aria-hidden="true"
  >
    {initial}
  </div>
{/if}

<script lang="ts">
  // 조직 로고 선택: 선택 시점엔 업로드하지 않고 메모리 미리보기만 한다(고아 방지)
  // 실제 업로드/영속은 폼 저장 시 부모가 uploadLogo(file) 로 수행하고, 저장 대상은 uploadId 다
  //   value      = 제출용 값 = uploadId(불변). 표시에는 쓰지 않는다(uploadId 는 URL 이 아님)
  //   displayUrl = 기존 로고의 서명 표시 URL(로드 경계가 uploadId→서명URL 로 변환해 내려준 값)
  //   file       = 새로 고른 미저장 파일(저장 시 부모가 업로드해 value=새 uploadId 로 교체)
  import { validateOrgImage, IMAGE_ACCEPT } from '$lib/features/organizations/lib/orgImage';
  import OrganizationAvatar from './OrganizationAvatar.svelte';

  interface Props {
    // 제출용 uploadId(바인딩). 없으면 null.
    value?: string | null;
    // 기존 로고 표시용 서명 URL(읽기 전용). 새 파일 미선택 시 미리보기로 쓴다.
    displayUrl?: string | null;
    // 새로 선택한 미저장 파일(바인딩): 저장 시 부모가 업로드
    file?: File | null;
    // placeholder 이니셜용 조직명
    name?: string;
  }
  let {
    value = $bindable(null),
    displayUrl = null,
    file = $bindable(null),
    name = '',
  }: Props = $props();

  let error = $state('');
  let cleared = $state(false); // '제거' 로 기존 로고를 지웠는지

  // 선택한 파일의 메모리 미리보기 URL: 생성/해제(revoke)를 effect 로 관리
  let previewUrl = $state<string | null>(null);
  $effect(() => {
    if (!file) {
      previewUrl = null;
      return;
    }
    const url = URL.createObjectURL(file);
    previewUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  // 표시값: 새로 고른 미리보기 우선, 없으면(제거 안 했으면) 기존 서명 표시 URL.
  const shown = $derived(previewUrl ?? (cleared ? null : displayUrl));
  // 로고 존재 여부(라벨/제거 버튼): 새 파일 또는 (제거 안 한) 기존 값
  const hasImage = $derived(!!file || (!cleared && !!value));

  function onPick(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = ''; // 같은 파일 재선택 허용
    if (!picked) return;
    const invalid = validateOrgImage(picked);
    if (invalid) {
      error = invalid;
      return;
    }
    error = '';
    cleared = false;
    file = picked; // 업로드는 저장 시
  }

  function remove(): void {
    file = null;
    value = null;
    cleared = true;
    error = '';
  }
</script>

<div class="flex items-center gap-3">
  <OrganizationAvatar {name} profileImageUrl={shown} sizeClass="h-16 w-16" fit="contain" />
  <div class="space-y-1">
    <div class="flex items-center gap-2">
      <label
        class="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <input type="file" accept={IMAGE_ACCEPT} class="hidden" onchange={onPick} />
        {hasImage ? '로고 변경' : '로고 업로드'}
      </label>
      {#if hasImage}
        <button
          type="button"
          onclick={remove}
          class="text-sm text-gray-500 hover:text-red-600 hover:underline"
        >
          제거
        </button>
      {/if}
    </div>
    {#if error}<p class="text-xs text-red-600">{error}</p>{/if}
    <p class="text-xs text-gray-400">JPEG/PNG/GIF/WebP/SVG, 10MB 이하, 저장 시 적용</p>
  </div>
</div>

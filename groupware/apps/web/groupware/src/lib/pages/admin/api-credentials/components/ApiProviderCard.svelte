<script lang="ts">
  // 프로바이더 1개 자격증명 카드: 성격 안내 + 등록 상태 + 입력 폼 + 저장/삭제
  // 저장 시 백엔드가 카탈로그 판정(필수 필드) 후 실검증한다. 확인용 호출 경로가 있는 프로바이더는
  //   발급처에 실호출하고(meta.verification='live'), 없으면 형식 확인까지만이다('format')
  //   실패 사유는 actionError 로 표시된다.
  // 상위가 {#key meta.key} 로 감싸므로 프로바이더를 바꾸면 이 컴포넌트가 다시 만들어진다.
  //   입력 중이던 값이 다른 프로바이더 폼으로 넘어가지 않는다(손으로 비우지 않아도 된다)
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { apiCredentialsService } from '$lib/features/api-credentials/services/apiCredentials.service';
  import {
    API_PROVIDER_KIND_META,
    hasRequiredCredentials,
    requiredCredentialFields,
    type ApiProviderMeta,
    type ApiCredentialView,
    type CredentialFieldSpec
  } from '$lib/features/api-credentials/types';

  interface Props {
    meta: ApiProviderMeta;
    view: ApiCredentialView | undefined;
    loading?: boolean;
  }
  let { meta, view, loading = false }: Props = $props();

  const queryClient = useQueryClient();
  const saveMut = createMutation(() => apiCredentialsService.saveOptions(queryClient));
  const deleteMut = createMutation(() => apiCredentialsService.deleteOptions(queryClient));

  // 입력 폼 상태: 필드 key별 사용자가 입력한 값. 시크릿 필드만 ''로 미리 채운다(존재하는
  //   속성이라 반응성이 확실하다). 저장/삭제 성공 시 비운다(시크릿 값은 다시 표시하지 않는다)
  const emptyValues = (): Record<string, string> =>
    Object.fromEntries(
      meta.credentialFields.filter((f) => f.secret !== false).map((f) => [f.key, ''])
    );
  let values = $state<Record<string, string>>(emptyValues());

  /**
   * 이 필드가 지금 들고 있는 값. 비시크릿 필드는 저장된 값이 기본이라 손대지 않으면 그대로
   * 저장된다(API 키만 교체할 때 음성 id 까지 다시 입력하지 않게)
   *
   * 비시크릿을 `values` 에 미리 채우지 않는 이유는 "안 건드렸다"(undefined)와 "지웠다"('')를
   * 구분하기 위해서다. 미리 ''로 채우면 둘이 같아져 저장된 값으로 되돌아갈 길이 없다.
   */
  function fieldValue(field: CredentialFieldSpec): string {
    if (field.secret === false) return values[field.key] ?? view?.publicValues?.[field.key] ?? '';
    return values[field.key] ?? '';
  }

  function inputType(field: CredentialFieldSpec): 'password' | 'number' | 'text' {
    if (field.kind === 'number') return 'number';
    return field.secret === false ? 'text' : 'password';
  }

  const kindMeta = $derived(API_PROVIDER_KIND_META[meta.kind]);

  // 필드가 다 차야 등록됨이다. 필드가 둘인 플랫폼 키가 한쪽만 채워진 상태를 등록됨으로
  //   보이면, 그 키로는 호출이 계속 실패하는데 화면만 정상으로 보인다. 백엔드의 사용 가능 판정
  //   (listConfiguredProviders)도 같은 함수를 쓴다.
  const registered = $derived(hasRequiredCredentials(meta, view?.configuredFields ?? []));

  const actionError = $derived.by(() => {
    const e = saveMut.isError ? saveMut.error : deleteMut.isError ? deleteMut.error : null;
    if (!e) return null;
    return e instanceof Error ? e.message : '작업에 실패했습니다.';
  });

  // 필수 필드가 채워졌을 때만 저장 가능(비시크릿은 저장된 값도 채워진 것으로 본다). 선택 필드(한도)는
  //   비워도 저장되고, 서버는 빈 값을 미입력으로 버린다.
  const canSave = $derived(
    requiredCredentialFields(meta).every((f) => fieldValue(f).trim() !== '') && !saveMut.isPending
  );

  function save(): void {
    if (!canSave) return;
    const credentials: Record<string, string> = {};
    for (const f of meta.credentialFields) credentials[f.key] = fieldValue(f).trim();
    saveMut.mutate(
      { provider: meta.key, credentials },
      { onSuccess: () => (values = emptyValues()) }
    );
  }

  function remove(): void {
    if (deleteMut.isPending) return;
    deleteMut.mutate(meta.key, { onSuccess: () => (values = emptyValues()) });
  }

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR');
  }
</script>

<article class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
  <!-- 헤더: 이름 + 구분 + 설명 + 등록 배지 -->
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="truncate text-base font-semibold text-gray-900">{meta.label}</h2>
        <span class="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
          {kindMeta.label}
        </span>
        {#if loading}
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">확인 중…</span>
        {:else if registered}
          <span class="rounded-full bg-[#1868db]/10 px-2 py-0.5 text-xs font-medium text-[#1868db]">등록됨</span>
        {:else}
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">미등록</span>
        {/if}
      </div>
      <p class="mt-1 text-sm text-gray-500">{meta.description}</p>
    </div>
    {#if meta.docsUrl}
      <a
        href={meta.docsUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="shrink-0 text-xs text-gray-500 underline decoration-gray-300 underline-offset-2 transition hover:text-gray-800 hover:decoration-gray-600"
      >
        키 발급 ↗
      </a>
    {/if}
  </div>

  <!-- 이 키가 무엇을 열어 주고 사용료가 어디로 청구되는지. 회사 키와 플랫폼 키의 실질적 차이다. -->
  <p class="mt-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-500">
    {kindMeta.description}
  </p>

  {#if registered && view?.updatedAt}
    <p class="mt-2 text-xs text-gray-400">마지막 저장: {formatDate(view.updatedAt)}</p>
  {/if}

  <!-- 입력 폼 -->
  <div class="mt-4 space-y-3">
    {#each meta.credentialFields as field (field.key)}
      {@const isSecret = field.secret !== false}
      <label class="block">
        <span class="mb-1 block text-sm font-medium text-gray-700">
          {field.label}
          {#if field.optional}
            <span class="font-normal text-gray-400">(선택)</span>
          {/if}
        </span>
        <input
          type={inputType(field)}
          min={field.kind === 'number' ? 1 : undefined}
          autocomplete="off"
          spellcheck="false"
          value={fieldValue(field)}
          oninput={(e) => (values[field.key] = e.currentTarget.value)}
          placeholder={isSecret && registered ? '변경하려면 새 값 입력' : (field.placeholder ?? '')}
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-[#1868db] focus:outline-none focus:ring-2 focus:ring-[#1868db]/15"
        />
        {#if field.hint}
          <span class="mt-1 block text-xs leading-snug text-gray-400">{field.hint}</span>
        {/if}
      </label>
    {/each}

    {#if meta.credentialFields.length > 1}
      <p class="text-xs text-gray-400">필수 항목을 모두 입력해야 저장되며, 저장 시 함께 교체됩니다.</p>
    {/if}

    {#if actionError}
      <p class="text-xs text-red-600" role="alert">{actionError}</p>
      {#if saveMut.isError && meta.verification === 'live'}
        <!-- 저장은 키를 발급처에 실검증하므로, 실패는 키 오타뿐 아니라 계정 크레딧 소진일 때도 난다.
             발급처가 두 경우를 같은 응답으로 주면 구분이 불가능하므로 둘 다 안내한다. -->
        <p class="text-xs text-gray-500">
          키 값이 정확한지, 그리고 발급처 계정에 사용 가능한 크레딧/결제 수단이 남아 있는지 확인해 주세요.
        </p>
      {/if}
    {:else if saveMut.isSuccess}
      <!-- 확인하지 않은 키를 "검증되었습니다" 라고 말하지 않는다. 그 말을 믿은 사람은 생성이
           실패할 때까지 키가 맞다고 생각한다. -->
      {#if meta.verification === 'live'}
        <p class="text-xs text-[#1868db]">저장되었습니다. 키가 검증되어 암호화 저장되었습니다.</p>
      {:else}
        <p class="text-xs text-[#1868db]">
          저장되었습니다. 이 프로바이더는 확인용 호출 경로가 없어 입력 형식만 확인했으며, 키가 실제로
          유효한지는 사용 시점에 드러납니다.
        </p>
      {/if}
    {/if}

    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={save}
        disabled={!canSave}
        class="rounded-lg bg-[#1868db] px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1868db]/40 disabled:opacity-50"
      >
        {saveMut.isPending
          ? meta.verification === 'live'
            ? '검증 중…'
            : '저장 중…'
          : registered
            ? '키 교체'
            : '등록'}
      </button>
      {#if registered}
        <button
          type="button"
          onclick={remove}
          disabled={deleteMut.isPending}
          class="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40 disabled:opacity-50"
        >
          {deleteMut.isPending ? '삭제 중…' : '등록 해제'}
        </button>
      {/if}
    </div>
  </div>
</article>

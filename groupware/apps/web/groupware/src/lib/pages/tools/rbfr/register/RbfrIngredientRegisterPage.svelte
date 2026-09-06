<script lang="ts">
	// RBFR 연구: 원료 등록(7단계 두 번째 조각). 02_화면구성.md 탭3 "원료 기본정보" +
	// "직접 역할 기여도"의 핵심만 우선 연결한다. 성분사전(MFDS) 자동 채움, CAS/인증/규제/무첨가
	// 등 나머지 세부 서브폼은 이후 조각(9단계 외부연동과도 겹치는 부분은 특히 나중으로 미룬다).
	import { page } from '$app/state';
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';

	const profileCode = $derived(page.url.searchParams.get('profileCode') ?? 'SKIN');
	const domainsQuery = createQuery(() => rbfrService.directDomains(profileCode));

	let inciName = $state('');
	let nameKo = $state('');
	let category = $state('');
	let concMin = $state<number | undefined>(undefined);
	let concMax = $state<number | undefined>(undefined);
	let phMin = $state<number | undefined>(undefined);
	let phMax = $state<number | undefined>(undefined);
	let hlb = $state<number | undefined>(undefined);
	let emulsionRole = $state('');
	let solubility = $state('');
	let isBase = $state(false);
	let contributions = $state<Record<string, number>>({});

	const registerMutation = createMutation(() => rbfrService.registerIngredient());

	function submit() {
		const domains = domainsQuery.data ?? [];
		registerMutation.mutate({
			inciName,
			nameKo,
			category: category || undefined,
			concMin,
			concMax,
			phMin,
			phMax,
			hlb,
			emulsionRole: emulsionRole || undefined,
			solubility: solubility || undefined,
			isBase,
			contributions: domains.map((domainCode) => ({
				domainCode,
				contribution: contributions[domainCode] ?? 0
			}))
		});
	}
</script>

<div class="mx-auto max-w-2xl p-8">
	<header class="mb-6">
		<p class="text-xs text-gray-400">RBFR 연구</p>
		<h1 class="text-xl font-bold text-gray-900">원료 등록</h1>
		<p class="mt-1 text-sm text-gray-500">Profile {profileCode}</p>
	</header>

	<form
		class="space-y-4 rounded-lg border border-gray-200 p-5"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<div class="grid grid-cols-2 gap-4">
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">원료명(한글)</span>
				<input class="w-full rounded border border-gray-300 p-2" bind:value={nameKo} required />
			</label>
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">INCI명</span>
				<input class="w-full rounded border border-gray-300 p-2" bind:value={inciName} required />
			</label>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">기능 카테고리</span>
				<input class="w-full rounded border border-gray-300 p-2" bind:value={category} />
			</label>
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">용해성</span>
				<select class="w-full rounded border border-gray-300 p-2" bind:value={solubility}>
					<option value="">선택 안 함</option>
					<option value="water_soluble">수용성(water_soluble)</option>
					<option value="oil_soluble">유용성(oil_soluble)</option>
					<option value="both">둘 다(both)</option>
					<option value="dispersible">분산형(dispersible)</option>
				</select>
			</label>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">권장 농도 하한(%)</span>
				<input
					type="number"
					step="0.0001"
					class="w-full rounded border border-gray-300 p-2"
					bind:value={concMin}
				/>
			</label>
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">권장 농도 상한(%)</span>
				<input
					type="number"
					step="0.0001"
					class="w-full rounded border border-gray-300 p-2"
					bind:value={concMax}
				/>
			</label>
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">pH 하한</span>
				<input
					type="number"
					step="0.01"
					class="w-full rounded border border-gray-300 p-2"
					bind:value={phMin}
				/>
			</label>
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">pH 상한</span>
				<input
					type="number"
					step="0.01"
					class="w-full rounded border border-gray-300 p-2"
					bind:value={phMax}
				/>
			</label>
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">HLB(유화제인 경우)</span>
				<input
					type="number"
					step="0.01"
					class="w-full rounded border border-gray-300 p-2"
					bind:value={hlb}
				/>
			</label>
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">유화 역할</span>
				<input class="w-full rounded border border-gray-300 p-2" bind:value={emulsionRole} />
			</label>
		</div>

		<label class="flex items-center gap-2 text-sm text-gray-600">
			<input type="checkbox" bind:checked={isBase} />
			기제(정제수 등) 여부
		</label>

		<div>
			<h2 class="mb-2 text-sm font-bold text-gray-700">직접 역할 기여도(0~100, 독립값)</h2>
			{#if domainsQuery.isPending}
				<p class="text-xs text-gray-400">역할 도메인을 불러오는 중...</p>
			{:else if domainsQuery.isError}
				<p class="text-xs text-red-600">역할 도메인을 불러오지 못했습니다.</p>
			{:else}
				<div class="grid grid-cols-2 gap-3">
					{#each domainsQuery.data as domainCode (domainCode)}
						<label class="block text-sm">
							<span class="mb-1 block text-gray-600">{domainCode}</span>
							<input
								type="number"
								min="0"
								max="100"
								class="w-full rounded border border-gray-300 p-2"
								value={contributions[domainCode] ?? 0}
								oninput={(e) =>
									(contributions[domainCode] = Number((e.target as HTMLInputElement).value))}
							/>
						</label>
					{/each}
				</div>
			{/if}
			<p class="mt-2 text-xs text-gray-400">
				통합역할(균형)은 여기서 입력하지 않는다. 처방 단위로 별도 근거와 함께 채운다.
			</p>
		</div>

		<button
			type="submit"
			class="rounded bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
			disabled={registerMutation.isPending}
		>
			{registerMutation.isPending ? '등록 중...' : '등록'}
		</button>

		{#if registerMutation.isSuccess}
			<p class="text-sm text-emerald-700">
				등록되었습니다(원료 ID {registerMutation.data.ingredientId}).
			</p>
		{/if}
		{#if registerMutation.isError}
			<p class="text-sm text-red-600">{registerMutation.error?.message ?? '등록에 실패했습니다.'}</p>
		{/if}
	</form>
</div>

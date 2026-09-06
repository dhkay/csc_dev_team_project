<script lang="ts">
	// RBFR 연구: 처방 생성(7단계 세 번째 조각). 02_화면구성.md 탭1 "정방향 계산"의 입력부만
	// 우선 연결한다. 지금은 프로젝트 선택 화면이 없어 처방을 만들 때마다 새 프로젝트도 함께
	// 만든다(임시 단순화, rbfr/develop_status.md "확인 필요" 참고).
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';

	const profileCode = $derived(page.url.searchParams.get('profileCode') ?? 'SKIN');
	const ingredientsQuery = createQuery(() => rbfrService.ingredients());

	let projectName = $state('');
	let formulaName = $state('');
	/** ingredientId → 배합비(%). 0이거나 비어있으면 처방에서 제외한다. */
	let percents = $state<Record<number, number>>({});

	const createMutationResult = createMutation(() => rbfrService.createFormula());

	function totalPercent(): number {
		return Object.values(percents).reduce((sum, v) => sum + (v || 0), 0);
	}

	function submit() {
		const ingredients = Object.entries(percents)
			.filter(([, pct]) => pct > 0)
			.map(([ingredientId, actualPct]) => ({ ingredientId: Number(ingredientId), actualPct }));

		createMutationResult.mutate(
			{ projectName, formulaName, ingredients },
			{
				onSuccess: (result) => {
					void goto(`/${page.params.orgSlug}/tools/rbfr?formulaId=${result.formulaId}&profileCode=${profileCode}`);
				}
			}
		);
	}
</script>

<div class="mx-auto max-w-2xl p-8">
	<header class="mb-6">
		<p class="text-xs text-gray-400">RBFR 연구</p>
		<h1 class="text-xl font-bold text-gray-900">처방 생성</h1>
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
				<span class="mb-1 block text-gray-600">프로젝트명</span>
				<input class="w-full rounded border border-gray-300 p-2" bind:value={projectName} required />
			</label>
			<label class="block text-sm">
				<span class="mb-1 block text-gray-600">처방명</span>
				<input class="w-full rounded border border-gray-300 p-2" bind:value={formulaName} required />
			</label>
		</div>

		<div>
			<div class="mb-2 flex items-center justify-between">
				<h2 class="text-sm font-bold text-gray-700">원료 선택 및 배합비율</h2>
				<span class="text-xs {totalPercent() > 100 ? 'text-red-600' : 'text-gray-400'}">
					합계 {totalPercent()}%
				</span>
			</div>
			{#if ingredientsQuery.isPending}
				<p class="text-xs text-gray-400">원료 목록을 불러오는 중...</p>
			{:else if ingredientsQuery.isError}
				<p class="text-xs text-red-600">원료 목록을 불러오지 못했습니다.</p>
			{:else if ingredientsQuery.data.length === 0}
				<p class="text-xs text-gray-400">
					등록된 원료가 없습니다. 먼저 "원료 등록" 화면에서 원료를 추가해주세요.
				</p>
			{:else}
				<div class="space-y-2">
					{#each ingredientsQuery.data as ingredient (ingredient.id)}
						<div class="flex items-center gap-3 rounded border border-gray-200 p-2">
							<div class="flex-1 text-sm">
								<div class="font-medium text-gray-800">{ingredient.nameKo}</div>
								<div class="text-xs text-gray-400">{ingredient.inciName}</div>
							</div>
							<input
								type="number"
								min="0"
								max="100"
								step="0.01"
								class="w-24 rounded border border-gray-300 p-2 text-right text-sm"
								value={percents[ingredient.id] ?? 0}
								oninput={(e) =>
									(percents[ingredient.id] = Number((e.target as HTMLInputElement).value))}
							/>
							<span class="text-xs text-gray-400">%</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<button
			type="submit"
			class="rounded bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
			disabled={createMutationResult.isPending}
		>
			{createMutationResult.isPending ? '생성 중...' : '처방 생성'}
		</button>

		{#if createMutationResult.isError}
			<p class="text-sm text-red-600">
				{createMutationResult.error?.message ?? '처방 생성에 실패했습니다.'}
			</p>
		{/if}
	</form>
</div>

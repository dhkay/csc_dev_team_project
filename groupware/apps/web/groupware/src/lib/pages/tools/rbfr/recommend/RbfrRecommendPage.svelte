<script lang="ts">
	// RBFR 연구: 역방향 추천(7단계 네 번째 조각). 02_화면구성.md 탭2 "역방향 추천"의 핵심만
	// 우선 연결한다. 목표 역할 비중(직접역할, 합 100) 슬라이더 → 근접도 상위 10개 원료 +
	// 제외 목록(BAN/NODATA, 사유 표시)을 그대로 보여준다.
	import { page } from '$app/state';
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';

	const profileCode = $derived(page.url.searchParams.get('profileCode') ?? 'SKIN');
	const domainsQuery = createQuery(() => rbfrService.directDomains(profileCode));

	/** domainCode → 목표 비중(%). */
	let targetPercents = $state<Record<string, number>>({});

	const recommendMutation = createMutation(() => rbfrService.recommendIngredients());

	function totalPercent(): number {
		return Object.values(targetPercents).reduce((sum, v) => sum + (v || 0), 0);
	}

	function submit() {
		const domains = domainsQuery.data ?? [];
		const targetRatios = domains.map((domainCode) => ({
			domainCode,
			targetPercent: targetPercents[domainCode] ?? 0
		}));
		recommendMutation.mutate(targetRatios);
	}
</script>

<div class="mx-auto max-w-2xl p-8">
	<header class="mb-6">
		<p class="text-xs text-gray-400">RBFR 연구</p>
		<h1 class="text-xl font-bold text-gray-900">역방향 추천</h1>
		<p class="mt-1 text-sm text-gray-500">Profile {profileCode}</p>
	</header>

	<div class="space-y-4 rounded-lg border border-gray-200 p-5">
		<div>
			<h2 class="mb-2 text-sm font-bold text-gray-700">목표 역할 비중(%, 합 100)</h2>
			{#if domainsQuery.isPending}
				<p class="text-xs text-gray-400">역할 도메인을 불러오는 중...</p>
			{:else if domainsQuery.isError}
				<p class="text-xs text-red-600">역할 도메인을 불러오지 못했습니다.</p>
			{:else}
				<div class="space-y-3">
					{#each domainsQuery.data as domainCode (domainCode)}
						<label class="block text-sm">
							<span class="mb-1 flex justify-between text-gray-600">
								<span>{domainCode}</span>
								<span>{targetPercents[domainCode] ?? 0}%</span>
							</span>
							<input
								type="range"
								min="0"
								max="100"
								class="w-full"
								value={targetPercents[domainCode] ?? 0}
								oninput={(e) =>
									(targetPercents[domainCode] = Number((e.target as HTMLInputElement).value))}
							/>
						</label>
					{/each}
				</div>
				<p class="mt-2 text-xs" class:text-red-600={totalPercent() !== 100} class:text-gray-400={totalPercent() === 100}>
					합계 {totalPercent()}% (100%을 권장하며, 다르면 계산 시 자동 정규화된다)
				</p>
			{/if}
		</div>

		<button
			type="button"
			class="rounded bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
			disabled={recommendMutation.isPending || domainsQuery.isPending}
			onclick={submit}
		>
			{recommendMutation.isPending ? '계산 중...' : '추천 계산'}
		</button>

		{#if recommendMutation.isError}
			<p class="text-sm text-red-600">
				{recommendMutation.error?.message ?? '추천 계산에 실패했습니다.'}
			</p>
		{/if}

		{#if recommendMutation.isSuccess}
			{@const result = recommendMutation.data}
			<div class="space-y-4">
				<div>
					<h2 class="mb-2 text-sm font-bold text-gray-700">추천 원료(근접도 상위 {result.recommendations.length}개)</h2>
					{#if result.recommendations.length === 0}
						<p class="text-xs text-gray-400">추천할 원료가 없습니다.</p>
					{:else}
						<ul class="space-y-2">
							{#each result.recommendations as rec (rec.ingredientId)}
								<li class="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm">
									<span>{rec.nameKo} <span class="text-gray-400">({rec.inciName})</span></span>
									<span class="font-bold text-gray-900">{rec.proximityPercent.toFixed(1)}%</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				{#if result.excluded.length > 0}
					<div>
						<h2 class="mb-2 text-sm font-bold text-gray-700">제외된 원료</h2>
						<ul class="space-y-1">
							{#each result.excluded as ex (ex.ingredientId)}
								<li class="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
									<span>{ex.nameKo}</span>
									<span class="text-xs font-bold text-amber-700">
										{ex.reason === 'BAN' ? '규제 금지(BAN)' : '확정 규제 데이터 없음(NODATA)'}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

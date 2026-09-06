<script lang="ts">
	// 원료 등록 화면 부속: 원료쌍 조합계수(시너지/충돌)와 병용금기(BLOCK/WARN). 이미 등록된
	// 원료끼리의 관계라 특정 원료 하나에 종속되지 않고, 원료 선택 드롭다운으로 A/B를 고른다.
	// 목록은 방금 선택한 원료(A) 관점으로 조회한다(양방향 검색, 03번 문서).
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';

	interface Props {
		profileCode: string;
	}
	let { profileCode }: Props = $props();

	const qc = useQueryClient();
	const ingredientsQuery = createQuery(() => rbfrService.ingredients());
	const domainsQuery = createQuery(() => rbfrService.directDomains(profileCode));

	let ingredientAId = $state<number | undefined>(undefined);
	let ingredientBId = $state<number | undefined>(undefined);

	const interactionsQuery = createQuery(() => rbfrService.ingredientInteractions(ingredientAId ?? 0));
	const incompatQuery = createQuery(() => rbfrService.ingredientIncompat(ingredientAId ?? 0));

	function ingredientName(id: number): string {
		return ingredientsQuery.data?.find((i) => i.id === id)?.nameKo ?? `#${id}`;
	}

	// 조합계수
	let interactionDomain = $state('');
	let interactionType = $state<'synergy' | 'conflict' | 'neutral' | 'unknown'>('synergy');
	let coefficient = $state(1);
	const addInteractionMutation = createMutation(() => rbfrService.addIngredientInteraction(qc));
	function submitInteraction() {
		if (!ingredientAId || !ingredientBId || !interactionDomain) return;
		addInteractionMutation.mutate({
			ingredientAId,
			ingredientBId,
			domainCode: interactionDomain,
			interactionType,
			coefficient
		});
	}

	// 병용금기
	let severity = $state<'BLOCK' | 'WARN'>('WARN');
	let reason = $state('');
	const addIncompatMutation = createMutation(() => rbfrService.addIngredientIncompat(qc));
	function submitIncompat() {
		if (!ingredientAId || !ingredientBId) return;
		addIncompatMutation.mutate(
			{ ingredientId: ingredientAId, otherId: ingredientBId, severity, reason: reason || undefined },
			{ onSuccess: () => (reason = '') }
		);
	}
</script>

<div class="mt-6 space-y-5 border-t border-gray-200 pt-6">
	<h2 class="text-sm font-bold text-gray-700">원료쌍(조합계수·병용금기)</h2>
	<p class="text-xs text-gray-400">이미 등록된 원료 두 개를 골라 관계를 등록한다.</p>

	<div class="grid grid-cols-2 gap-4">
		<label class="block text-sm">
			<span class="mb-1 block text-gray-600">원료 A</span>
			<select class="w-full rounded border border-gray-300 p-2" bind:value={ingredientAId}>
				<option value={undefined}>선택</option>
				{#each ingredientsQuery.data ?? [] as ing (ing.id)}
					<option value={ing.id}>{ing.nameKo}</option>
				{/each}
			</select>
		</label>
		<label class="block text-sm">
			<span class="mb-1 block text-gray-600">원료 B</span>
			<select class="w-full rounded border border-gray-300 p-2" bind:value={ingredientBId}>
				<option value={undefined}>선택</option>
				{#each ingredientsQuery.data ?? [] as ing (ing.id)}
					<option value={ing.id}>{ing.nameKo}</option>
				{/each}
			</select>
		</label>
	</div>

	<section>
		<h3 class="mb-2 text-xs font-bold text-gray-600">조합계수(시너지/충돌)</h3>
		<div class="grid grid-cols-3 gap-2">
			<select class="rounded border border-gray-300 p-2 text-sm" bind:value={interactionDomain}>
				<option value="">역할 선택</option>
				{#each domainsQuery.data ?? [] as domainCode (domainCode)}
					<option value={domainCode}>{domainCode}</option>
				{/each}
			</select>
			<select class="rounded border border-gray-300 p-2 text-sm" bind:value={interactionType}>
				<option value="synergy">synergy</option>
				<option value="conflict">conflict</option>
				<option value="neutral">neutral</option>
				<option value="unknown">unknown</option>
			</select>
			<input type="number" step="0.01" class="rounded border border-gray-300 p-2 text-sm" bind:value={coefficient} />
		</div>
		<button
			type="button"
			class="mt-2 rounded bg-gray-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
			disabled={addInteractionMutation.isPending || !ingredientAId || !ingredientBId || !interactionDomain}
			onclick={submitInteraction}
		>
			추가
		</button>
		{#if addInteractionMutation.isError}
			<p class="mt-1 text-xs text-red-600">{addInteractionMutation.error?.message}</p>
		{/if}
		{#if ingredientAId && interactionsQuery.data && interactionsQuery.data.length > 0}
			<ul class="mt-2 space-y-1">
				{#each interactionsQuery.data as entry (entry.id)}
					<li class="rounded border border-gray-200 px-2 py-1 text-xs">
						{ingredientName(entry.ingredientAId)} × {ingredientName(entry.ingredientBId)} — {entry.domainCode}
						{entry.interactionType} ({entry.coefficient})
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h3 class="mb-2 text-xs font-bold text-gray-600">병용금기</h3>
		<div class="grid grid-cols-2 gap-2">
			<select class="rounded border border-gray-300 p-2 text-sm" bind:value={severity}>
				<option value="WARN">WARN(경고만)</option>
				<option value="BLOCK">BLOCK(확정 불가)</option>
			</select>
			<input class="rounded border border-gray-300 p-2 text-sm" placeholder="사유" bind:value={reason} />
		</div>
		<button
			type="button"
			class="mt-2 rounded bg-gray-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
			disabled={addIncompatMutation.isPending || !ingredientAId || !ingredientBId}
			onclick={submitIncompat}
		>
			추가
		</button>
		{#if addIncompatMutation.isError}
			<p class="mt-1 text-xs text-red-600">{addIncompatMutation.error?.message}</p>
		{/if}
		{#if ingredientAId && incompatQuery.data && incompatQuery.data.length > 0}
			<ul class="mt-2 space-y-1">
				{#each incompatQuery.data as entry (entry.otherId)}
					<li class="rounded border border-gray-200 px-2 py-1 text-xs">
						{ingredientName(ingredientAId)} × {ingredientName(entry.otherId)} —
						<span class="font-bold" class:text-red-600={entry.severity === 'BLOCK'}>
							{entry.severity}
						</span>
						{#if entry.reason}({entry.reason}){/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

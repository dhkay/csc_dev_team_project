<script lang="ts">
	// 02_화면구성.md "처방 사용감·안정성 기록"(탭1 부속). 계산이 아니라 실험/관능평가 기록이며,
	// lab_test가 아니면 예측값 배지를 단다(05번 문서). 척도(0~100)는 확인 필요로 남아 있다
	// (rbfr-formula-sensory-stability.types.ts 참고).
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';
	import type { FormulaSensoryStabilityInput } from '$lib/features/rbfr/types';

	interface Props {
		formulaId: number;
	}
	let { formulaId }: Props = $props();

	const qc = useQueryClient();
	const recordsQuery = createQuery(() => rbfrService.sensoryStability(formulaId));
	const addMutation = createMutation(() => rbfrService.addSensoryStabilityRecord(qc, formulaId));

	let form = $state<FormulaSensoryStabilityInput>({ dataSource: 'manual_estimate' });

	const SCORE_FIELDS: [keyof FormulaSensoryStabilityInput, string][] = [
		['stickinessScore', '끈적임'],
		['freshnessScore', '산뜻함'],
		['absorptionScore', '흡수감'],
		['spreadabilityScore', '발림성'],
		['afterfeelScore', '잔여감'],
		['viscosityScore', '점도'],
		['phStabilityScore', 'pH 안정성'],
		['heatStabilityScore', '고온 안정성'],
		['lowTempStabilityScore', '저온 안정성'],
		['overallStabilityScore', '종합 안정성']
	];

	const RISK_FIELDS: [keyof FormulaSensoryStabilityInput, string][] = [
		['separationRisk', '분리 위험'],
		['precipitationRisk', '침전 위험'],
		['colorChangeRisk', '변색 위험'],
		['odorChangeRisk', '변취 위험']
	];

	function submit() {
		addMutation.mutate(form, { onSuccess: () => (form = { dataSource: 'manual_estimate' }) });
	}
</script>

<section class="mt-6 rounded-lg border border-gray-200 p-5">
	<h2 class="mb-3 text-sm font-bold text-gray-700">처방 사용감·안정성 기록</h2>

	<div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
		{#each SCORE_FIELDS as [key, label] (key)}
			<label class="block text-xs">
				<span class="mb-1 block text-gray-600">{label}(0~100)</span>
				<input
					type="number"
					min="0"
					max="100"
					class="w-full rounded border border-gray-300 p-2 text-sm"
					value={form[key] ?? ''}
					oninput={(e) => {
						const raw = (e.target as HTMLInputElement).value;
						(form as Record<string, unknown>)[key] = raw === '' ? undefined : Number(raw);
					}}
				/>
			</label>
		{/each}
	</div>

	<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each RISK_FIELDS as [key, label] (key)}
			<label class="block text-xs">
				<span class="mb-1 block text-gray-600">{label}</span>
				<select
					class="w-full rounded border border-gray-300 p-2 text-sm"
					value={form[key] ?? ''}
					onchange={(e) => {
						const raw = (e.target as HTMLSelectElement).value;
						(form as Record<string, unknown>)[key] = raw === '' ? undefined : raw;
					}}
				>
					<option value="">미확인</option>
					<option value="하">하</option>
					<option value="중">중</option>
					<option value="상">상</option>
				</select>
			</label>
		{/each}
	</div>

	<div class="mt-3 grid grid-cols-2 gap-3">
		<label class="block text-xs">
			<span class="mb-1 block text-gray-600">근거 출처</span>
			<select
				class="w-full rounded border border-gray-300 p-2 text-sm"
				bind:value={form.dataSource}
			>
				<option value="lab_test">실측(lab_test)</option>
				<option value="manual_estimate">수동 추정</option>
				<option value="literature">문헌</option>
				<option value="expert_review">전문가 검토</option>
				<option value="unknown">미확인</option>
			</select>
		</label>
		<label class="block text-xs">
			<span class="mb-1 block text-gray-600">시험 조건</span>
			<input class="w-full rounded border border-gray-300 p-2 text-sm" bind:value={form.testCondition} />
		</label>
	</div>

	<button
		type="button"
		class="mt-3 rounded bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
		disabled={addMutation.isPending}
		onclick={submit}
	>
		{addMutation.isPending ? '기록 중...' : '기록 추가'}
	</button>
	{#if addMutation.isError}
		<p class="mt-2 text-sm text-red-600">{addMutation.error?.message}</p>
	{/if}

	{#if recordsQuery.data && recordsQuery.data.length > 0}
		<ul class="mt-4 space-y-2">
			{#each recordsQuery.data as record (record.id)}
				<li class="rounded border border-gray-200 px-3 py-2 text-xs">
					<span
						class="mr-2 rounded-full px-2 py-0.5 font-bold"
						class:bg-emerald-50={record.dataSource === 'lab_test'}
						class:text-emerald-700={record.dataSource === 'lab_test'}
						class:bg-amber-50={record.dataSource !== 'lab_test'}
						class:text-amber-700={record.dataSource !== 'lab_test'}
					>
						{record.dataSource === 'lab_test' ? '실측값' : '예측값'}
					</span>
					종합 안정성 {record.overallStabilityScore ?? '-'} · 분리위험 {record.separationRisk ?? '-'}
					· {record.createdAt.slice(0, 10)}
				</li>
			{/each}
		</ul>
	{/if}
</section>

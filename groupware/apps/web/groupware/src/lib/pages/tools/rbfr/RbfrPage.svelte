<script lang="ts">
	// RBFR 연구: 정방향 계산 결과 화면(7단계 첫 조각). formulaId/profileCode는 아직 처방
	// 목록/생성 화면이 없어 URL 쿼리로 받는다(예: ?formulaId=1&profileCode=SKIN). 처방 생성/원료
	// 등록 화면은 이후 조각에서 추가한다(rbfr/develop_status.md "다음 작업" 참고).
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';
	import type { RatioResult } from '$lib/features/rbfr/types';

	const formulaId = $derived(Number(page.url.searchParams.get('formulaId') ?? '0'));
	const profileCode = $derived(page.url.searchParams.get('profileCode') ?? 'SKIN');

	const calcQuery = createQuery(() => rbfrService.formulaCalculation(formulaId, profileCode));

	function ratioFor(domainCode: string, ratios: RatioResult[]): RatioResult | undefined {
		return ratios.find((r) => r.domainCode === domainCode);
	}

	/** 통합역할(균형) 비중값. directResults에 없는 domainCode가 있으면 그게 통합역할이다(근거가 있어 포함된 경우). */
	function integratedRatioOf(
		directResults: { domainCode: string }[],
		ratios: RatioResult[]
	): RatioResult | undefined {
		return ratios.find((r) => !directResults.some((d) => d.domainCode === r.domainCode));
	}

	function severityClass(severity: string): string {
		if (severity === 'block') return 'border-red-500 bg-red-50 text-red-700';
		if (severity === 'warn') return 'border-amber-500 bg-amber-50 text-amber-700';
		return 'border-emerald-500 bg-emerald-50 text-emerald-700';
	}
</script>

<div class="mx-auto max-w-4xl p-8">
	<header class="mb-6">
		<p class="text-xs text-gray-400">RBFR 연구</p>
		<h1 class="text-xl font-bold text-gray-900">정방향 계산</h1>
		<p class="mt-1 text-sm text-gray-500">처방 ID {formulaId || '-'} · Profile {profileCode}</p>
	</header>

	{#if formulaId <= 0}
		<p class="text-sm text-gray-500">
			URL에 처방 ID와 Profile을 쿼리로 넣어주세요. 예: <code>?formulaId=1&profileCode=SKIN</code>
		</p>
	{:else if calcQuery.isPending}
		<p class="text-sm text-gray-500">계산 중...</p>
	{:else if calcQuery.isError}
		<p class="text-sm text-red-600">{calcQuery.error?.message ?? '계산에 실패했습니다.'}</p>
	{:else if calcQuery.data}
		{@const result = calcQuery.data}

		<section class="mb-6 rounded-lg border border-gray-200 p-5">
			<h2 class="mb-3 text-sm font-bold text-gray-700">역할 도메인 결과</h2>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
				{#each result.directResults as direct (direct.domainCode)}
					{@const ratio = ratioFor(direct.domainCode, result.ratios)}
					<div class="rounded border border-gray-200 p-3 text-center">
						<div class="text-xs text-gray-500">{direct.domainCode}</div>
						<div class="text-lg font-bold text-gray-900">{Math.round(direct.finalValue)}</div>
						<div class="text-xs text-gray-400">
							{ratio ? `${ratio.ratioPercent.toFixed(1)}%` : '-'}
						</div>
					</div>
				{/each}
				{#if integratedRatioOf(result.directResults, result.ratios)}
					{@const integratedRatio = integratedRatioOf(result.directResults, result.ratios)!}
					<div class="rounded border border-gray-200 p-3 text-center">
						<div class="text-xs text-gray-500">{integratedRatio.domainCode}(통합)</div>
						<div class="text-lg font-bold text-gray-900">{Math.round(integratedRatio.efficacy)}</div>
						<div class="text-xs text-gray-400">{integratedRatio.ratioPercent.toFixed(1)}%</div>
					</div>
				{:else}
					<div class="rounded border border-dashed border-gray-300 p-3 text-center text-gray-400">
						<div class="text-xs">균형(통합)</div>
						<div class="text-sm">미입력</div>
					</div>
				{/if}
			</div>
			<p class="mt-3 text-xs text-gray-400">
				굵은 숫자 = 효능값(절대 강도) · 아래 %는 비중값(직접역할 합계 대비 상대 비율)
			</p>
		</section>

		<section class="mb-6 rounded-lg border border-gray-200 p-5">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-bold text-gray-700">처방 검증 결과</h2>
				<span
					class="rounded-full px-3 py-1 text-xs font-bold {result.validation.canConfirm
						? 'bg-emerald-50 text-emerald-700'
						: 'bg-red-50 text-red-700'}"
				>
					{result.validation.canConfirm ? '확정 가능' : '확정 불가'}
				</span>
			</div>
			<div class="space-y-2">
				{#each result.validation.issues as issue (issue.code + issue.message)}
					<div class="rounded border-l-4 p-2 text-xs {severityClass(issue.severity)}">
						{issue.message}
					</div>
				{/each}
				{#if result.validation.issues.length === 0}
					<p class="text-xs text-gray-400">검증 이슈 없음.</p>
				{/if}
			</div>
			<div class="mt-4 flex gap-6 text-xs text-gray-500">
				<span>HLB: {result.validation.hlb.message}</span>
				<span>원가(1g): {result.validation.cost.toFixed(1)}원</span>
			</div>
		</section>
	{/if}
</div>

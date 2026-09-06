<script lang="ts">
	// 05_스코어링엔진.md 원칙7 "확정 후 불변" — 검수 승인 시 만들어진 버전 스냅샷 이력을
	// 읽기 전용으로 보여준다. 이 화면에서 스냅샷을 만들거나 고치지 않는다(검수 승인 시
	// 서버가 자동으로 만든다, FormulaReviewSection 참고).
	import { createQuery } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';

	interface Props {
		formulaId: number;
	}
	let { formulaId }: Props = $props();

	const versionsQuery = createQuery(() => rbfrService.formulaVersions(formulaId));
</script>

{#if versionsQuery.data && versionsQuery.data.length > 0}
	<section class="mt-6 rounded-lg border border-gray-200 p-5">
		<h2 class="mb-3 text-sm font-bold text-gray-700">확정 버전 이력</h2>
		<ul class="space-y-2">
			{#each versionsQuery.data as version (version.id)}
				<li class="rounded border border-gray-200 px-3 py-2 text-xs">
					<span class="mr-2 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
						v{version.versionNo}
					</span>
					확정 {version.fixedAt.slice(0, 10)} · 총 {version.totalCells ?? '-'}칸 · 원가
					{version.totalCost !== undefined ? `${version.totalCost.toFixed(1)}원` : '-'}
					({version.ruleVersion ?? '규칙 없음'})
				</li>
			{/each}
		</ul>
	</section>
{/if}

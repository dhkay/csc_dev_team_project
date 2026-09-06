<script lang="ts">
	// 8단계(관리자/검증 워크플로우) — 02_화면구성.md 사용자 권한표 "DESIGNER: 처방 생성·설계·
	// 산출·검수 요청". DRAFT/CALC 상태의 처방만 검수를 요청할 수 있다(서버가 강제). 인증 연동
	// 전까지는 요청자 ID를 직접 입력받는다(임시, rbfr/develop_status.md 참고).
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';

	interface Props {
		formulaId: number;
	}
	let { formulaId }: Props = $props();

	const qc = useQueryClient();
	const reviewsQuery = createQuery(() => rbfrService.formulaReviews(formulaId));
	const requestMutation = createMutation(() => rbfrService.requestReview(qc, formulaId));

	let requestedBy = $state(1);

	function submit() {
		requestMutation.mutate(requestedBy);
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'PENDING':
				return '대기 중';
			case 'REVIEWING':
				return '검수 중';
			case 'APPROVED':
				return '승인';
			case 'CHANGES':
				return '수정요청';
			case 'REJECTED':
				return '반려';
			default:
				return status;
		}
	}
</script>

<section class="mt-6 rounded-lg border border-gray-200 p-5">
	<h2 class="mb-3 text-sm font-bold text-gray-700">검수</h2>
	<div class="flex items-end gap-2">
		<label class="block text-sm">
			<span class="mb-1 block text-gray-600">요청자 ID(임시)</span>
			<input
				type="number"
				class="w-24 rounded border border-gray-300 p-2"
				bind:value={requestedBy}
			/>
		</label>
		<button
			type="button"
			class="rounded bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
			disabled={requestMutation.isPending}
			onclick={submit}
		>
			{requestMutation.isPending ? '요청 중...' : '검수 요청'}
		</button>
	</div>
	<p class="mt-2 text-xs text-gray-400">DRAFT/CALC 상태의 처방만 검수를 요청할 수 있다.</p>
	{#if requestMutation.isError}
		<p class="mt-2 text-sm text-red-600">{requestMutation.error?.message}</p>
	{/if}

	{#if reviewsQuery.data && reviewsQuery.data.length > 0}
		<ul class="mt-4 space-y-2">
			{#each reviewsQuery.data as review (review.id)}
				<li class="rounded border border-gray-200 px-3 py-2 text-xs">
					<span
						class="mr-2 rounded-full px-2 py-0.5 font-bold"
						class:bg-emerald-50={review.status === 'APPROVED'}
						class:text-emerald-700={review.status === 'APPROVED'}
						class:bg-red-50={review.status === 'REJECTED' || review.status === 'CHANGES'}
						class:text-red-700={review.status === 'REJECTED' || review.status === 'CHANGES'}
						class:bg-gray-100={review.status === 'PENDING' || review.status === 'REVIEWING'}
						class:text-gray-600={review.status === 'PENDING' || review.status === 'REVIEWING'}
					>
						{statusLabel(review.status)}
					</span>
					요청 {review.requestedAt.slice(0, 10)}
					{#if review.reviewerId}· 검수자 #{review.reviewerId}{/if}
					{#if review.comment}— {review.comment}{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

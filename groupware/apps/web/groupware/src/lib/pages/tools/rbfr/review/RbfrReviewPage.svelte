<script lang="ts">
	// RBFR 연구: 검수(REVIEWER, 8단계). 02_화면구성.md 사용자 권한표 "REVIEWER: 검수 요청
	// 처리(승인·수정요청·반려). 자기 처방은 자기가 못 함"(서버가 강제). 인증 연동 전까지는
	// "내 검수자 ID"를 직접 입력받는다(임시, rbfr/develop_status.md 참고). 승인(APPROVED)은
	// 버전 스냅샷을 만들어야 해서 profileCode가 필요하다 — 처방마다 어느 Profile인지 이
	// 화면이 알 방법이 아직 없어(처방-Profile 연결 컬럼 자체가 없음, 확인 필요) 임시로
	// 직접 입력받는다.
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';

	const qc = useQueryClient();
	let reviewerId = $state(2);
	let profileCode = $state('SKIN');

	const pendingQuery = createQuery(() => rbfrService.pendingReviews());
	const myAssignedQuery = createQuery(() => rbfrService.myAssignedReviews(reviewerId));
	const pickupMutation = createMutation(() => rbfrService.pickupReview(qc));
	const decideMutation = createMutation(() => rbfrService.decideReview(qc));

	let commentByReviewId = $state<Record<number, string>>({});

	function pickup(reviewId: number) {
		pickupMutation.mutate({ reviewId, reviewerId });
	}

	function decide(reviewId: number, decision: 'APPROVED' | 'CHANGES' | 'REJECTED') {
		decideMutation.mutate({
			reviewId,
			decision,
			comment: commentByReviewId[reviewId] || undefined,
			profileCode: decision === 'APPROVED' ? profileCode : undefined
		});
	}
</script>

<div class="mx-auto max-w-3xl space-y-6 p-8">
	<header>
		<p class="text-xs text-gray-400">RBFR 연구</p>
		<h1 class="text-xl font-bold text-gray-900">검수(REVIEWER)</h1>
		<p class="mt-1 text-sm text-gray-500">자기 처방은 자기가 검수할 수 없다.</p>
	</header>

	<div class="flex gap-4">
		<label class="block text-sm">
			<span class="mb-1 block text-gray-600">내 검수자 ID(임시)</span>
			<input type="number" class="w-32 rounded border border-gray-300 p-2" bind:value={reviewerId} />
		</label>
		<label class="block text-sm">
			<span class="mb-1 block text-gray-600">승인 시 Profile 코드(임시)</span>
			<input class="w-32 rounded border border-gray-300 p-2" bind:value={profileCode} />
		</label>
	</div>

	<section class="rounded-lg border border-gray-200 p-5">
		<h2 class="mb-3 text-sm font-bold text-gray-700">대기 중인 검수 요청</h2>
		{#if pendingQuery.isPending}
			<p class="text-xs text-gray-400">불러오는 중...</p>
		{:else if pendingQuery.isError}
			<p class="text-xs text-red-600">대기열을 불러오지 못했습니다.</p>
		{:else if pendingQuery.data.length === 0}
			<p class="text-xs text-gray-400">대기 중인 검수 요청이 없습니다.</p>
		{:else}
			<ul class="space-y-2">
				{#each pendingQuery.data as review (review.id)}
					<li class="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm">
						<span>처방 #{review.formulaId} (요청자 #{review.requestedBy}, {review.requestedAt.slice(0, 10)})</span>
						<button
							type="button"
							class="rounded bg-gray-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
							disabled={pickupMutation.isPending}
							onclick={() => pickup(review.id)}
						>
							배정받기
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if pickupMutation.isError}
			<p class="mt-2 text-sm text-red-600">{pickupMutation.error?.message}</p>
		{/if}
	</section>

	<section class="rounded-lg border border-gray-200 p-5">
		<h2 class="mb-3 text-sm font-bold text-gray-700">내가 배정받은 검수</h2>
		{#if myAssignedQuery.isPending}
			<p class="text-xs text-gray-400">불러오는 중...</p>
		{:else if myAssignedQuery.isError}
			<p class="text-xs text-red-600">배정받은 검수를 불러오지 못했습니다.</p>
		{:else if myAssignedQuery.data.length === 0}
			<p class="text-xs text-gray-400">배정받은 검수가 없습니다.</p>
		{:else}
			<ul class="space-y-3">
				{#each myAssignedQuery.data as review (review.id)}
					<li class="rounded border border-gray-200 p-3 text-sm">
						<p class="mb-2">처방 #{review.formulaId}</p>
						<input
							class="mb-2 w-full rounded border border-gray-300 p-2 text-xs"
							placeholder="코멘트(선택)"
							value={commentByReviewId[review.id] ?? ''}
							oninput={(e) => (commentByReviewId[review.id] = (e.target as HTMLInputElement).value)}
						/>
						<div class="flex gap-2">
							<button
								type="button"
								class="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
								disabled={decideMutation.isPending}
								onclick={() => decide(review.id, 'APPROVED')}
							>
								승인
							</button>
							<button
								type="button"
								class="rounded bg-amber-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
								disabled={decideMutation.isPending}
								onclick={() => decide(review.id, 'CHANGES')}
							>
								수정요청
							</button>
							<button
								type="button"
								class="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
								disabled={decideMutation.isPending}
								onclick={() => decide(review.id, 'REJECTED')}
							>
								반려
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
		{#if decideMutation.isError}
			<p class="mt-2 text-sm text-red-600">{decideMutation.error?.message}</p>
		{/if}
	</section>
</div>

<script lang="ts">
	// 원료 등록 화면 부속: CAS/국가별 규제 확인/인증 정보/무첨가 분류. 방금 등록했거나 이미
	// 등록된 원료(ingredientId)에 딸린 값을 추가·조회한다. 02_화면구성.md 탭3 참고. 값 집합
	// (국가/인증종류/무첨가분류)은 rbfr_code_items가 관리하는 영역이라 실제로는 코드 어디에도
	// 고정되어 있지 않지만, 화면 후보값은 02번 문서가 명시한 목록을 그대로 select 옵션으로
	// 둔다(자유 입력도 막지 않도록 값 자체는 백엔드에서 문자열로만 받는다).
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';

	interface Props {
		ingredientId: number;
	}
	let { ingredientId }: Props = $props();

	const qc = useQueryClient();

	const COUNTRIES = ['KR', 'CN', 'US', 'CA', 'EU', 'JP', 'UK', 'RU', 'TW', 'ASEAN'];
	const CERTS: [string, string][] = [
		['VEGAN', '비건'],
		['ORGANIC', '유기농'],
		['NMPA', 'NMPA'],
		['HYPOALLERGENIC', '저자극']
	];
	const NOADD_FLAGS: [string, string][] = [
		['PARABEN', '파라벤류'],
		['PHENOXYETHANOL', '페녹시에탄올'],
		['PEG', 'PEG류'],
		['BHT_BHA', 'BHT/BHA'],
		['SILICONE', '실리콘류']
	];

	// CAS
	const casQuery = createQuery(() => rbfrService.ingredientCas(ingredientId));
	let casNo = $state('');
	const addCasMutation = createMutation(() => rbfrService.addIngredientCas(qc, ingredientId));
	function submitCas() {
		addCasMutation.mutate({ casNo }, { onSuccess: () => (casNo = '') });
	}

	// 국가별 규제 확인
	const regulationsQuery = createQuery(() => rbfrService.ingredientRegulations(ingredientId));
	let regCountry = $state(COUNTRIES[0]);
	let regType = $state<'ALLOW' | 'BAN' | 'LIMIT' | 'COND' | 'NODATA'>('ALLOW');
	let regLimitPct = $state<number | undefined>(undefined);
	let regNote = $state('');
	const addRegulationMutation = createMutation(() => rbfrService.addIngredientRegulation(qc, ingredientId));
	function submitRegulation() {
		addRegulationMutation.mutate(
			{ countryCode: regCountry, regType, limitPct: regLimitPct, note: regNote || undefined },
			{ onSuccess: () => (regNote = '') }
		);
	}

	// 인증 정보
	const certsQuery = createQuery(() => rbfrService.ingredientCerts(ingredientId));
	let certCode = $state(CERTS[0][0]);
	let certIsEligible = $state(true);
	let certIssuer = $state('');
	let certNo = $state('');
	let certValidUntil = $state('');
	const addCertMutation = createMutation(() => rbfrService.addIngredientCert(qc, ingredientId));
	function submitCert() {
		addCertMutation.mutate(
			{
				certCode,
				isEligible: certIsEligible,
				issuer: certIssuer || undefined,
				certNo: certNo || undefined,
				validUntil: certValidUntil || undefined
			},
			{ onSuccess: () => ((certIssuer = ''), (certNo = ''), (certValidUntil = '')) }
		);
	}

	// 무첨가 분류
	const flagsQuery = createQuery(() => rbfrService.ingredientFlags(ingredientId));
	let noaddCode = $state(NOADD_FLAGS[0][0]);
	const addFlagMutation = createMutation(() => rbfrService.addIngredientFlag(qc, ingredientId));
	function submitFlag() {
		addFlagMutation.mutate({ noaddCode });
	}

	function isExpired(validUntil?: string): boolean {
		if (!validUntil) return false;
		return new Date(validUntil) < new Date();
	}
</script>

<div class="mt-6 space-y-5 border-t border-gray-200 pt-6">
	<h2 class="text-sm font-bold text-gray-700">부속 정보(원료 ID {ingredientId})</h2>

	<section>
		<h3 class="mb-2 text-xs font-bold text-gray-600">CAS 번호</h3>
		<div class="flex gap-2">
			<input class="flex-1 rounded border border-gray-300 p-2 text-sm" placeholder="CAS No." bind:value={casNo} />
			<button
				type="button"
				class="rounded bg-gray-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
				disabled={addCasMutation.isPending || !casNo}
				onclick={submitCas}
			>
				추가
			</button>
		</div>
		{#if casQuery.data && casQuery.data.length > 0}
			<ul class="mt-2 flex flex-wrap gap-2">
				{#each casQuery.data as entry (entry.casNo)}
					<li class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{entry.casNo}</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h3 class="mb-2 text-xs font-bold text-gray-600">국가별 규제 확인</h3>
		<div class="grid grid-cols-4 gap-2">
			<select class="rounded border border-gray-300 p-2 text-sm" bind:value={regCountry}>
				{#each COUNTRIES as c (c)}
					<option value={c}>{c}</option>
				{/each}
			</select>
			<select class="rounded border border-gray-300 p-2 text-sm" bind:value={regType}>
				<option value="ALLOW">ALLOW</option>
				<option value="LIMIT">LIMIT</option>
				<option value="BAN">BAN</option>
				<option value="COND">COND</option>
				<option value="NODATA">NODATA</option>
			</select>
			<input
				type="number"
				step="0.0001"
				class="rounded border border-gray-300 p-2 text-sm"
				placeholder="한도(%)"
				bind:value={regLimitPct}
			/>
			<input class="rounded border border-gray-300 p-2 text-sm" placeholder="비고" bind:value={regNote} />
		</div>
		<button
			type="button"
			class="mt-2 rounded bg-gray-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
			disabled={addRegulationMutation.isPending}
			onclick={submitRegulation}
		>
			추가
		</button>
		{#if regulationsQuery.data && regulationsQuery.data.length > 0}
			<ul class="mt-2 space-y-1">
				{#each regulationsQuery.data as entry (entry.regId)}
					<li class="rounded border border-gray-200 px-2 py-1 text-xs">
						{entry.countryCode}
						<span
							class="font-bold"
							class:text-amber-600={entry.regType === 'NODATA'}
							class:text-red-600={entry.regType === 'BAN'}
						>
							{entry.regType}
						</span>
						({entry.status})
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h3 class="mb-2 text-xs font-bold text-gray-600">인증 정보</h3>
		<div class="grid grid-cols-4 gap-2">
			<select class="rounded border border-gray-300 p-2 text-sm" bind:value={certCode}>
				{#each CERTS as [code, label] (code)}
					<option value={code}>{label}</option>
				{/each}
			</select>
			<input class="rounded border border-gray-300 p-2 text-sm" placeholder="발급처" bind:value={certIssuer} />
			<input class="rounded border border-gray-300 p-2 text-sm" placeholder="인증서번호" bind:value={certNo} />
			<input type="date" class="rounded border border-gray-300 p-2 text-sm" bind:value={certValidUntil} />
		</div>
		<label class="mt-2 flex items-center gap-2 text-xs text-gray-600">
			<input type="checkbox" bind:checked={certIsEligible} />
			해당 인증 충족
		</label>
		<button
			type="button"
			class="mt-2 rounded bg-gray-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
			disabled={addCertMutation.isPending}
			onclick={submitCert}
		>
			추가
		</button>
		{#if certsQuery.data && certsQuery.data.length > 0}
			<ul class="mt-2 space-y-1">
				{#each certsQuery.data as entry (entry.certCode)}
					<li class="rounded border border-gray-200 px-2 py-1 text-xs">
						{entry.certCode} — {entry.isEligible ? '충족' : '미충족'}
						{#if entry.validUntil}
							<span class:text-red-600={isExpired(entry.validUntil)}>
								(유효기간 {entry.validUntil}{isExpired(entry.validUntil) ? ', 만료됨' : ''})
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h3 class="mb-2 text-xs font-bold text-gray-600">무첨가 분류</h3>
		<div class="flex gap-2">
			<select class="flex-1 rounded border border-gray-300 p-2 text-sm" bind:value={noaddCode}>
				{#each NOADD_FLAGS as [code, label] (code)}
					<option value={code}>{label}</option>
				{/each}
			</select>
			<button
				type="button"
				class="rounded bg-gray-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
				disabled={addFlagMutation.isPending}
				onclick={submitFlag}
			>
				추가
			</button>
		</div>
		{#if flagsQuery.data && flagsQuery.data.length > 0}
			<ul class="mt-2 flex flex-wrap gap-2">
				{#each flagsQuery.data as entry (entry.noaddCode)}
					<li class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
						{NOADD_FLAGS.find(([code]) => code === entry.noaddCode)?.[1] ?? entry.noaddCode}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

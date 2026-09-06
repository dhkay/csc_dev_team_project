<script lang="ts">
	// RBFR 연구: 설정(Profile 관리, 7단계 다섯 번째 조각 + 남은 조각). 02_화면구성.md
	// "설정(Profile 관리)"의 핵심만 우선 연결한다. 스킨(Skin) Profile의 4직접+1통합 구조는
	// 특허 청구항에 묶인 확정 구조라 이 화면에서 수정할 수 없다 — 그래서 이 화면은 역할 도메인
	// 구조 자체는 "읽기 전용 목록"으로만 보여주고, 편집 가능한 것은 "새 Profile 등록",
	// "Profile 활성화 토글", "Cell 규칙 판 승인", "Cell 변환표(비중%→칸수) 편집"이다.
	// 활성화는 승인된 Cell 규칙 판이 있어야 하고, 변환표 편집은 미승인 판에서만 가능하다
	// (둘 다 서버가 강제하는 불변식, 화면은 그 결과를 그대로 보여준다).
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { rbfrService } from '$lib/features/rbfr/services/rbfr.service';
	import type { CellMappingEntry, CreateProfileRoleInput } from '$lib/features/rbfr/types';

	const qc = useQueryClient();

	const profilesQuery = createQuery(() => rbfrService.profiles());

	let selectedProfileCode = $state<string | undefined>(undefined);
	const roleDomainsQuery = createQuery(() => rbfrService.roleDomains(selectedProfileCode ?? ''));
	const cellRuleLimitsQuery = createQuery(() => rbfrService.cellRuleLimits(selectedProfileCode ?? ''));

	function selectProfile(profileCode: string) {
		selectedProfileCode = profileCode;
	}

	// 새 Profile 등록 폼 상태.
	let profileCode = $state('');
	let nameKo = $state('');
	let profileType = $state<'PRIMARY' | 'CROSS'>('PRIMARY');
	let description = $state('');
	let roles = $state<CreateProfileRoleInput[]>([{ domainCode: '', nameKo: '', domainType: 'DIRECT' }]);

	const createProfileMutation = createMutation(() => rbfrService.createProfile(qc));

	function addRole() {
		roles = [...roles, { domainCode: '', nameKo: '', domainType: 'DIRECT' }];
	}

	function removeRole(index: number) {
		roles = roles.filter((_, i) => i !== index);
	}

	function submitCreateProfile() {
		createProfileMutation.mutate(
			{
				profileCode,
				nameKo,
				profileType,
				description: description || undefined,
				roles
			},
			{
				onSuccess: () => {
					profileCode = '';
					nameKo = '';
					description = '';
					roles = [{ domainCode: '', nameKo: '', domainType: 'DIRECT' }];
				}
			}
		);
	}

	// Cell 규칙 판 승인.
	let approverName = $state('');
	const approveMutation = createMutation(() =>
		rbfrService.approveCellRuleLimit(qc, selectedProfileCode ?? '')
	);

	function approve(ruleVersion: string) {
		approveMutation.mutate({ ruleVersion, approvedBy: approverName });
	}

	// Profile 활성화 토글.
	const setActiveMutation = createMutation(() => rbfrService.setProfileActive(qc));

	function toggleActive(profileCode: string, isActive: boolean) {
		setActiveMutation.mutate({ profileCode, isActive: !isActive });
	}

	// Cell 변환표(비중%→칸수) 편집. 미승인 rule_version만 고칠 수 있다.
	let editingRuleVersion = $state<string | undefined>(undefined);
	const cellMappingQuery = createQuery(() => rbfrService.cellMapping(editingRuleVersion ?? ''));
	let mappingEntries = $state<CellMappingEntry[]>([]);

	$effect(() => {
		if (editingRuleVersion && cellMappingQuery.data) {
			mappingEntries = cellMappingQuery.data.map((r) => ({
				ratioFrom: r.ratioFrom,
				ratioTo: r.ratioTo,
				cellCount: r.cellCount
			}));
		}
	});

	function openMappingEditor(ruleVersion: string) {
		editingRuleVersion = editingRuleVersion === ruleVersion ? undefined : ruleVersion;
	}

	function addMappingEntry() {
		mappingEntries = [...mappingEntries, { ratioFrom: 0, ratioTo: 0, cellCount: 0 }];
	}

	function removeMappingEntry(index: number) {
		mappingEntries = mappingEntries.filter((_, i) => i !== index);
	}

	const setCellMappingMutation = createMutation(() =>
		rbfrService.setCellMapping(qc, editingRuleVersion ?? '')
	);

	function saveMapping() {
		setCellMappingMutation.mutate(mappingEntries);
	}
</script>

<div class="mx-auto max-w-4xl space-y-8 p-8">
	<header>
		<p class="text-xs text-gray-400">RBFR 연구</p>
		<h1 class="text-xl font-bold text-gray-900">설정(Profile 관리)</h1>
		<p class="mt-1 text-sm text-gray-500">ADMIN 권한 전용. 확정된 Profile 구조는 여기서 고치지 않는다.</p>
	</header>

	<section class="rounded-lg border border-gray-200 p-5">
		<h2 class="mb-3 text-sm font-bold text-gray-700">Profile 목록</h2>
		{#if profilesQuery.isPending}
			<p class="text-xs text-gray-400">불러오는 중...</p>
		{:else if profilesQuery.isError}
			<p class="text-xs text-red-600">Profile 목록을 불러오지 못했습니다.</p>
		{:else if profilesQuery.data.length === 0}
			<p class="text-xs text-gray-400">등록된 Profile이 없습니다.</p>
		{:else}
			<ul class="space-y-1">
				{#each profilesQuery.data as profile (profile.profileCode)}
					<li class="flex items-center gap-2">
						<button
							type="button"
							class="flex flex-1 items-center justify-between rounded border px-3 py-2 text-left text-sm"
							class:border-gray-900={selectedProfileCode === profile.profileCode}
							class:border-gray-200={selectedProfileCode !== profile.profileCode}
							onclick={() => selectProfile(profile.profileCode)}
						>
							<span>{profile.nameKo} <span class="text-gray-400">({profile.profileCode})</span></span>
							<span class="text-xs font-bold" class:text-emerald-700={profile.isActive} class:text-gray-400={!profile.isActive}>
								{profile.isActive ? '사용 중' : '비활성'}
							</span>
						</button>
						<button
							type="button"
							class="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
							disabled={setActiveMutation.isPending}
							onclick={() => toggleActive(profile.profileCode, profile.isActive)}
						>
							{profile.isActive ? '비활성화' : '활성화'}
						</button>
					</li>
				{/each}
			</ul>
			{#if setActiveMutation.isError}
				<p class="mt-2 text-sm text-red-600">
					{setActiveMutation.error?.message ?? '활성화 상태 변경에 실패했습니다.'}
				</p>
			{/if}
		{/if}
	</section>

	{#if selectedProfileCode}
		<section class="rounded-lg border border-gray-200 p-5">
			<h2 class="mb-3 text-sm font-bold text-gray-700">
				역할 도메인({selectedProfileCode}, 읽기 전용)
			</h2>
			<p class="mb-3 text-xs text-gray-400">
				역할 구조(직접/통합 구분, 개수)는 특허 청구항에 묶인 확정 사항이라 이 화면에서 편집할 수 없다.
			</p>
			{#if roleDomainsQuery.isPending}
				<p class="text-xs text-gray-400">불러오는 중...</p>
			{:else if roleDomainsQuery.isError}
				<p class="text-xs text-red-600">역할 도메인을 불러오지 못했습니다.</p>
			{:else}
				<table class="w-full text-sm">
					<thead>
						<tr class="text-left text-xs text-gray-400">
							<th class="pb-1">이름</th>
							<th class="pb-1">코드</th>
							<th class="pb-1">종류</th>
							<th class="pb-1">활성</th>
						</tr>
					</thead>
					<tbody>
						{#each roleDomainsQuery.data as domain (domain.domainCode)}
							<tr class="border-t border-gray-100">
								<td class="py-1">{domain.nameKo}</td>
								<td class="py-1 text-gray-400">{domain.domainCode}</td>
								<td class="py-1">{domain.domainType === 'DIRECT' ? '직접' : '통합'}</td>
								<td class="py-1">{domain.isActive ? 'Y' : 'N'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<section class="rounded-lg border border-gray-200 p-5">
			<h2 class="mb-3 text-sm font-bold text-gray-700">Cell 규칙 판({selectedProfileCode})</h2>
			{#if cellRuleLimitsQuery.isPending}
				<p class="text-xs text-gray-400">불러오는 중...</p>
			{:else if cellRuleLimitsQuery.isError}
				<p class="text-xs text-red-600">Cell 규칙 판을 불러오지 못했습니다.</p>
			{:else if cellRuleLimitsQuery.data.length === 0}
				<p class="text-xs text-gray-400">등록된 Cell 규칙 판이 없습니다.</p>
			{:else}
				<ul class="space-y-2">
					{#each cellRuleLimitsQuery.data as limit (limit.ruleVersion)}
						<li class="rounded border border-gray-200 px-3 py-2 text-sm">
							<div class="flex items-center justify-between">
								<span>
									{limit.ruleVersion} — 총 {limit.totalMin}~{limit.totalMax}칸, {limit.fillDirection}
								</span>
								<div class="flex items-center gap-2">
									<button
										type="button"
										class="rounded border border-gray-300 px-2 py-1 text-xs"
										onclick={() => openMappingEditor(limit.ruleVersion)}
									>
										{editingRuleVersion === limit.ruleVersion ? '변환표 닫기' : '변환표 편집'}
									</button>
									{#if limit.isApproved}
										<span class="text-xs font-bold text-emerald-700">
											승인됨({limit.approvedBy})
										</span>
									{:else}
										<button
											type="button"
											class="rounded bg-gray-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
											disabled={approveMutation.isPending || !approverName}
											onclick={() => approve(limit.ruleVersion)}
										>
											승인
										</button>
									{/if}
								</div>
							</div>

							{#if editingRuleVersion === limit.ruleVersion}
								<div class="mt-3 border-t border-gray-100 pt-3">
									{#if limit.isApproved}
										<p class="text-xs text-gray-400">
											승인된 판이라 변환표를 고칠 수 없다(읽기 전용).
										</p>
									{/if}
									{#if cellMappingQuery.isPending}
										<p class="text-xs text-gray-400">불러오는 중...</p>
									{:else}
										<table class="w-full text-xs">
											<thead>
												<tr class="text-left text-gray-400">
													<th class="pb-1">이상(%)</th>
													<th class="pb-1">미만(%)</th>
													<th class="pb-1">칸수</th>
													<th class="pb-1"></th>
												</tr>
											</thead>
											<tbody>
												{#each mappingEntries as entry, i (i)}
													<tr>
														<td class="pr-1 py-1">
															<input
																type="number"
																class="w-20 rounded border border-gray-300 p-1"
																bind:value={entry.ratioFrom}
																disabled={limit.isApproved}
															/>
														</td>
														<td class="pr-1 py-1">
															<input
																type="number"
																class="w-20 rounded border border-gray-300 p-1"
																bind:value={entry.ratioTo}
																disabled={limit.isApproved}
															/>
														</td>
														<td class="pr-1 py-1">
															<input
																type="number"
																class="w-16 rounded border border-gray-300 p-1"
																bind:value={entry.cellCount}
																disabled={limit.isApproved}
															/>
														</td>
														<td class="py-1">
															{#if !limit.isApproved}
																<button
																	type="button"
																	class="text-red-600"
																	onclick={() => removeMappingEntry(i)}
																>
																	삭제
																</button>
															{/if}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
										{#if !limit.isApproved}
											<div class="mt-2 flex items-center gap-2">
												<button type="button" class="text-xs text-gray-500 underline" onclick={addMappingEntry}>
													+ 구간 추가
												</button>
												<button
													type="button"
													class="rounded bg-gray-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
													disabled={setCellMappingMutation.isPending || mappingEntries.length === 0}
													onclick={saveMapping}
												>
													{setCellMappingMutation.isPending ? '저장 중...' : '변환표 저장'}
												</button>
											</div>
											{#if setCellMappingMutation.isError}
												<p class="mt-1 text-xs text-red-600">
													{setCellMappingMutation.error?.message ?? '저장에 실패했습니다.'}
												</p>
											{/if}
										{/if}
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				<label class="mt-3 block text-sm">
					<span class="mb-1 block text-gray-600">승인자 이름</span>
					<input class="w-64 rounded border border-gray-300 p-2" bind:value={approverName} />
				</label>
				<p class="mt-2 text-xs text-gray-400">
					승인된 판은 다시 못 고친다. 바꾸려면 새 Profile 등록 시 만들어지는 새 rule_version을 쓴다.
				</p>
				{#if approveMutation.isError}
					<p class="mt-2 text-sm text-red-600">
						{approveMutation.error?.message ?? '승인에 실패했습니다.'}
					</p>
				{/if}
			{/if}
		</section>
	{/if}

	<section class="rounded-lg border border-gray-200 p-5">
		<h2 class="mb-3 text-sm font-bold text-gray-700">새 Profile 등록</h2>
		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				submitCreateProfile();
			}}
		>
			<div class="grid grid-cols-2 gap-4">
				<label class="block text-sm">
					<span class="mb-1 block text-gray-600">Profile 코드</span>
					<input class="w-full rounded border border-gray-300 p-2" bind:value={profileCode} required />
				</label>
				<label class="block text-sm">
					<span class="mb-1 block text-gray-600">Profile 이름</span>
					<input class="w-full rounded border border-gray-300 p-2" bind:value={nameKo} required />
				</label>
				<label class="block text-sm">
					<span class="mb-1 block text-gray-600">종류</span>
					<select class="w-full rounded border border-gray-300 p-2" bind:value={profileType}>
						<option value="PRIMARY">단독 적용(PRIMARY)</option>
						<option value="CROSS">겹쳐 적용(CROSS)</option>
					</select>
				</label>
				<label class="block text-sm">
					<span class="mb-1 block text-gray-600">설명</span>
					<input class="w-full rounded border border-gray-300 p-2" bind:value={description} />
				</label>
			</div>

			<div>
				<div class="mb-2 flex items-center justify-between">
					<h3 class="text-sm font-bold text-gray-700">역할 도메인</h3>
					<button type="button" class="text-xs text-gray-500 underline" onclick={addRole}>
						+ 역할 추가
					</button>
				</div>
				<div class="space-y-2">
					{#each roles as role, i (i)}
						<div class="grid grid-cols-[1fr_1fr_120px_auto] gap-2">
							<input
								class="rounded border border-gray-300 p-2 text-sm"
								placeholder="도메인 코드"
								bind:value={role.domainCode}
								required
							/>
							<input
								class="rounded border border-gray-300 p-2 text-sm"
								placeholder="이름"
								bind:value={role.nameKo}
								required
							/>
							<select class="rounded border border-gray-300 p-2 text-sm" bind:value={role.domainType}>
								<option value="DIRECT">직접</option>
								<option value="INTEGRATED">통합</option>
							</select>
							<button
								type="button"
								class="text-xs text-red-600 disabled:opacity-30"
								disabled={roles.length <= 1}
								onclick={() => removeRole(i)}
							>
								삭제
							</button>
						</div>
					{/each}
				</div>
			</div>

			<button
				type="submit"
				class="rounded bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
				disabled={createProfileMutation.isPending}
			>
				{createProfileMutation.isPending ? '등록 중...' : 'Profile 등록'}
			</button>

			{#if createProfileMutation.isSuccess}
				<p class="text-sm text-emerald-700">
					등록되었습니다(rule_version {createProfileMutation.data.ruleVersion}, 오각형 각도
					{createProfileMutation.data.anglePerDomain.toFixed(1)}도). Cell 규칙 판은 위 목록에서
					승인해야 실제 산출에 쓰인다.
				</p>
			{/if}
			{#if createProfileMutation.isError}
				<p class="text-sm text-red-600">
					{createProfileMutation.error?.message ?? 'Profile 등록에 실패했습니다.'}
				</p>
			{/if}
		</form>
	</section>
</div>

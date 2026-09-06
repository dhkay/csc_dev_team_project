// 처방 사용감·안정성 기록 목록 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { FormulaSensoryStabilityRecord } from '../types';

export const sensoryStabilityKeys = {
	list: (formulaId: number) => ['rbfr', 'sensory-stability', formulaId] as const
};

export function sensoryStabilityQueryOptions(formulaId: number) {
	return queryOptions({
		queryKey: sensoryStabilityKeys.list(formulaId),
		queryFn: async (): Promise<FormulaSensoryStabilityRecord[]> => {
			const res = await api.listSensoryStabilityRecords(formulaId);
			if (!res.success) throw new Error(res.error ?? '사용감·안정성 기록을 불러오지 못했습니다.');
			return res.data;
		},
		enabled: formulaId > 0
	});
}

import type { QueryClient } from '@tanstack/svelte-query';
import { sensoryStabilityKeys } from '../queries/sensoryStability.query';
import * as api from '../apis/rbfrApi';
import type { FormulaSensoryStabilityInput } from '../types';

export function addSensoryStabilityRecordMutationOptions(queryClient: QueryClient, formulaId: number) {
	return {
		mutationFn: async (input: FormulaSensoryStabilityInput) => {
			const res = await api.addSensoryStabilityRecord(formulaId, input);
			if (!res.success) throw new Error(res.error ?? '사용감·안정성 기록 등록에 실패했습니다.');
			return res.data;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: sensoryStabilityKeys.list(formulaId) });
		}
	};
}

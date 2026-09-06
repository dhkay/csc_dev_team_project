// 설정(Profile 관리) Cell 변환표 저장 변경 레이어. 승인된 rule_version은 서버가 거부한다.
import type { QueryClient } from '@tanstack/svelte-query';
import { cellMappingKeys } from '../queries/cellMapping.query';
import * as api from '../apis/rbfrApi';
import type { CellMappingEntry } from '../types';

export function setCellMappingMutationOptions(queryClient: QueryClient, ruleVersion: string) {
	return {
		mutationFn: async (entries: CellMappingEntry[]) => {
			const res = await api.setCellMapping(ruleVersion, entries);
			if (!res.success) throw new Error(res.error ?? 'Cell 변환표 저장에 실패했습니다.');
			return res.data;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: cellMappingKeys.list(ruleVersion) });
		}
	};
}

// 설정(Profile 관리) 화면의 Cell 변환표(비중%→칸수) 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { CellMappingRow } from '../types';

export const cellMappingKeys = {
	list: (ruleVersion: string) => ['rbfr', 'cell-mapping', ruleVersion] as const
};

export function cellMappingQueryOptions(ruleVersion: string) {
	return queryOptions({
		queryKey: cellMappingKeys.list(ruleVersion),
		queryFn: async (): Promise<CellMappingRow[]> => {
			const res = await api.listCellMapping(ruleVersion);
			if (!res.success) throw new Error(res.error ?? 'Cell 변환표를 불러오지 못했습니다.');
			return res.data;
		},
		enabled: ruleVersion.length > 0
	});
}

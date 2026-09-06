// 설정(Profile 관리) 화면의 Cell 규칙 판 목록 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { CellRuleLimitSummary } from '../types';

export const cellRuleLimitsKeys = {
	list: (profileCode: string) => ['rbfr', 'cell-rule-limits', profileCode] as const
};

export function cellRuleLimitsQueryOptions(profileCode: string) {
	return queryOptions({
		queryKey: cellRuleLimitsKeys.list(profileCode),
		queryFn: async (): Promise<CellRuleLimitSummary[]> => {
			const res = await api.listCellRuleLimits(profileCode);
			if (!res.success) throw new Error(res.error ?? 'Cell 규칙 판 목록을 불러오지 못했습니다.');
			return res.data;
		},
		enabled: profileCode.length > 0
	});
}

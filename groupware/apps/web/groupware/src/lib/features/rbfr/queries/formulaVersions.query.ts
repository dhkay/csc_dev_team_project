// 처방 확정 버전 이력 조회 레이어(05번 문서 "확정 후 불변").
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { FormulaVersionSummary } from '../types';

export const formulaVersionsKeys = {
	list: (formulaId: number) => ['rbfr', 'formula-versions', formulaId] as const
};

export function formulaVersionsQueryOptions(formulaId: number) {
	return queryOptions({
		queryKey: formulaVersionsKeys.list(formulaId),
		queryFn: async (): Promise<FormulaVersionSummary[]> => {
			const res = await api.listFormulaVersions(formulaId);
			if (!res.success) throw new Error(res.error ?? '확정 버전 이력을 불러오지 못했습니다.');
			return res.data;
		},
		enabled: formulaId > 0
	});
}

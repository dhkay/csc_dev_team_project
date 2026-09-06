// 처방 계산·검증 조회 레이어: TanStack Query. apis(frontClient→BFF) 를 queryFn 으로 감싼다.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { FormulaCalculationResult } from '../types';

/** 쿼리 키 팩토리: 처방+Profile 조합마다 별개 캐시. */
export const rbfrKeys = {
	calculation: (formulaId: number, profileCode: string) =>
		['rbfr', 'formula-calculation', formulaId, profileCode] as const
};

export function formulaCalculationQueryOptions(formulaId: number, profileCode: string) {
	return queryOptions({
		queryKey: rbfrKeys.calculation(formulaId, profileCode),
		queryFn: async (): Promise<FormulaCalculationResult> => {
			const res = await api.calculateFormula(formulaId, profileCode);
			if (!res.success) {
				throw new Error(res.error ?? '처방 계산에 실패했습니다.');
			}
			return res.data;
		}
	});
}

// 처방 생성 변경 레이어. 성공하면 새 formulaId를 돌려주고, 호출부(페이지)가 계산 화면으로 이동시킨다.
import * as api from '../apis/rbfrApi';
import type { CreateFormulaInput, CreateFormulaResult } from '../types';

export function createFormulaMutationOptions() {
	return {
		mutationFn: async (input: CreateFormulaInput): Promise<CreateFormulaResult> => {
			const res = await api.createFormula(input);
			if (!res.success) throw new Error(res.error ?? '처방 생성에 실패했습니다.');
			return res.data;
		}
	};
}

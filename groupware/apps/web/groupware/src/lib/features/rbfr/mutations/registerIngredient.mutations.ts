// 원료 등록 변경 레이어. 성공해도 별도 목록 쿼리가 아직 없어 invalidate 대상이 없다(원료 목록
// 화면이 생기면 그 쿼리 키를 여기서 invalidate한다).
import * as api from '../apis/rbfrApi';
import type { CreateIngredientInput, CreateIngredientResult } from '../types';

export function registerIngredientMutationOptions() {
	return {
		mutationFn: async (input: CreateIngredientInput): Promise<CreateIngredientResult> => {
			const res = await api.registerIngredient(input);
			if (!res.success) throw new Error(res.error ?? '원료 등록에 실패했습니다.');
			return res.data;
		}
	};
}

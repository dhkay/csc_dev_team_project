import type { QueryClient } from '@tanstack/svelte-query';
import { ingredientCertsKeys } from '../queries/ingredientCerts.query';
import * as api from '../apis/rbfrApi';
import type { IngredientCertInput } from '../types';

export function addIngredientCertMutationOptions(queryClient: QueryClient, ingredientId: number) {
	return {
		mutationFn: async (input: IngredientCertInput) => {
			const res = await api.addIngredientCert(ingredientId, input);
			if (!res.success) throw new Error(res.error ?? '인증 정보 등록에 실패했습니다.');
			return res.data;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ingredientCertsKeys.list(ingredientId) });
		}
	};
}

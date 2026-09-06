// 역방향 추천 변경 레이어. 슬라이더로 목표 비중을 조정할 때마다 호출하는 계산 성격이라
// 서버 상태를 캐시할 필요가 없어 query가 아니라 mutation으로 모델링한다.
import * as api from '../apis/rbfrApi';
import type { RecommendIngredientsResult, TargetRatioInput } from '../types';

export function recommendIngredientsMutationOptions() {
	return {
		mutationFn: async (targetRatios: TargetRatioInput[]): Promise<RecommendIngredientsResult> => {
			const res = await api.recommendIngredients(targetRatios);
			if (!res.success) throw new Error(res.error ?? '추천 계산에 실패했습니다.');
			return res.data;
		}
	};
}

// 설정(Profile 관리) Cell 규칙 판 승인 변경 레이어. 승인된 판은 다시 못 고치므로 성공 시
// 그 Profile의 Cell 규칙 판 목록을 다시 불러와 승인 상태를 반영한다.
import type { QueryClient } from '@tanstack/svelte-query';
import { cellRuleLimitsKeys } from '../queries/cellRuleLimits.query';
import * as api from '../apis/rbfrApi';

export function approveCellRuleLimitMutationOptions(queryClient: QueryClient, profileCode: string) {
	return {
		mutationFn: async (input: { ruleVersion: string; approvedBy: string }) => {
			const res = await api.approveCellRuleLimit(input.ruleVersion, input.approvedBy);
			if (!res.success) throw new Error(res.error ?? 'Cell 규칙 판 승인에 실패했습니다.');
			return res.data;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: cellRuleLimitsKeys.list(profileCode) });
		}
	};
}

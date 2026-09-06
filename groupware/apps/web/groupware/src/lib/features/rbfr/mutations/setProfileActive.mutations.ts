// 설정(Profile 관리) Profile 활성화 토글 변경 레이어. 활성화 시 승인된 Cell 규칙 판이 없으면
// 서버가 거부한다(승인된 판 없이는 화면/산출 어디에도 낄 수 없다).
import type { QueryClient } from '@tanstack/svelte-query';
import { profilesKeys } from '../queries/profiles.query';
import * as api from '../apis/rbfrApi';

export function setProfileActiveMutationOptions(queryClient: QueryClient) {
	return {
		mutationFn: async (input: { profileCode: string; isActive: boolean }) => {
			const res = await api.setProfileActive(input.profileCode, input.isActive);
			if (!res.success) throw new Error(res.error ?? 'Profile 활성화 상태 변경에 실패했습니다.');
			return res.data;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: profilesKeys.list() });
		}
	};
}

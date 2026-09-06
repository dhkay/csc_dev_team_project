// 설정(Profile 관리) 새 Profile 등록 변경 레이어. 성공하면 Cell 규칙 판(미승인)이 함께 생성된다.
import { profilesKeys } from '../queries/profiles.query';
import * as api from '../apis/rbfrApi';
import type { CreateProfileInput, CreateProfileResult } from '../types';
import type { QueryClient } from '@tanstack/svelte-query';

export function createProfileMutationOptions(queryClient: QueryClient) {
	return {
		mutationFn: async (input: CreateProfileInput): Promise<CreateProfileResult> => {
			const res = await api.createProfile(input);
			if (!res.success) throw new Error(res.error ?? 'Profile 등록에 실패했습니다.');
			return res.data;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: profilesKeys.list() });
		}
	};
}

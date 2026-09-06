// 설정(Profile 관리) 화면의 Profile 목록 조회 레이어.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { ProfileSummary } from '../types';

export const profilesKeys = {
	list: () => ['rbfr', 'profiles'] as const
};

export function profilesQueryOptions() {
	return queryOptions({
		queryKey: profilesKeys.list(),
		queryFn: async (): Promise<ProfileSummary[]> => {
			const res = await api.listProfiles();
			if (!res.success) throw new Error(res.error ?? 'Profile 목록을 불러오지 못했습니다.');
			return res.data;
		}
	});
}

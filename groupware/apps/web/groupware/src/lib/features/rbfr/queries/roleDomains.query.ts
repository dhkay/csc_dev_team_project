// 설정(Profile 관리) 화면의 역할 도메인 전체 목록 조회 레이어(direct-domains와 달리 통합역할/비활성도 포함).
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';
import type { RoleDomainSummary } from '../types';

export const roleDomainsKeys = {
	list: (profileCode: string) => ['rbfr', 'role-domains', profileCode] as const
};

export function roleDomainsQueryOptions(profileCode: string) {
	return queryOptions({
		queryKey: roleDomainsKeys.list(profileCode),
		queryFn: async (): Promise<RoleDomainSummary[]> => {
			const res = await api.listRoleDomains(profileCode);
			if (!res.success) throw new Error(res.error ?? '역할 도메인 목록을 불러오지 못했습니다.');
			return res.data;
		},
		enabled: profileCode.length > 0
	});
}

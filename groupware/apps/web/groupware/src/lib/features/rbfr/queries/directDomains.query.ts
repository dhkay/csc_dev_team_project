// 활성 Profile의 직접역할 목록 조회 레이어: 원료 등록 폼이 어떤 역할 입력칸을 그릴지 결정한다.
import { queryOptions } from '@tanstack/svelte-query';
import * as api from '../apis/rbfrApi';

export const directDomainsKeys = {
	list: (profileCode: string) => ['rbfr', 'direct-domains', profileCode] as const
};

export function directDomainsQueryOptions(profileCode: string) {
	return queryOptions({
		queryKey: directDomainsKeys.list(profileCode),
		queryFn: async (): Promise<string[]> => {
			const res = await api.listDirectDomains(profileCode);
			if (!res.success) {
				throw new Error(res.error ?? '역할 도메인 목록을 불러오지 못했습니다.');
			}
			return res.data;
		}
	});
}

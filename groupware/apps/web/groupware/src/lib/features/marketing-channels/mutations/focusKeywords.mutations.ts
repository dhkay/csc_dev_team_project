// 포커스 키워드 후보 검색: 결과를 캐시에 넣지 않는다(저장 전 후보라 화면 로컬 상태로만 다룬다)
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import * as api from '../apis/focusKeywordsApi';
import type { FocusKeywordCandidate } from '../types';

interface SuggestKeywordsVars {
  channelId: number;
  seed: string;
}

export function suggestKeywordsMutationOptions(version: VersionMode) {
  return {
    // 이 화면은 자체 에러 배너를 띄운다. 전역 알림까지 뜨면 같은 말이 두 번
    meta: { silentError: true },
    mutationFn: async (vars: SuggestKeywordsVars): Promise<FocusKeywordCandidate[]> => {
      const res = await api.suggestKeywords(version, vars.channelId, vars.seed);
      if (!res.success) throw new Error(res.error ?? '키워드 후보를 만들지 못했습니다.');
      return res.data;
    },
  };
}

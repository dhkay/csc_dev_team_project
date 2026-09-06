// 진입 기본 버전 기록: 다음에 도구를 열 때 어느 버전으로 갈지
//
// 무효화가 없다. 버전이 쿼리 키의 축이라(savedPlansKeys 등) 버전을 옮기는 순간 다른 키 공간으로
// 들어가 서로의 캐시를 볼 수 없다(키에 없으면 "버전에 매달린 것 전부" 를 손으로 무효화해야 하고
// 그 목록에서 빠진 자원이 직전 버전의 값을 그대로 보여준다)
//
// 그래서 이 뮤테이션이 실패해도 화면은 이미 옳다: 버전 전환은 URL 이동이고 이것은 그 부수효과다.
// (다음 진입 기본값이 낡을 뿐이다). 롤백도 재시도도 없다.
import * as api from '../apis/entryVersionApi';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';

export function setMyEntryVersionMutationOptions() {
  return {
    // 실패해도 사용자가 할 일이 없다(다음 진입 기본값만 낡는다). 알림을 띄우지 않는다.
    meta: { silentError: true },
    mutationFn: async (version: VersionMode): Promise<VersionMode> => {
      const res = await api.setMyEntryVersion(version);
      if (!res.success) throw new Error(res.error ?? '진입 버전을 기록하지 못했습니다.');
      return res.data.version;
    },
  };
}

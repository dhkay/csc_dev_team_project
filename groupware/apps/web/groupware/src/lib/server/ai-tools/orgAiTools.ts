// 조직에 부여된 AI 도구 SSR 로드: 관리자 대시보드의 서브 앱바와 도구 셸 가드가 같은 목록을 쓴다.
//
// 체인: BFF(SSR) → csc-groupware → user 서버(엔타이틀먼트 SSoT). organizationId 는 백엔드 검증된
// 세션에서 도출해 전달한다(클라이언트가 고르지 않는다: 인가 경계)
// 표시명(name)과 라우팅 slug 는 플랫폼(control-tower)이 관리하며 DB 가 단일 출처다.
import type { RequestEvent } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { softLoad } from '$lib/server/http/softLoad';

/** 조직에 부여된(resolved) AI 도구: csc-groupware 응답 형태 */
export interface ResolvedAiTool {
  key: string;
  name: string;
  slug: string;
}

/**
 * 조직 부여 도구 목록. 실패하면 빈 목록으로 접는다.
 *
 * 폴백이 뜻하는 바는 호출부마다 다르다. 서브 앱바는 항목을 비우고(미표시), 도구 셸 가드는 도구를
 * 확인하지 못해 통과시키지 않는다. 그래서 이 함수는 목록만 돌려주고 판단은 호출부에 맡긴다.
 *
 * 응답 항목의 형태 검증도 호출부가 한다. 필요한 필드가 서로 다르기 때문이다(앱바는 name,
 * 셸 가드는 slug). 여기서 둘 다 요구하면 한쪽만 온 항목의 취급이 조용히 바뀐다.
 */
export function loadOrgAiTools(
  event: RequestEvent,
  organizationId: number
): Promise<ResolvedAiTool[]> {
  return softLoad<ResolvedAiTool[]>(
    '조직 AI 도구 목록',
    async () => {
      const res = await authMainClient(event).GET<ResolvedAiTool[]>(
        `/organizations/${organizationId}/ai-tools`
      );
      return Array.isArray(res.data) ? res.data : [];
    },
    []
  );
}
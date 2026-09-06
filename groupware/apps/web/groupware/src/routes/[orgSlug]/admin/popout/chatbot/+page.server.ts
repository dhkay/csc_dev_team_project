import { redirect } from '@sveltejs/kit';
import { canUseAiAssistant } from '$lib/shared/lib/auth/access';
import type { PageServerLoad } from './$types';

/**
 * AI 챗봇 팝아웃 가드: AI 어시스턴트는 기본 제공 도구라 별도 엔타이틀먼트 없이 인증된 조직 유저면 진입 가능
 *
 * 상위 admin/+layout.server.ts 가 인증/역할/슬러그를 이미 처리한다. 접근 정책의 단일 출처는
 * canUseAiAssistant(access.ts): SubAppBar 가시성 + BFF requireIdentity 와 같은 헬퍼를 공유한다.
 * (지금은 인증된 유저 전원 통과. 다시 엔타이틀먼트로 잠그면 이 게이트도 함께 잠긴다.)
 */
export const load: PageServerLoad = async (event) => {
  const user = await event.locals.getUser();
  const slug = user?.organization?.slug;
  if (!slug) {
    throw redirect(302, '/login');
  }

  if (!canUseAiAssistant(user)) {
    throw redirect(302, `/${slug}/admin`);
  }
};

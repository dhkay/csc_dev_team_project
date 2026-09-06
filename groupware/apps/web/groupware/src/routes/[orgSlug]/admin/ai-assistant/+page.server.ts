import { redirect } from '@sveltejs/kit';
import { serverMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { hasRootAuthority } from '$lib/shared/lib/auth/access';
import type {
  AssistantModelOption,
  OrganizationAssistantSettings,
} from '$lib/features/assistant-settings/types';
import type { PageServerLoad } from './$types';

/**
 * /[orgSlug]/admin/ai-assistant 가드: 조직 AI 어시스턴트 설정(조직 기본 모델/프롬프트 추가)
 * 루트 권한자(ROOT/대표) 전용. 상위 admin 레이아웃이 isAdmin+slug 를, 여기서 hasRootAuthority 를
 * 추가 검증(타일 숨김은 UX, URL 직접 접근 차단은 서버 가드 책임). 조직 설정은 SSR 로드로 초기값 제공
 */
export const load: PageServerLoad = async (event) => {
  const user = await event.locals.getUser();
  if (!hasRootAuthority(user)) {
    throw redirect(302, `/${event.params.orgSlug}/admin`);
  }
  const orgId = user?.organization?.id;
  let settings: OrganizationAssistantSettings = { defaultModel: null, promptAddition: null };
  let models: AssistantModelOption[] = [];
  if (orgId != null) {
    const client = serverMainClient();
    try {
      const res = await client.GET<OrganizationAssistantSettings>(
        `/assistant-settings?organizationId=${orgId}`,
      );
      if (res.data) settings = res.data;
    } catch (e) {
      console.error('조직 AI 어시스턴트 설정 조회 실패:', e instanceof Error ? e.message : 'unknown');
    }
    try {
      const res = await client.GET<AssistantModelOption[]>(
        `/assistant-settings/models?organizationId=${orgId}`,
      );
      models = res.data ?? [];
    } catch (e) {
      console.error('조직 AI 어시스턴트 모델 목록 조회 실패:', e instanceof Error ? e.message : 'unknown');
    }
  }
  return { settings, models };
};

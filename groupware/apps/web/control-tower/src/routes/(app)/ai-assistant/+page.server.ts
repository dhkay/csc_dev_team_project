import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { isPlatformRoot } from '$lib/shared/lib/auth/platform';
import type { PlatformAssistantSettings } from '$lib/features/assistant-settings/types';

// AI 어시스턴트 전역 설정: ROOT 전용. (app) 그룹 가드(isPlatformAdmin) 위에 ROOT 가드를 더한다.
//
// AI 어시스턴트는 AI 도구 부여 체계와 별개인 전 조직 공통 제공 챗봇이다. 이 화면이 다루는 건
// 전역 킬스위치와 공통 프롬프트 둘뿐이다(모델 선택은 조직 몫: 그룹웨어 조직 관리)
// 설정 SSOT = userdb, control-tower→user 위임으로 편집
export const load: PageServerLoad = async (event) => {
  if (!isPlatformRoot(await event.locals.getUser())) {
    throw redirect(302, '/');
  }
  let settings: PlatformAssistantSettings = { globalEnabled: true, commonPrompt: null };
  try {
    const res = await authControlClient(event).GET<PlatformAssistantSettings>(
      '/platform/assistant-settings',
    );
    if (res.data) settings = res.data;
  } catch (e) {
    console.error('AI 어시스턴트 설정 조회 실패:', e instanceof Error ? e.message : 'unknown');
  }
  return { settings };
};

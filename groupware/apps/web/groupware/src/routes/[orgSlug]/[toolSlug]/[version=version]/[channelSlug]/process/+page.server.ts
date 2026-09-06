import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { workspaceBasePath } from '$lib/pages/tools/marketing-video/workspaceUrl';
import type { ProcessView } from '$lib/features/marketing-channels/types';

// 프로세스(읽기전용 타임라인): 채널의 전체 제작 파이프라인(3단계 × 실행 스텝)을 조회한다. 프롬프트가 주입되는
//   스텝에는 실제 프롬프트(원문/번역)가 조립 순서대로 실려 온다.
//   접근 게이트(뷰)는 부모 [toolSlug] 레이아웃. 편집 권한(canEditSettings)은 부모에서 받아 편집 버튼 노출에만 쓴다.
//   organizationId 를 백엔드로 전달(타 org 격리). 실패해도 빈 stages 로 페이지가 깨지지 않게 한다.

export const load: PageServerLoad = async (event) => {
  const { currentChannelId, canEditSettings, isToolManager, version } = await event.parent();
  // 프로세스는 관리급(루트/대표/팀장 = isToolManager)만. nav 숨김의 하드 게이트: 직접 URL 접근도 워크스페이스로 되돌린다.
  if (!isToolManager) {
    const { orgSlug, toolSlug, channelSlug } = event.params;
    throw redirect(302, workspaceBasePath({ orgSlug, toolSlug, version, channelSlug }));
  }

  const user = await event.locals.getUser();
  const orgId = user?.organization?.id ?? null;
  // 파이프라인에 표시되는 모델은 보는 사람이 고른 값이라 userId 도 넘긴다(모델 선택은 개인 스코프)
  const userId = event.locals.userId ?? null;

  let process: ProcessView = { stages: [] };
  if (currentChannelId != null && orgId != null && userId != null) {
    try {
      // 버전 스코프 경로: 프롬프트 조립 규칙이 버전마다 갈리므로 화면도 그 버전 것을 그린다.
      const res = await serverMarketingClient().GET<ProcessView>(
        `/v/${version}/channels/${currentChannelId}/process?organizationId=${orgId}&ownerUserId=${userId}`,
      );
      process = res.data ?? { stages: [] };
    } catch (e) {
      console.error('프로세스 조회 실패:', e instanceof Error ? e.message : 'unknown');
    }
  }

  return { process, channelId: currentChannelId, version, canEdit: canEditSettings ?? false };
};

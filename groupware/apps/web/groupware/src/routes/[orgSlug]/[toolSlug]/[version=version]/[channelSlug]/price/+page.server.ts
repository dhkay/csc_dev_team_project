import { redirect } from '@sveltejs/kit';
import { hasRootAuthority } from '$lib/shared/lib/auth/access';
import { workspaceBasePath } from '$lib/pages/tools/marketing-video/workspaceUrl';
import type { PageServerLoad } from './$types';

// 가격표는 관리급(루트/대표/팀장 = isToolManager, 부모 [toolSlug] 레이아웃 계산)만 볼 수 있다.
//   nav 숨김의 하드 게이트: 직접 URL 접근도 워크스페이스로 되돌린다.
//
// 단가/모델 목록은 정적 카탈로그(modelPricing.ts + aiModelOptions.ts)이고 조직 키 등록 여부는
// 클라이언트 쿼리(configuredProviders)라 서버에서 실어보낼 데이터는 없다. 대신 "키 등록" 링크를
// 띄울지만 정한다. 등록 화면(/admin/api-credentials)은 루트 권한자 전용이라, 팀장에게 링크를
// 보여주면 눌러도 리다이렉트로 튕긴다(그 화면 가드와 동일한 hasRootAuthority 로 판단)
export const load: PageServerLoad = async (event) => {
  const { isToolManager, version } = await event.parent();
  const { orgSlug, toolSlug, channelSlug } = event.params;
  if (!isToolManager) {
    throw redirect(302, workspaceBasePath({ orgSlug, toolSlug, version, channelSlug }));
  }

  const user = await event.locals.getUser();
  return {
    canManageCredentials: hasRootAuthority(user),
    credentialsHref: `/${orgSlug}/admin/api-credentials`,
  };
};

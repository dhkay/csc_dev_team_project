import { redirect } from '@sveltejs/kit';
import { sectionPath, workspaceBasePath } from '$lib/pages/tools/marketing-video/workspaceUrl';
import type { PageServerLoad } from './$types';

// 레거시 경로: '프롬프트'는 '프로세스'로 이름이 바뀌었다. 구 북마크/링크(/prompt)를 /process 로 영구 리다이렉트한다.
export const load: PageServerLoad = async (event) => {
  const { version } = await event.parent();
  const { orgSlug, toolSlug, channelSlug } = event.params;
  const base = workspaceBasePath({ orgSlug, toolSlug, version, channelSlug });
  redirect(308, `${sectionPath(base, 'process')}${event.url.search}`);
};

// 채널 워크스페이스 레이아웃 로드: URL 채널 slug 로 현재 채널을 확정해 모든 채널 하위 페이지
// (그리드/상세/섹션)가 상속한다. 채널 해석/리다이렉트는 공용 resolveCurrentChannel 에 위임
// 이름도 함께 내린다: 앱바 드롭다운이 목록을 받기 전에도 현재 채널을 표시할 수 있게(자리표시자 깜빡임 제거)
//
// 섹션 게이트도 여기가 소유한다(아래 주석 참고)
import { redirect } from '@sveltejs/kit';
import { resolveCurrentChannel } from '$lib/server/marketing/resolveChannel';
import { hasSection } from '$lib/pages/tools/marketing-video/versionProfile';
import { sectionFromPath, workspaceBasePath } from '$lib/pages/tools/marketing-video/workspaceUrl';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  const { tool, version } = await event.parent();
  const current = await resolveCurrentChannel(event, tool.key);

  // 이 버전에 없는 섹션은 주소로 열어도 막는다(가시성은 UX 이고 경계는 서버에 있다)
  //
  // 섹션마다가 아니라 여기에 두는 이유: 섹션 파일에 두면 새 섹션이 게이트 없이 추가될 수 있고,
  //   그 빠짐은 "다른 버전에서 주소로 열면 들어가진다" 로만 드러난다(v1.5 의 에셋이 그랬다)
  //   레이아웃은 모든 하위 섹션이 반드시 지나므로, 지금 있는 섹션도 나중에 생길 섹션도 자동으로 덮인다.
  //   섹션 판정은 nav 하이라이트와 같은 함수(sectionFromPath)를 쓴다: 둘이 갈리면 사이드바에서
  //   눌리는데 열리지 않는(또는 그 반대) 자리가 생긴다.
  const { orgSlug, toolSlug, channelSlug } = event.params;
  const base = workspaceBasePath({ orgSlug, toolSlug, version, channelSlug });
  const section = sectionFromPath(event.url.pathname, base);
  if (!hasSection(version, section)) throw redirect(307, base);

  return { currentChannelId: current.id, currentChannelName: current.name };
};

import { loadOrgAiTools, type ResolvedAiTool } from '$lib/server/ai-tools/orgAiTools';
import { hasRootAuthority } from '$lib/shared/lib/auth/access';
import type { ShellChrome } from '$lib/widgets/AdminShell/shellChrome';
import type { SubAppBarData } from '$lib/widgets/SubAppBar/subAppBar.types';
import type { PageServerLoad } from './$types';

/**
 * 관리자 대시보드: 서브 앱바 항목 구성
 *
 * 이 조직에 부여된 AI 도구를 실시간 조회해 서브 앱바에 좌측 버튼으로 노출한다(표시명 = name)
 * 체인: BFF(SSR) → csc-groupware → user 서버(엔타이틀먼트 SSoT). orgId 는 백엔드 검증된
 * 세션(부모 레이아웃 getUser→find/data)에서 도출해 전달한다(클라이언트 비선택: 인가 경계)
 * 표시명/slug 는 플랫폼(control-tower)에서 관리하며 DB 가 단일 출처다.
 * (.claude/rules/multi-tenancy.md: 엔타이틀먼트, request-flow.md: 게이트키퍼 위임)
 *
 * 부여 도구가 없으면 서브 앱바 항목을 비워(미표시) 둔다. 도구가 있으면 각 도구를 좌측 버튼으로
 * 나열한다(클릭 시 SubAppBar 가 '기능 준비중' 토스트: 목적지 라우트는 추후 slug 로 href 연결)
 * 서브 앱바는 페이지별로 다른 용도로 쓰는 제네릭 영역이라, 이 페이지의 항목 구성은 여기서만 결정한다.
 */
export const load: PageServerLoad = async (event) => {
  const { user } = await event.parent();

  // 표시명이 없는 항목은 버튼으로 만들 수 없으므로 여기서 걸러낸다(폴백은 빈 목록 = 미표시)
  let tools: ResolvedAiTool[] = [];
  if (user?.organization?.id) {
    const resolved = await loadOrgAiTools(event, user.organization.id);
    tools = resolved.filter((t) => typeof t?.name === 'string');
  }

  // 각 부여 도구 = 좌측 버튼(표시명): 이 유저가 그 AI도구의 유효 엔타이틀먼트를 보유한 것만 노출
  // (조직 부여 ∩ 유저 보유). 루트 권한자(ROOT/대표)는 조직 보유 도구 전부 사용 가능하므로 전체 노출한다.
  // role/permissions 는 부모 레이아웃 getUser(find/data, 실시간) 값이라 토큰 갱신 없이도 즉시 반영된다.
  // (aiTools 토큰 클레임은 그 외 유저 게이팅용: 재로그인/리프레시로 반영.)
  // slug 만 싣는다. 어느 탭에서 띄우는가는 클라이언트의 aiWorkspaceTabs 가 정한다: 규칙이 한 곳에
  // 있어야 도구가 로비와 같은 탭에서 열리는 사고를 막는다. slug 가 없으면 SubAppBar 가 '준비중' 토스트
  // 목적지인 도구 랜딩(범용 [toolSlug] 라우트)이 조직 부여∩유저 엔타이틀먼트를 서버에서 다시 게이트한다.
  const root = hasRootAuthority(user);
  const owned = new Set<string>(user?.aiTools ?? []);
  const items = tools
    .filter((t) => root || owned.has(t.key))
    .map((t) => (t.slug ? { label: t.name, slug: t.slug } : { label: t.name }));

  return {
    subAppBar: { items } satisfies SubAppBarData,
    // 하단 공지 바는 여기 하나가 띄운다. 로비는 사람이 들어와 머무는 자리라 공지가 읽힌다.
    //   하위 작업 화면(사용자 관리, 조직 관리, 스토리지 등)은 세로를 자기 것으로 쓰므로 감춘다.
    //   (계약과 근거: widgets/AdminShell/shellChrome.ts)
    chrome: { bottomBar: true } satisfies ShellChrome,
  };
};

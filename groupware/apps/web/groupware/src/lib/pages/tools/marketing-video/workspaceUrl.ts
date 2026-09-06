// 마케팅 영상 워크스페이스: 뷰 상태 ↔ URL 매핑(단일 출처, 순수 함수)
// 섹션은 라우트(그리드=베이스, 나머지=베이스/{section}), 제작 3단계 탭은 그리드의 쿼리 ?tab= 로 싣는다.
// 기획안 상세는 별도 라우트(/plans/:id)라 여기서 다루지 않는다.
// 제작 3단계: plan(기획안) → source(AI 합성 영상) → final(세트/자막 입힌 배포본. 원천 1:N 최종)
// 탭 key 는 두 버전이 같고 라벨만 갈린다(versionProfile.tabLabels). key 를 버전별로 나누면
// ?tab= 링크가 버전을 옮길 때 깨지고, 저장된 북마크가 어느 버전에서 왔는지에 따라 다른 탭을 연다.
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';

export type WorkspaceSection =
  | 'workspace'
  | 'archive'
  | 'settings'
  | 'assets'
  | 'process'
  | 'price'
  | 'log';
export type WorkspaceTab = 'plan' | 'source' | 'final';

/**
 * 워크스페이스 하나를 가리키는 좌표. 주소의 네 조각과 1:1 이다.
 *
 * 버전이 채널보다 위인 이유: 채널 목록은 두 버전이 공유하지만(채널 표에 버전 컬럼이 없다) 그
 * 안의 워크스페이스 내용이 갈린다. 버전을 채널 아래 두면 채널 전환 링크마다 버전을 다시 이어붙여야
 * 하고, 한 곳만 빠뜨려도 조용히 사라진다.
 */
export interface WorkspaceRoute {
  orgSlug: string;
  toolSlug: string;
  version: VersionMode;
  channelSlug: string;
}

/** 도구 안에서 버전까지의 경로(채널 전환/버전 전환의 기준) */
export function versionBasePath(route: Omit<WorkspaceRoute, 'channelSlug'>): string {
  return `/${route.orgSlug}/${route.toolSlug}/${route.version}`;
}

/**
 * 채널 워크스페이스 베이스. 아래 sectionPath/tabUrl 이 받는 그 basePath 다
 *
 * 버전이 여기 들어 있으므로 섹션/탭 함수는 한 글자도 바뀌지 않는다: 셋 다 basePath 를 인자로
 * 받아 앞을 잘라내므로 세그먼트 수와 무관하다.
 *
 * 채널 조각은 퍼센트 인코딩한다. 채널 slug 는 사람이 지은 이름에서 나와 한글이 정상 값인데,
 * params 는 디코딩된 값이고 URL.pathname 과 Location 헤더는 인코딩된 값이다. 그대로 이으면
 * pathname 비교(sectionFromPath)가 늘 어긋나고, Response 는 헤더에 Latin1 밖 문자를 받지 않아
 * 서버 리다이렉트가 500 으로 죽는다. 조직/도구 slug 는 플랫폼이 ASCII 로 관리하므로 그대로 둔다.
 */
export function workspaceBasePath(route: WorkspaceRoute): string {
  return `${versionBasePath(route)}/${encodeURIComponent(route.channelSlug)}`;
}

/**
 * 버전만 갈아끼운다: 채널/섹션/쿼리(?tab= 포함)를 그대로 보존한다.
 *
 * 대상 버전에 없는 섹션이면 그 버전의 워크스페이스 베이스로 접는다(예: v1.0 의 에셋에서 v1.5 로)
 * 그러지 않으면 전환 직후 서버 게이트가 다시 리다이렉트해 화면이 두 번 튄다.
 */
export function swapVersion(
  url: URL,
  from: WorkspaceRoute,
  to: VersionMode,
  hasSection: (version: VersionMode, section: WorkspaceSection) => boolean,
): string {
  const section = sectionFromPath(url.pathname, workspaceBasePath(from));
  const nextBase = workspaceBasePath({ ...from, version: to });
  if (!hasSection(to, section)) return nextBase;
  const rest = url.pathname.slice(workspaceBasePath(from).length);
  return `${nextBase}${rest}${url.search}`;
}

/** 섹션 → 경로. 그리드(workspace)=베이스, 나머지=베이스/{section}. */
export function sectionPath(basePath: string, section: WorkspaceSection): string {
  return section === 'workspace' ? basePath : `${basePath}/${section}`;
}

/** URL 경로 → 활성 섹션. 상세(/plans/...)와 베이스는 workspace 로 본다(nav 하이라이트) */
export function sectionFromPath(pathname: string, basePath: string): WorkspaceSection {
  const rest = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : '';
  if (rest.startsWith('/archive')) return 'archive';
  if (rest.startsWith('/assets')) return 'assets';
  if (rest.startsWith('/process')) return 'process';
  if (rest.startsWith('/prompt')) return 'process'; // 레거시 /prompt: /process 로 리다이렉트되며, 그 사이 nav 하이라이트 유지.
  if (rest.startsWith('/price')) return 'price';
  if (rest.startsWith('/log')) return 'log';
  if (rest.startsWith('/settings')) return 'settings';
  return 'workspace';
}

/** 탭 순서(토글 렌더 + 활성 인덱스의 SSOT). 새 탭 추가 = 여기 + 두 라벨 맵에 한 줄씩 */
export const TABS: readonly WorkspaceTab[] = ['plan', 'source', 'final'];

/** ?tab= → 기획안/원천/최종 탭(미지/누락은 plan). 레거시 'video'(구 '영상' 탭)는 'source'(원천)로 매핑 */
export function readTab(url: URL): WorkspaceTab {
  const t = url.searchParams.get('tab');
  if (t === 'video') return 'source'; // 구 링크/북마크 호환.
  return (TABS as readonly string[]).includes(t ?? '') ? (t as WorkspaceTab) : 'plan';
}

/** 탭을 반영한 그리드 URL(경로+쿼리). 기본값(plan)은 생략하고 무관 쿼리는 보존한다. */
export function tabUrl(basePath: string, current: URLSearchParams, tab: WorkspaceTab): string {
  const p = new URLSearchParams(current);
  if (tab === 'plan') p.delete('tab');
  else p.set('tab', tab);
  const q = p.toString();
  return q ? `${basePath}?${q}` : basePath;
}

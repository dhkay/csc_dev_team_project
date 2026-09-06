/**
 * AI 워크스페이스(로비) 탭과 AI 도구 탭의 이름 규칙
 *
 * 두 방향이 같은 이름을 봐야 성립하므로 이 파일 하나가 소유한다. 로비에서 도구로 갈 때는
 * `target={aiToolTabName(slug)}`, 도구에서 로비로 올 때는 앱바 로고가
 * `target={AI_WORKSPACE_TAB_NAME}` 을 쓴다. 도구마다 탭 하나이고 다시 눌러도 쌓이지 않는다.
 *
 * 이름으로 지목하는 링크는 브라우저가 탭을 찾아 전환하므로 팝업 차단이나 `window.focus()`
 * 제약에 걸리지 않고 가운데 클릭과 링크 복사도 그대로 된다.
 *
 * 두 가지가 지켜져야 동작한다.
 *   1) 로비 탭이 이름을 갖고 있어야 한다(`markAiWorkspaceTab`). 이름 없는 탭은 지목할 수 없다.
 *   2) 도구 링크에 `rel="noopener"` 를 붙이면 안 된다. 새 탭이 별도 browsing context group 으로
 *      떨어져 이름 조회 대상에서 빠진다(같은 origin 이라 보안상 필요도 없다).
 */

/** 로비(AI 워크스페이스) 탭 이름. 관리자 셸이 자기 탭에 심고, 도구 앱바 로고가 이 이름을 지목한다. */
export const AI_WORKSPACE_TAB_NAME = 'csc:ai-workspace';

/** AI 도구 탭 이름. 도구마다 갈라 도구별로 탭 하나를 유지한다. */
export function aiToolTabName(toolSlug: string): string {
  return `csc:ai-tool:${toolSlug}`;
}

/**
 * 이 탭을 로비 탭으로 표시한다(관리자 셸 마운트 시 1회)
 *
 * `window.name` 은 같은 origin 안에서 탭 수명 내내 유지되므로, 로비 안에서 다른 관리자 화면으로
 * 옮겨 다녀도 도구는 계속 이 탭을 찾는다. 팝아웃 창들은 관리자 셸을 거치지 않아(`+layout@` 리셋)
 * 자기 창 이름을 잃지 않는다.
 */
export function markAiWorkspaceTab(): void {
  window.name = AI_WORKSPACE_TAB_NAME;
}
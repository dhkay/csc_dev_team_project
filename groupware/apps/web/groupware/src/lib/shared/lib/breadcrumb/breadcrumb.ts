// 서브 앱바(경로 모드)용 브레드크럼 빌더
//
// 관리자 셸(/[orgSlug]/admin/*) 안에서 현재 URL 경로를 `관리자 › … › 현재` 크럼으로 변환한다.
// 대시보드(/[orgSlug]/admin)는 서브 앱바를 AI도구 바로 쓰므로 이 빌더를 거치지 않는다.
// (SubAppBar 가 page.data.subAppBar 주입 여부로 분기: 주입 없으면 이 경로 모드)
//
// 라우트 세그먼트 ↔ 라벨은 여기 한 곳에서만 관리한다(대시보드 타일 제목과 정렬)
// 새 admin 하위 라우트가 생기면 ADMIN_SEGMENT_LABELS 에 한 줄만 추가하면 자동으로 크럼이 붙는다.

/** admin 하위 경로 세그먼트 → 표시 라벨. 미정의 세그먼트는 세그먼트 문자열을 폴백으로 쓴다. */
const ADMIN_SEGMENT_LABELS: Record<string, string> = {
  users: '사용자 관리',
  organization: '조직 관리',
  roles: '권한 관리',
  storage: '스토리지',
};

/** admin 루트(대시보드) 크럼 라벨 */
const ADMIN_ROOT_LABEL = '관리자';

export interface Crumb {
  label: string;
  // 클릭 시 이동할 절대 경로
  href: string;
  // 현재 위치(마지막 크럼): 링크가 아니라 강조 텍스트로 렌더
  current: boolean;
}

/**
 * `/{orgSlug}/admin[/seg...]` 경로에서 브레드크럼을 만든다.
 * - 항상 `관리자`(대시보드) 크럼으로 시작한다.
 * - 이후 각 세그먼트마다 누적 경로(href)와 라벨로 크럼을 쌓는다.
 * - 마지막 크럼은 current=true(현재 페이지)
 * admin 세그먼트가 없으면(=관리자 셸 밖) 빈 배열을 반환한다.
 */
export function buildAdminBreadcrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean); // ['{orgSlug}', 'admin', ...rest]
  const adminIdx = parts.indexOf('admin');
  if (adminIdx === -1) return [];

  const base = `/${parts.slice(0, adminIdx + 1).join('/')}`; // /{orgSlug}/admin
  const rest = parts.slice(adminIdx + 1);

  const crumbs: Crumb[] = [
    { label: ADMIN_ROOT_LABEL, href: base, current: rest.length === 0 },
  ];

  let href = base;
  rest.forEach((seg, i) => {
    href += `/${seg}`;
    crumbs.push({
      label: ADMIN_SEGMENT_LABELS[seg] ?? seg,
      href,
      current: i === rest.length - 1,
    });
  });

  return crumbs;
}

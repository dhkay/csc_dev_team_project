/**
 * CSC Partners 플랫폼 사이드바 네비게이션: 데이터 주도
 * 메뉴 추가 = 이 배열에 한 줄 + (필요 시) Icon.svelte 에 아이콘 key 추가
 * 위젯 컴포넌트는 수정 불필요
 *
 * 조직 CRUD / 루트 계정 등 일부 라우트는 준비중. 후속 작업에서 (app)/organizations 등으로 추가한다.
 */
export interface NavItem {
  id: string;
  label: string;
  href: string;
  // Icon.svelte 의 name key
  icon: string;
  // 노출 조건(접근 차단): 플랫폼 관리자 옵션 key. 지정 시 ROOT 또는 이 옵션을 가진 ADMIN 에게만 보인다.
  // (PlatformSidebar 가 `hasAdminFeature` 로 필터)
  feature?: string;
  // ROOT 전용 메뉴(관리자 관리 등): `feature` 보다 우선
  rootOnly?: boolean;
}

export const navItems: NavItem[] = [
  // 노출은 권한 기반: feature 지정 항목은 ROOT/해당 옵션 ADMIN 만, rootOnly 는 ROOT 만
  // 순서: 관리자 관리 → 조직 관리 → AI도구 관리
  { id: 'admins', label: '관리자 관리', href: '/admins', icon: 'user', rootOnly: true },
  { id: 'orgs', label: '조직 관리', href: '/organizations', icon: 'building', feature: 'org-management' },
  { id: 'ai-tools', label: 'AI도구 관리', href: '/ai-tools', icon: 'ai', feature: 'ai-tools-management' },
  // AI 어시스턴트 = 전 조직 공통 제공 챗봇(AI 도구 부여 체계와 별개). 'AI도구 관리' 밖 독립 섹션
  { id: 'ai-assistant', label: 'AI 어시스턴트', href: '/ai-assistant', icon: 'assistant', rootOnly: true },
  { id: 'servers', label: '서버 관리', href: '/servers', icon: 'server', rootOnly: true },
  // { id: 'dashboard', label: '대시보드', href: '/', icon: 'home' },
  // { id: 'settings', label: '설정', href: '/settings', icon: 'gear' },
];

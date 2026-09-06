// 관리자 타일 그리드 도메인 타입 (레이아웃 스캐폴딩)

/** 타일 크기: 너비는 동일(1칸 폭), 높이만 다름. 2x2=높음(2행), 2x1=낮음(1행) */
export type TileSize = '2x2' | '2x1';

/** 타일 일러스트 키: static/assets/icon/dashboard/{key}.svg 파일과 1:1. */
export type TileIconName =
  | 'users'
  | 'org'
  | 'roles'
  | 'content'
  | 'stats'
  | 'settings'
  | 'logs'
  | 'billing'
  | 'storage';

interface TileBase {
  // 안정적 식별자: #each 키 및 removeTile 인자로 사용
  id: string;
  size: TileSize;
  // 조직 관리 권한 필요. true 면 조직 관리 가능자(ROOT 또는 시스템관리 권한)에게만 노출
  // 인가가 아닌 UX 가시성 제어(URL 직접 접근 차단은 각 페이지 서버 가드 책임)
  requireOrgManage?: boolean;
  // 루트 권한 필요. true 면 루트 권한자(ROOT 또는 대표)에게만 노출
  // requireOrgManage 보다 강한 게이트(시스템관리 권한자는 제외). UX 가시성 제어 전용
  requireRootAuthority?: boolean;
  // 임시 숨김: 정의는 유지하되 UI 에서만 가린다(삭제 아님). 기능 재오픈 시 플래그만 제거
  hidden?: boolean;
}

/** 내정보 카드 타일 (콘텐츠는 MyInfoCard가 담당) */
export interface MyInfoTile extends TileBase {
  kind: 'myInfo';
}

/** 시스템 환경설정 카드 타일 (콘텐츠는 SystemSettingsCard가 담당: 2x2 그리드) */
export interface SystemSettingsTile extends TileBase {
  kind: 'systemSettings';
}

/** 일반 플레이스홀더 타일 (제목/부제/아이콘 표시) */
export interface PlaceholderTile extends TileBase {
  kind: 'placeholder';
  title: string;
  subtitle?: string;
  // 일러스트 키. 지정 시 우하단에 SVG 일러스트를 깔고 emoji `icon` 은 무시한다.
  iconName?: TileIconName;
  // 플레이스홀더 아이콘(이모지/이니셜): iconName 미지정 시 폴백
  icon?: string;
  // 클릭 시 이동할 admin 하위 세그먼트(orgSlug 기준 상대): 예: 'users' → /{slug}/admin/users.
  // 생략 시 비-내비게이션(정적 카드)
  href?: string;
}

export type Tile = MyInfoTile | SystemSettingsTile | PlaceholderTile;

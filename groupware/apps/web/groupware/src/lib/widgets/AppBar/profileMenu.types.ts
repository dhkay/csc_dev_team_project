// 앱바 프로필 드롭다운 메뉴: 데이터 주도 항목 계약(단일 출처)
// 항목은 페이지마다 다를 수 있어 선언형 데이터로 표현한다(렌더/닫힘/외부클릭은 ProfileMenu 가 담당)
// 확장: 새 항목은 이 타입을 만족하는 객체로 추가하면 되고, 새 아이콘이 필요하면 ProfileMenuIcon 에 키 추가

/** 메뉴 항목 좌측 아이콘 키: ProfileMenu 가 키→svg 로 렌더. 새 아이콘은 여기에 키 추가 + snippet 분기 */
export type ProfileMenuIcon = 'settings' | 'logout' | 'home';

export interface ProfileMenuItem {
  // 고유 id: each 키/추적용
  id: string;
  label: string;
  icon?: ProfileMenuIcon;
  // 링크 항목이면 href(a 태그로 렌더). onSelect 와 배타적
  href?: string;
  // 액션 항목이면 클릭 핸들러(선택 후 메뉴 닫힘)
  onSelect?: () => void;
  // 위험 강조(로그아웃/삭제 등): 빨강 톤
  danger?: boolean;
  disabled?: boolean;
  // 이 항목 위에 구분선 표시(그룹 구분)
  separatorBefore?: boolean;
}

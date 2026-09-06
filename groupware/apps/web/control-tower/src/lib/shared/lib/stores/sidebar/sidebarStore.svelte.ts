import { browser } from '$app/environment';

/**
 * 플랫폼 셸 사이드바 상태 스토어 (싱글톤)
 *
 * 두 상태를 독립적으로 보유한다:
 * - mobileOpen: < lg 에서 오프캔버스 드로어 열림/닫힘 (라우트 이동, 백드롭, ESC 로 닫음)
 * - collapsed : ≥ lg 에서 펼침 ↔ 아이콘 레일 토글. 사용자 선호이므로 localStorage 에 영속화한다.
 *
 * 반응형 분기 자체는 Tailwind `lg` variant 가 담당하고, 이 스토어는 토글 의도만 들고 있다.
 */
const COLLAPSED_KEY = 'platform.sidebar.collapsed';

class SidebarStore {
  private _mobileOpen = $state(false);
  private _collapsed = $state(false);

  constructor() {
    if (browser) {
      this._collapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
    }
  }

  /** 모바일 드로어 열림 여부 */
  get mobileOpen(): boolean {
    return this._mobileOpen;
  }

  /** 데스크톱 레일(아이콘 전용) 접힘 여부 */
  get collapsed(): boolean {
    return this._collapsed;
  }

  /** 모바일 드로어 토글 (햄버거) */
  toggleMobile = (): void => {
    this._mobileOpen = !this._mobileOpen;
  };

  /** 모바일 드로어 닫기 (백드롭, 네비 클릭, ESC) */
  closeMobile = (): void => {
    this._mobileOpen = false;
  };

  /** 데스크톱 레일 토글: 선호를 localStorage 에 저장 */
  toggleCollapsed = (): void => {
    this._collapsed = !this._collapsed;
    if (browser) {
      localStorage.setItem(COLLAPSED_KEY, this._collapsed ? '1' : '0');
    }
  };
}

export const sidebarStore = new SidebarStore();

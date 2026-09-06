import { openPopout } from '@csc/shared-ui/popout';
import { popouts } from '$lib/shared/lib/popout/popouts';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { ProfileMenuItem } from '$lib/widgets/AppBar/profileMenu.types';

// 앱바 프로필 드롭다운 공통 항목/합성: 여러 셸(admin/도구)이 재사용해 중복을 없앤다.
// 핸들러(팝아웃/로그아웃)는 클릭 시점(클라이언트)에만 window/fetch 를 쓰므로 SSR 안전하다.

/** 로그아웃: BFF 쿠키 정리 후 로그인으로. 실패해도 로그인으로 보낸다(쿠키는 서버가 정리) */
async function logout(): Promise<void> {
  try {
    await fetch(ROUTES.AUTH.LOGOUT, { method: 'POST' });
  } catch {
    // 네트워크 실패해도 로그인 흐름에서 정리된다.
  }
  window.location.href = '/login';
}

/** 환경설정(본인 계정/프로필) 팝아웃 항목: account-settings 라우트(관리자 가드 하위) */
function accountSettingsItem(orgSlug: string): ProfileMenuItem {
  return {
    id: 'settings',
    label: '환경설정',
    icon: 'settings',
    onSelect: () => {
      if (orgSlug) openPopout(popouts.accountSettings(orgSlug));
    },
  };
}

/** 로그아웃 항목(공통: 로그인 유저면 누구나) */
function logoutItem(): ProfileMenuItem {
  return { id: 'logout', label: '로그아웃', icon: 'logout', danger: true, onSelect: logout };
}

/** 공통 계정 항목(환경설정 + 로그아웃): 앱바 프로필 드롭다운 기본 그룹 */
export function accountMenuItems(orgSlug: string): ProfileMenuItem[] {
  return [accountSettingsItem(orgSlug), logoutItem()];
}

/**
 * 페이지 항목(profileMenuStore)을 기본 메뉴 위에 얹어 합성: 둘 사이 구분선
 * pageItems 가 없으면 base 그대로 반환한다.
 */
export function composePageMenu(
  base: ProfileMenuItem[],
  pageItems: ProfileMenuItem[],
): ProfileMenuItem[] {
  if (pageItems.length === 0) return base;
  return [...pageItems, { ...base[0], separatorBefore: true }, ...base.slice(1)];
}

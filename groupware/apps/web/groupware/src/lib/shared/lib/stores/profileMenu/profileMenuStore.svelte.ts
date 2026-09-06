import type { ProfileMenuItem } from '$lib/widgets/AppBar/profileMenu.types';

/**
 * 앱바 프로필 드롭다운: 페이지별 추가 항목 레지스트리
 *
 * 앱바는 셸(레이아웃)에 영속하지만 메뉴 항목은 페이지마다 다를 수 있다. 서버 load 데이터로는
 * 핸들러(onSelect) 를 실을 수 없으므로(직렬화 불가), 페이지가 이 클라이언트 스토어에 항목을
 * 등록한다. 셸은 공통 항목(환경설정/로그아웃 등)과 이 페이지 항목을 합성해 앱바에 내려준다.
 *
 * 사용(페이지 컴포넌트):
 *   $effect(() => {
 *     profileMenuStore.setPageItems([{ id: 'x', label: '...', onSelect }]);
 *     return () => profileMenuStore.reset();   // 이탈 시 정리(다음 페이지로 누수 방지)
 *   });
 */
class ProfileMenuStore {
  /** 현재 페이지가 기여한 항목(공통 항목 위에 얹힌다) */
  pageItems = $state<ProfileMenuItem[]>([]);

  setPageItems(items: ProfileMenuItem[]): void {
    this.pageItems = items;
  }

  reset(): void {
    this.pageItems = [];
  }
}

export const profileMenuStore = new ProfileMenuStore();

import type { Tile } from './tile.types';

/**
 * 관리자 타일 그리드 스토어 (Svelte 5 runes, 싱글톤: viewportStore 패턴)
 *
 * 타일을 하드코딩하지 않고 반응형 배열로 보유한다 → 추후 삭제/추가를 데이터 계층에서
 * 트리비얼하게 지원. 현재 UI에는 삭제/추가 버튼이 없다(메서드만 선반영)
 */
class TilesStore {
  private _tiles = $state<Tile[]>([
    // 첫 칸: 내정보 카드 (콘텐츠는 MyInfoCard)
    { id: 'my-info', kind: 'myInfo', size: '2x2' },
    // 내정보 우측: 시스템 환경설정 카드(2x2 그리드). 루트 권한자(ROOT/대표) 전용
    { id: 'system-settings', kind: 'systemSettings', size: '2x2', requireRootAuthority: true },
    // 조직 관리 가능자(ROOT/시스템관리) 전용: 내정보 옆 한 칸에 위아래(2x1+2x1)로 쌓인다(자리 적게 차지)
    // , 사용자 관리(클릭 → /{slug}/admin/users), 조직 관리(클릭 → /{slug}/admin/organization)
    { id: 'users', kind: 'placeholder', title: '사용자 관리', subtitle: '계정/프로필', size: '2x1', iconName: 'users', requireOrgManage: true, href: 'users' },
    { id: 'org', kind: 'placeholder', title: '조직 관리', subtitle: '조직/부서', size: '2x1', iconName: 'org', requireOrgManage: true, href: 'organization' },
    // 스토리지: 공통/조직/개인 파일(클릭 → /{slug}/admin/storage). 전 조직원이 들어간다.
    //   개인 영역은 누구에게나 있고 공통은 조직 전원이 함께 쓰므로 관리 권한으로 가리지 않는다.
    { id: 'storage', kind: 'placeholder', title: '스토리지', subtitle: '파일/용량', size: '2x2', iconName: 'storage', href: 'storage' },
    // RBFR 연구(원료·처방 시뮬레이터, 클릭 → /{slug}/tools/rbfr). FeatureKey.Rbfr 게이팅이
    // 프론트까지 배선되기 전까지의 임시 등록 지점 — 조직 관리 가능자에게만 노출한다
    // (실제 5단계 내부 권한은 RBFR 도메인 자체 rbfr_user_roles가 별도로 관리, 02번 문서 참고).
    { id: 'rbfr', kind: 'placeholder', title: 'RBFR 연구', subtitle: '원료·처방 시뮬레이터', size: '2x1', iconName: 'rbfr', requireOrgManage: true, href: '/tools/rbfr' },
    // 아래 6개(권한 관리/콘텐츠/통계/설정/감사 로그/결제)는 한시적으로 숨김(hidden): 정의는 유지
    // 기능 재오픈 시 각 타일의 hidden 플래그만 제거하면 된다.
    // 조직 관리 가능자(ROOT/시스템관리) 전용: 역할/권한 부여 관리. 클릭 시 /{slug}/admin/roles.
    { id: 'roles', kind: 'placeholder', title: '권한 관리', subtitle: '역할/권한', size: '2x1', iconName: 'roles', requireOrgManage: true, href: 'roles', hidden: true },
    { id: 'content', kind: 'placeholder', title: '콘텐츠', size: '2x1', iconName: 'content', hidden: true },
    { id: 'stats', kind: 'placeholder', title: '통계', subtitle: '리포트', size: '2x2', iconName: 'stats', hidden: true },
    // 2x1 짝 ②: 세로로 쌓여 2x2 한 칸 높이를 형성
    { id: 'settings', kind: 'placeholder', title: '설정', size: '2x1', iconName: 'settings', hidden: true },
    { id: 'logs', kind: 'placeholder', title: '감사 로그', size: '2x1', iconName: 'logs', hidden: true },
    { id: 'billing', kind: 'placeholder', title: '결제', subtitle: '구독', size: '2x2', iconName: 'billing', hidden: true },
  ]);

  get tiles(): Tile[] {
    return this._tiles;
  }

  /**
   * 데이터 계층 삭제 훅: 현재 UI에 버튼은 없지만, 타일이 삭제될 수 있는 구조를 보장한다.
   * 새 배열 할당으로 반응성/SSR 안전성을 명확히 한다(splice 대신)
   */
  removeTile(id: string): void {
    this._tiles = this._tiles.filter((t) => t.id !== id);
  }
}

export const tilesStore = new TilesStore();

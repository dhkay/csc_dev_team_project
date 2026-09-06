import { describe, it, expect } from 'vitest';
import { OrgPosition, PermissionKey } from '@csc/entitlements';
import { hasRootAuthority, canManageOrg, isRoot, isAdmin } from '$lib/shared/lib/auth/access';

// 대표를 권한(permission)에서 직책(position)으로 이전: hasRootAuthority 는 이제 position 을 읽는다.
describe('access: hasRootAuthority (직책 기반 대표)', () => {
  it('ROOT 역할은 루트 권한자다', () => {
    expect(hasRootAuthority({ role: 'ROOT' })).toBe(true);
  });

  it('대표(position=REPRESENTATIVE)는 루트 권한자다', () => {
    expect(hasRootAuthority({ role: 'ADMIN', position: OrgPosition.Representative })).toBe(true);
  });

  it('팀장(position=TEAM_LEADER)은 루트 권한자가 아니다', () => {
    expect(hasRootAuthority({ role: 'ADMIN', position: OrgPosition.TeamLeader })).toBe(false);
  });

  it('직책 없는 ADMIN 은 루트 권한자가 아니다', () => {
    expect(hasRootAuthority({ role: 'ADMIN', position: null })).toBe(false);
  });

  it('null/undefined 는 false', () => {
    expect(hasRootAuthority(null)).toBe(false);
    expect(hasRootAuthority(undefined)).toBe(false);
  });
});

describe('access: canManageOrg', () => {
  it('대표(직책)는 조직 관리 가능', () => {
    expect(canManageOrg({ role: 'ADMIN', position: OrgPosition.Representative })).toBe(true);
  });

  it('시스템관리 권한 보유자는 조직 관리 가능', () => {
    expect(canManageOrg({ role: 'ADMIN', permissions: [PermissionKey.SystemManagement] })).toBe(
      true,
    );
  });

  it('직책, 권한 없는 ADMIN 은 조직 관리 불가', () => {
    expect(canManageOrg({ role: 'ADMIN', permissions: [], position: null })).toBe(false);
  });
});

describe('access: isRoot / isAdmin (직책 무관)', () => {
  it('isRoot 는 ROOT 역할만', () => {
    expect(isRoot({ role: 'ROOT' })).toBe(true);
    expect(isRoot({ role: 'ADMIN', position: OrgPosition.Representative })).toBe(false);
  });

  it('isAdmin 은 ROOT/ADMIN', () => {
    expect(isAdmin({ role: 'ROOT' })).toBe(true);
    expect(isAdmin({ role: 'ADMIN' })).toBe(true);
  });
});

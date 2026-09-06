import { describe, expect, it } from 'vitest';
import { buildScope, parseArea, resolveDepartmentId } from '$lib/server/storage/api';
import type { StorageAccess } from '$lib/server/storage/access';

/**
 * BFF 가 file-upload 로 보내는 스코프는 세션에서 도출한 값만 담아야 한다.
 * 브라우저가 정하는 것은 어느 영역의 어느 부서를 보는가 하나뿐이고, 그 하나도 인가 집합 안인지
 * 여기서 먼저 확인한다(서버가 다시 확인하지만, 사용자에게 보여 줄 문장은 여기서 정한다)
 */
function access(overrides: Partial<StorageAccess> = {}): StorageAccess {
  return {
    orgId: 7,
    userId: 11,
    departmentId: 3,
    isTeamLeader: false,
    canManage: false,
    accessibleDepartmentIds: [3],
    departments: [],
    roster: [],
    ...overrides
  };
}

describe('parseArea', () => {
  it('화이트리스트 밖 값은 받지 않는다', () => {
    expect(parseArea('COMMON')).toBe('COMMON');
    expect(parseArea('PERSONAL')).toBe('PERSONAL');
    expect(parseArea('EVERYTHING')).toBeNull();
    expect(parseArea(null)).toBeNull();
  });
});

describe('resolveDepartmentId', () => {
  it('부서 영역이 아니면 부서를 요구하지 않는다', () => {
    expect(resolveDepartmentId(access(), 'COMMON', null)).toEqual({ departmentId: null });
    expect(resolveDepartmentId(access(), 'PERSONAL', '3')).toEqual({ departmentId: null });
  });

  it('부서 영역인데 부서가 없으면 거부한다', () => {
    const result = resolveDepartmentId(access(), 'DEPARTMENT', null);
    expect('error' in result).toBe(true);
  });

  it('인가 집합 안의 부서만 통과한다', () => {
    expect(resolveDepartmentId(access(), 'DEPARTMENT', '3')).toEqual({ departmentId: 3 });
    expect('error' in resolveDepartmentId(access(), 'DEPARTMENT', '9')).toBe(true);
  });

  it('조직 관리 권한자는 어느 부서든 통과한다', () => {
    const 관리자 = access({ canManage: true, accessibleDepartmentIds: [] });
    expect(resolveDepartmentId(관리자, 'DEPARTMENT', '9')).toEqual({ departmentId: 9 });
  });
});

describe('buildScope', () => {
  it('인가 집합은 세션에서 도출한 값을 그대로 싣는다', () => {
    const scope = buildScope(access({ accessibleDepartmentIds: [3, 4] }), 'DEPARTMENT', 3);
    expect(scope).toEqual({
      area: 'DEPARTMENT',
      department_id: 3,
      department_ids: [3, 4],
      can_manage_org: false,
      is_team_leader: false
    });
  });

  it('부서 영역이 아니면 부서를 담지 않는다', () => {
    const scope = buildScope(access(), 'COMMON', 9);
    expect(scope.department_id).toBeNull();
  });

  it('팀장 여부와 관리 권한을 그대로 전달한다', () => {
    const scope = buildScope(
      access({ isTeamLeader: true, canManage: true, accessibleDepartmentIds: [1, 2] }),
      'DEPARTMENT',
      1
    );
    expect(scope.is_team_leader).toBe(true);
    expect(scope.can_manage_org).toBe(true);
  });
});

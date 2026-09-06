import { describe, expect, it } from 'vitest';
import {
  canAccessScope,
  canModifyFile,
  canRestoreFile,
  canUpload
} from '$lib/features/storage/lib/permissions';
import type { StorageActor, StorageFile } from '$lib/features/storage/types';

const 나 = 11;
const 남 = 12;

function actor(overrides: Partial<StorageActor> = {}): StorageActor {
  return {
    userId: 나,
    canManage: false,
    isTeamLeader: false,
    accessibleDepartmentIds: [3],
    ...overrides
  };
}

function file(overrides: Partial<StorageFile> = {}): StorageFile {
  return {
    id: 'f1',
    fileName: '파일.pdf',
    mimeType: 'application/pdf',
    size: 100,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: null,
    ownerUserId: 나,
    deletedAt: null,
    deletedByUserId: null,
    ...overrides
  };
}

describe('canAccessScope', () => {
  it('공통과 개인은 언제나 들어갈 수 있다', () => {
    expect(canAccessScope(actor(), { area: 'COMMON', departmentId: null })).toBe(true);
    expect(canAccessScope(actor(), { area: 'PERSONAL', departmentId: null })).toBe(true);
  });

  it('자기 부서만 들어갈 수 있다', () => {
    expect(canAccessScope(actor(), { area: 'DEPARTMENT', departmentId: 3 })).toBe(true);
    expect(canAccessScope(actor(), { area: 'DEPARTMENT', departmentId: 4 })).toBe(false);
  });

  it('조직 관리 권한자는 어느 부서든 들어간다', () => {
    const 관리자 = actor({ canManage: true, accessibleDepartmentIds: [] });
    expect(canAccessScope(관리자, { area: 'DEPARTMENT', departmentId: 99 })).toBe(true);
  });
});

describe('canUpload', () => {
  it('공통은 전원이 올린다', () => {
    expect(canUpload(actor(), { area: 'COMMON', departmentId: null }).allowed).toBe(true);
  });

  it('접근할 수 없는 부서에는 올리지 못한다', () => {
    const verdict = canUpload(actor(), { area: 'DEPARTMENT', departmentId: 4 });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBeTruthy();
  });
});

describe('canModifyFile', () => {
  const 공통 = { area: 'COMMON', departmentId: null } as const;

  it('올린 사람은 자기 파일을 바꾼다', () => {
    expect(canModifyFile(actor(), 공통, file()).allowed).toBe(true);
  });

  it('남이 올린 파일은 바꾸지 못한다', () => {
    const verdict = canModifyFile(actor(), 공통, file({ ownerUserId: 남 }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBeTruthy();
  });

  it('조직 관리 권한자는 남의 파일도 바꾼다', () => {
    const 관리자 = actor({ canManage: true });
    expect(canModifyFile(관리자, 공통, file({ ownerUserId: 남 })).allowed).toBe(true);
  });

  it('팀장은 부서 영역에서만 남의 파일을 바꾼다', () => {
    const 팀장 = actor({ isTeamLeader: true });
    const 부서 = { area: 'DEPARTMENT', departmentId: 3 } as const;
    expect(canModifyFile(팀장, 부서, file({ ownerUserId: 남 })).allowed).toBe(true);
    expect(canModifyFile(팀장, 공통, file({ ownerUserId: 남 })).allowed).toBe(false);
  });
});

describe('canRestoreFile', () => {
  it('자기가 지운 파일은 남의 것이어도 되돌린다', () => {
    const 대상 = file({ ownerUserId: 남, deletedByUserId: 나 });
    expect(canRestoreFile(actor(), { area: 'COMMON', departmentId: null }, 대상).allowed).toBe(
      true
    );
  });
});

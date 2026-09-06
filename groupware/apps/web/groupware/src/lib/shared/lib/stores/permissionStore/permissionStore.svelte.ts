/**
 * 권한 부여 스토어 (Svelte 5 runes, 싱글톤): 조직 관리(조직도)에서 부서/멤버 권한을 부여
 *
 * 실데이터: SSR load 가 내려준 부여 매트릭스(/user-api/org/permissions/grants)를 hydrate(=baseline)
 * 토글은 즉시 저장하지 않고 스테이징(_pending*)에 모은다 → 우측 패널 저장 바에서 한 번에 flush.
 * 저장 전 다른 화면(admin)으로 나가면 스테이징은 버려져 원래대로 돌아간다(baseline 유지)
 * 스테이징은 reads(상속 포함)에 즉시 반영되므로, 팀 부여를 풀면 멤버 직접 토글이 바로 활성화된다.
 * 멤버 유효 권한 = 부서 조상 체인(inheritedFor) ∪ 멤버 직접. 백엔드 토큰 해석과 동형
 */
import { permissionsService } from '$lib/features/permissions/services/permissions.service';
import { COMPANY_ID } from '$lib/shared/lib/stores/organizationStore/organizationStore.svelte';
import type { PermissionGrantMatrix } from '$lib/features/permissions/types';
import { Permission } from './permissions';

class PermissionStore {
  // baseline(서버 상태)
  private _deptGrants = $state<Record<string, Permission[]>>({});
  private _memberGrants = $state<Record<string, Permission[]>>({});
  // 스테이징(저장 전 변경): id → 새 desired 집합
  private _pendingDept = $state<Map<string, Permission[]>>(new Map());
  private _pendingMember = $state<Map<string, Permission[]>>(new Map());
  private _busy = $state(false);
  private _error = $state('');

  hydrate(matrix: PermissionGrantMatrix): void {
    const dept: Record<string, Permission[]> = {};
    for (const d of matrix.departments) dept[String(d.departmentId)] = d.permissionKeys;
    const mem: Record<string, Permission[]> = {};
    for (const m of matrix.members) mem[String(m.userId)] = m.permissionKeys;
    this._deptGrants = dept;
    this._memberGrants = mem;
    this._pendingDept = new Map();
    this._pendingMember = new Map();
  }

  get busy(): boolean {
    return this._busy;
  }
  get error(): string {
    return this._error;
  }
  get dirty(): boolean {
    return this._pendingDept.size > 0 || this._pendingMember.size > 0;
  }
  get pendingCount(): number {
    return this._pendingDept.size + this._pendingMember.size;
  }

  /** 부서 유효 부여(스테이징 우선) */
  orgPermissions(nodeId: string): Permission[] {
    return this._pendingDept.get(nodeId) ?? this._deptGrants[nodeId] ?? [];
  }
  /** 멤버 유효 직접 부여(스테이징 우선) */
  memberPermissions(memberId: string): Permission[] {
    return this._pendingMember.get(memberId) ?? this._memberGrants[memberId] ?? [];
  }
  /** 부서 조상 체인(자신+상위)의 부서 부여 합집합: 멤버 상속 권한 */
  inheritedFor(orgChain: string[]): Permission[] {
    const set = new Set<Permission>();
    for (const id of orgChain) {
      for (const p of this.orgPermissions(id)) set.add(p);
    }
    return [...set];
  }
  hasDept(nodeId: string, p: Permission): boolean {
    return this.orgPermissions(nodeId).includes(p);
  }
  hasMember(memberId: string, p: Permission): boolean {
    return this.memberPermissions(memberId).includes(p);
  }

  /** 부서 권한 토글(스테이징). 회사 루트는 부여 대상 아님(no-op) */
  toggleDept(nodeId: string, p: Permission): void {
    if (nodeId === COMPANY_ID) return;
    const next = toggleKey(this.orgPermissions(nodeId), p);
    this._pendingDept = stage(this._pendingDept, nodeId, next, this._deptGrants[nodeId] ?? []);
    this._error = '';
  }
  /** 멤버 직접 권한 토글(스테이징) */
  toggleMember(memberId: string, p: Permission): void {
    const next = toggleKey(this.memberPermissions(memberId), p);
    this._pendingMember = stage(this._pendingMember, memberId, next, this._memberGrants[memberId] ?? []);
    this._error = '';
  }

  /** 스테이징 폐기(되돌리기) */
  discard(): void {
    this._pendingDept = new Map();
    this._pendingMember = new Map();
    this._error = '';
  }

  /**
   * 스테이징을 백엔드에 반영(변경된 부서/멤버만). 성공 시 baseline 에 낙관적 반영 + 스테이징 비움
   * invalidate 는 호출자가 일괄(다른 grant 스토어와 함께) 수행해 서버 진실로 재동기화한다.
   */
  async flush(): Promise<{ success: boolean; error?: string }> {
    if (!this.dirty) return { success: true };
    this._busy = true;
    this._error = '';
    try {
      for (const [nodeId, keys] of this._pendingDept) {
        const r = await permissionsService.setDepartment(Number(nodeId), keys);
        if (!r.success) return this.fail(r.error);
      }
      for (const [memberId, keys] of this._pendingMember) {
        const r = await permissionsService.setMember(Number(memberId), keys);
        if (!r.success) return this.fail(r.error);
      }
      // 낙관적 반영: baseline 에 머지 + 스테이징 비움(저장 바 즉시 사라짐)
      this._deptGrants = applyPending(this._deptGrants, this._pendingDept);
      this._memberGrants = applyPending(this._memberGrants, this._pendingMember);
      this._pendingDept = new Map();
      this._pendingMember = new Map();
      return { success: true };
    } finally {
      this._busy = false;
    }
  }

  private fail(error?: string): { success: false; error: string } {
    this._error = error ?? '권한 저장에 실패했습니다.';
    return { success: false, error: this._error };
  }
}

/** desired 가 baseline 과 같으면 스테이징 제거, 다르면 기록 */
function stage(
  pending: Map<string, Permission[]>,
  id: string,
  next: Permission[],
  base: Permission[],
): Map<string, Permission[]> {
  const m = new Map(pending);
  if (sameKeys(next, base)) m.delete(id);
  else m.set(id, next);
  return m;
}
function applyPending(
  base: Record<string, Permission[]>,
  pending: Map<string, Permission[]>,
): Record<string, Permission[]> {
  const next = { ...base };
  for (const [id, keys] of pending) next[id] = keys;
  return next;
}
function sameKeys(a: Permission[], b: Permission[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
function toggleKey(cur: Permission[], p: Permission): Permission[] {
  return cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
}

export const permissionStore = new PermissionStore();

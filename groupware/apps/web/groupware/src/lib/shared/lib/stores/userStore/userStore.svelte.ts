/**
 * 유저(조직 멤버) 스토어 (Svelte 5 runes, 싱글톤: organizationStore 와 분리한 별도 관심사)
 *
 * 실데이터 연동: SSR load 가 내려준 조직 멤버(organization_users: ROOT+ADMIN)를 hydrate 한다.
 * 부서 배치/해제는 즉시 저장하지 않고 스테이징(_pending)에 모았다가 save() 로 한 번에 저장한다.
 * (변경된 멤버만 BFF 호출 → invalidateAll → 재-hydrate). 트리/패널은 스테이징을 즉시 반영한다.
 * 조직 트리(부서 구조)는 organizationStore 가 소유한다(두 스토어는 서로 import 하지 않음)
 * orgId = 소속 부서 노드 id(String(departmentId)) 또는 null(미배치). 회사 루트(COMPANY) 직속도 null 로 본다.
 */
import { invalidateAll } from '$app/navigation';
import { membersService } from '$lib/features/members/services/members.service';
import type { MemberSummary, OrgMemberRole } from '$lib/features/members/types';
import type { OrgPosition } from '$lib/features/positions/types';
import { COMPANY_ID } from '$lib/shared/lib/stores/organizationStore/organizationStore.svelte';

/** 유저(조직 멤버): orgId = 소속 부서 노드 id(미배치=null). role 로 ROOT/ADMIN 구분 */
export interface OrgUser {
  id: string;
  name: string;
  email: string;
  // 배치된 부서 노드 id (미배치 = null)
  orgId: string | null;
  role: OrgMemberRole;
  // 직책(대표/팀장): 트리 배지 표시용. null = 없음. 배치 변경과 무관(직책 편집은 positionStore)
  position: OrgPosition | null;
}

class UserStore {
  private _members = $state<OrgUser[]>([]); // 서버 baseline
  // 스테이징: memberId → 새 orgId(부서 노드 id|null). 저장 전까지 누적, save/hydrate 시 비운다.
  private _pending = $state<Map<string, string | null>>(new Map());
  private _saving = $state(false);
  private _error = $state('');

  /** SSR 실데이터 주입: departmentId → orgId(부서 노드 id) 매핑. invalidate 후 재호출(스테이징 초기화) */
  hydrate(members: MemberSummary[]): void {
    this._members = members.map((m) => ({
      id: String(m.id),
      name: m.name,
      email: m.email,
      orgId: m.departmentId === null ? null : String(m.departmentId),
      role: m.role,
      position: m.position ?? null,
    }));
    this._pending = new Map(); // 서버 상태가 곧 진실: 스테이징 리셋
  }

  /** 멤버의 유효 orgId(스테이징 우선) */
  private effectiveOrgId(u: OrgUser): string | null {
    return this._pending.has(u.id) ? (this._pending.get(u.id) ?? null) : u.orgId;
  }

  /** 해당 부서 노드에 배치된 멤버(스테이징 반영) */
  membersOf(orgNodeId: string): OrgUser[] {
    return this._members.filter((u) => this.effectiveOrgId(u) === orgNodeId);
  }

  /** id 로 멤버 단건 조회(스테이징된 소속 반영) */
  user(id: string): OrgUser | undefined {
    const u = this._members.find((m) => m.id === id);
    if (!u) return undefined;
    return this._pending.has(id) ? { ...u, orgId: this.effectiveOrgId(u) } : u;
  }

  /** 미배치 멤버(스테이징 반영) */
  unassignedMembers(): OrgUser[] {
    return this._members.filter((u) => this.effectiveOrgId(u) === null);
  }

  /**
   * 이름/이메일로 배치 가능한 멤버 검색: 이 부서에 이미 배치된 유저(스테이징 반영), ROOT(이동 불가)는 제외, 최대 8명
   */
  searchAvailableUsers(query: string, excludeNodeId: string): OrgUser[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this._members
      .filter((u) => u.role === 'ADMIN' && this.effectiveOrgId(u) !== excludeNodeId)
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 8);
  }

  // 스테이징(저장 전)
  /** 멤버를 부서에 배치(스테이징): 회사 루트 드롭은 미배치(null)로 처리 */
  assignUser(memberNodeId: string, orgNodeId: string): void {
    this.stage(memberNodeId, orgNodeId === COMPANY_ID ? null : orgNodeId);
  }

  /** 배치 해제(미배치, 스테이징) */
  unassignUser(memberNodeId: string): void {
    this.stage(memberNodeId, null);
  }

  /** 스테이징 기록: baseline 과 같아지면(원복) 항목을 제거해 dirty 가 정확하다. */
  private stage(memberNodeId: string, newOrgId: string | null): void {
    const base = this._members.find((u) => u.id === memberNodeId);
    if (!base) return;
    const next = new Map(this._pending);
    if (base.orgId === newOrgId) next.delete(memberNodeId);
    else next.set(memberNodeId, newOrgId);
    this._pending = next;
    this._error = '';
  }

  /** 저장할 변경이 있는가 */
  get dirty(): boolean {
    return this._pending.size > 0;
  }
  /** 변경된 멤버 수 */
  get pendingCount(): number {
    return this._pending.size;
  }
  get saving(): boolean {
    return this._saving;
  }
  /** 마지막 저장 실패 메시지(없으면 '') */
  get error(): string {
    return this._error;
  }

  /** 스테이징 폐기(되돌리기): 배치 변경을 버리고 baseline(서버 상태)으로 되돌린다. */
  discard(): void {
    this._pending = new Map();
    this._error = '';
  }

  /** 스테이징된 변경을 한 번에 저장: 변경된 멤버만 BFF 호출 후 invalidateAll(재-hydrate 가 스테이징 비움) */
  async save(): Promise<void> {
    if (this._pending.size === 0 || this._saving) return;
    this._saving = true;
    this._error = '';
    try {
      // 변경된 멤버만 순차 저장(실패 시 중단: 같은 값 재저장은 멱등이라 재시도 안전)
      for (const [id, orgId] of this._pending) {
        const departmentId = orgId === null ? null : Number(orgId);
        const r = await membersService.update(Number(id), { departmentId });
        if (!r.success) throw new Error(r.error ?? '배치 저장에 실패했습니다.');
      }
      await invalidateAll(); // 서버 상태 반영 → hydrate 가 _pending 초기화
    } catch (e) {
      this._error = e instanceof Error ? e.message : '배치 저장에 실패했습니다.';
    } finally {
      this._saving = false;
    }
  }
}

export const userStore = new UserStore();

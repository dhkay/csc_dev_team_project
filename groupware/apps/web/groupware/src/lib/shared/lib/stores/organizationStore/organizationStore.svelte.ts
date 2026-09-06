/**
 * 조직(부서 트리) 스토어 (Svelte 5 runes, 싱글톤)
 *
 * 실데이터 연동: SSR load 가 내려준 기업명 + 부서(departments)를 hydrate 하고, 변경(추가/이름변경/
 * 이동/삭제)은 즉시 BFF(departmentsService) 호출 후 invalidateAll 로 새로고침한다(낙관적 저장 없음)
 * 최상위(루트) 노드는 "회사"(organizations) 자체: 부서가 아니며 이름은 플랫폼 관리(읽기전용)
 * 부서 노드 id 는 문자열(String(departmentId)), 회사 루트는 센티넬 'company'
 */
import { invalidateAll } from '$app/navigation';
import { departmentsService } from '$lib/features/departments/services/departments.service';
import type { Department } from '$lib/features/departments/types';

/** 조직 트리 노드: parentId=null 이면 최상위(회사 루트) */
export interface OrgNode {
  id: string;
  name: string;
  parentId: string | null;
}

/** 회사(루트) 노드 센티넬 id: 부서가 아니라 organizations 자체 */
export const COMPANY_ID = 'company';

class OrganizationStore {
  private _companyName = $state('회사');
  private _depts = $state<Department[]>([]);
  private _initialExpandDone = false;

  /** SSR 실데이터 주입: load 가 바뀔 때마다(=invalidate 후) 재호출되어 서버 상태를 반영 */
  hydrate(companyName: string | null, departments: Department[]): void {
    if (companyName) this._companyName = companyName;
    this._depts = departments;
    // 첫 로드(부서가 처음 들어올 때)엔 모든 부서를 펼쳐 배치된 유저가 바로 보이게 한다.
    // 이후 재-hydrate(invalidate)에선 사용자의 펼침/접기 상태를 유지한다.
    if (!this._initialExpandDone && departments.length > 0) {
      this._initialExpandDone = true;
      this._expanded = new Set<string>([COMPANY_ID, ...departments.map((d) => String(d.id))]);
    }
  }

  // 트리(회사 루트 + 부서 노드)
  private nodes(): OrgNode[] {
    return [
      { id: COMPANY_ID, name: this._companyName, parentId: null },
      ...this._depts.map((d) => ({
        id: String(d.id),
        name: d.name,
        parentId: d.parentId === null ? COMPANY_ID : String(d.parentId),
      })),
    ];
  }
  root(): OrgNode {
    return { id: COMPANY_ID, name: this._companyName, parentId: null };
  }
  node(id: string): OrgNode | undefined {
    return this.nodes().find((n) => n.id === id);
  }
  childrenOf(parentId: string): OrgNode[] {
    return this.nodes().filter((n) => n.parentId === parentId);
  }
  isCompany(id: string): boolean {
    return id === COMPANY_ID;
  }
  /** orgId 와 모든 상위 조직 id(자신 포함, 루트까지) */
  ancestorIds(orgId: string): string[] {
    const ids: string[] = [];
    let cur = this.node(orgId);
    while (cur) {
      ids.push(cur.id);
      cur = cur.parentId ? this.node(cur.parentId) : undefined;
    }
    return ids;
  }

  // 뷰 상태(선택/펼침): 트리 ↔ 상세 패널이 공유. invalidate 후에도 유지(별도 state).
  private _selection = $state<{ kind: 'org' | 'member'; id: string }>({
    kind: 'org',
    id: COMPANY_ID,
  });
  private _expanded = $state<Set<string>>(new Set([COMPANY_ID]));

  get selectedId(): string {
    return this._selection.id;
  }
  get selectedKind(): 'org' | 'member' {
    return this._selection.kind;
  }
  get selectionKey(): string {
    return `${this._selection.kind}:${this._selection.id}`;
  }
  get selectedNode(): OrgNode | undefined {
    return this._selection.kind === 'org' ? this.node(this._selection.id) : undefined;
  }
  get selectedMemberId(): string | null {
    return this._selection.kind === 'member' ? this._selection.id : null;
  }
  isExpanded(id: string): boolean {
    return this._expanded.has(id);
  }
  select(id: string): void {
    this._selection = { kind: 'org', id };
  }
  selectMember(id: string): void {
    this._selection = { kind: 'member', id };
  }
  toggle(id: string): void {
    const next = new Set(this._expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this._expanded = next;
  }
  expand(id: string): void {
    if (this._expanded.has(id)) return;
    const next = new Set(this._expanded);
    next.add(id);
    this._expanded = next;
  }

  // 변경(즉시 저장: BFF 호출 + invalidate)
  /** 하위조직 추가: 회사 루트면 parentId=null(최상위 부서) */
  async addOrg(parentNodeId: string, name: string): Promise<void> {
    if (!name.trim()) return;
    const parentId = parentNodeId === COMPANY_ID ? null : Number(parentNodeId);
    const r = await departmentsService.create({ parentId, name: name.trim() });
    if (r.success) {
      this.expand(parentNodeId);
      await invalidateAll();
    }
  }
  /** 부서 이름 변경: 회사(루트)는 플랫폼 관리라 불가 */
  async renameOrg(nodeId: string, name: string): Promise<void> {
    if (nodeId === COMPANY_ID || !name.trim()) return;
    const r = await departmentsService.update(Number(nodeId), { name: name.trim() });
    if (r.success) await invalidateAll();
  }
  /** 부서 이동: 회사 루트로 드롭하면 최상위(parentId=null) */
  async moveOrg(nodeId: string, newParentNodeId: string): Promise<void> {
    if (!this.canDropOrg(nodeId, newParentNodeId)) return;
    const parentId = newParentNodeId === COMPANY_ID ? null : Number(newParentNodeId);
    const r = await departmentsService.update(Number(nodeId), { parentId });
    if (r.success) {
      this.expand(newParentNodeId);
      await invalidateAll();
    }
  }
  /** 부서 삭제(서브트리 + 소속 멤버 미배치는 백엔드 cascade). 회사(루트) 불가 */
  async deleteOrg(nodeId: string): Promise<void> {
    if (nodeId === COMPANY_ID) return;
    const parentId = this.node(nodeId)?.parentId ?? COMPANY_ID;
    const r = await departmentsService.remove(Number(nodeId));
    if (r.success) {
      this.select(parentId);
      await invalidateAll();
    }
  }

  /** candidateId 가 ancestorId 의 자손인가(자기 자신 제외) */
  private isDescendant(candidateId: string, ancestorId: string): boolean {
    let cur = this.node(candidateId);
    while (cur && cur.parentId !== null) {
      if (cur.parentId === ancestorId) return true;
      cur = this.node(cur.parentId);
    }
    return false;
  }

  /** nodeId(부서)를 targetId 하위로 옮길 수 있는가: 회사는 이동 불가, 자기/자손으로 이동 금지 */
  canDropOrg(nodeId: string, targetId: string): boolean {
    if (nodeId === COMPANY_ID) return false; // 회사(루트)는 이동 불가
    if (nodeId === targetId) return false;
    return !this.isDescendant(targetId, nodeId);
  }
}

export const organizationStore = new OrganizationStore();

/**
 * AI도구 배포 스토어 (Svelte 5 runes, 싱글톤): 조직 보유(플랫폼 인가) AI도구를 조직이 팀(부서)/멤버에 부여
 *
 * 실데이터: SSR load 가 내려준 배포 매트릭스(/user-api/org/ai-tools/distribution)를 hydrate(=baseline)
 * 토글(팀/멤버)은 스테이징(_pending*)에 모은다 → 우측 패널 저장 바에서 한 번에 flush.
 * 저장 전 다른 화면(admin)으로 나가면 스테이징은 버려져 원래대로 돌아간다(baseline 유지)
 * 스테이징은 reads(상속 포함)에 즉시 반영. 모든 부여는 조직 보유 범위 내(백엔드 FK 강제)
 * 멤버 유효 = 부서 조상 체인(inheritedFor) OR 멤버 직접. (ROOT, 대표는 백엔드에서 전체: UI 부여와 무관.)
 */
import { aiToolDistributionService } from '$lib/features/ai-tool-distribution/services/aiToolDistribution.service';
import { COMPANY_ID } from '$lib/shared/lib/stores/organizationStore/organizationStore.svelte';
import type { AiToolDistributionMatrix, AiToolKey } from '$lib/features/ai-tool-distribution/types';

interface Tool {
  key: AiToolKey;
  name: string;
}

class AiToolDistributionStore {
  private _tools = $state<Tool[]>([]); // baseline(조직 보유 도구)
  private _deptGrants = $state<Record<string, AiToolKey[]>>({});
  private _memberGrants = $state<Record<string, AiToolKey[]>>({});
  // 스테이징
  private _pendingDept = $state<Map<string, AiToolKey[]>>(new Map());
  private _pendingMember = $state<Map<string, AiToolKey[]>>(new Map());
  private _busy = $state(false);
  private _error = $state('');

  hydrate(matrix: AiToolDistributionMatrix): void {
    this._tools = matrix.tools;
    const dept: Record<string, AiToolKey[]> = {};
    for (const d of matrix.departmentGrants) dept[String(d.departmentId)] = d.aiToolKeys;
    const mem: Record<string, AiToolKey[]> = {};
    for (const m of matrix.memberGrants) mem[String(m.userId)] = m.aiToolKeys;
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

  /** 조직 보유 도구: 팀/멤버 부여 대상 */
  get tools(): Tool[] {
    return this._tools;
  }

  deptAiTools(nodeId: string): AiToolKey[] {
    return this._pendingDept.get(nodeId) ?? this._deptGrants[nodeId] ?? [];
  }
  memberAiTools(memberId: string): AiToolKey[] {
    return this._pendingMember.get(memberId) ?? this._memberGrants[memberId] ?? [];
  }
  inheritedFor(orgChain: string[]): AiToolKey[] {
    const set = new Set<AiToolKey>();
    for (const id of orgChain) {
      for (const k of this.deptAiTools(id)) set.add(k);
    }
    return [...set];
  }
  hasDept(nodeId: string, key: AiToolKey): boolean {
    return this.deptAiTools(nodeId).includes(key);
  }
  hasMember(memberId: string, key: AiToolKey): boolean {
    return this.memberAiTools(memberId).includes(key);
  }

  /** 팀(부서) 도구 토글(스테이징). 회사 루트는 부여 대상 아님(no-op) */
  toggleDept(nodeId: string, key: AiToolKey): void {
    if (nodeId === COMPANY_ID) return;
    const next = toggleKey(this.deptAiTools(nodeId), key);
    this._pendingDept = stage(this._pendingDept, nodeId, next, this._deptGrants[nodeId] ?? []);
    this._error = '';
  }
  /** 멤버 직접 도구 토글(스테이징) */
  toggleMember(memberId: string, key: AiToolKey): void {
    const next = toggleKey(this.memberAiTools(memberId), key);
    this._pendingMember = stage(this._pendingMember, memberId, next, this._memberGrants[memberId] ?? []);
    this._error = '';
  }

  /** 스테이징 폐기(되돌리기) */
  discard(): void {
    this._pendingDept = new Map();
    this._pendingMember = new Map();
    this._error = '';
  }

  /** 스테이징을 백엔드에 반영(변경된 부서/멤버만). 성공 시 baseline 낙관적 반영 + 스테이징 비움 */
  async flush(): Promise<{ success: boolean; error?: string }> {
    if (!this.dirty) return { success: true };
    this._busy = true;
    this._error = '';
    try {
      for (const [nodeId, keys] of this._pendingDept) {
        const r = await aiToolDistributionService.setDepartment(Number(nodeId), keys);
        if (!r.success) return this.fail(r.error);
      }
      for (const [memberId, keys] of this._pendingMember) {
        const r = await aiToolDistributionService.setMember(Number(memberId), keys);
        if (!r.success) return this.fail(r.error);
      }
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
    this._error = error ?? 'AI도구 배포에 실패했습니다.';
    return { success: false, error: this._error };
  }
}

function stage(
  pending: Map<string, AiToolKey[]>,
  id: string,
  next: AiToolKey[],
  base: AiToolKey[],
): Map<string, AiToolKey[]> {
  const m = new Map(pending);
  if (sameKeys(next, base)) m.delete(id);
  else m.set(id, next);
  return m;
}
function applyPending(
  base: Record<string, AiToolKey[]>,
  pending: Map<string, AiToolKey[]>,
): Record<string, AiToolKey[]> {
  const next = { ...base };
  for (const [id, keys] of pending) next[id] = keys;
  return next;
}
function sameKeys(a: AiToolKey[], b: AiToolKey[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
function toggleKey(cur: AiToolKey[], key: AiToolKey): AiToolKey[] {
  return cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
}

export const aiToolDistributionStore = new AiToolDistributionStore();

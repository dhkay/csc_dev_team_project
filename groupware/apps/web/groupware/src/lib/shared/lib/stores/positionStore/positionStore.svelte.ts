/**
 * 직책(대표/팀장) 스토어 (Svelte 5 runes, 싱글톤): 권한/AI도구와 분리된 별도 차원(멤버당 하나)
 *
 * 실데이터: SSR members(organization_users.position)를 hydrate(=baseline)
 * 멤버 직책 변경은 스테이징(_pending: memberId → 직책|null)에 모은다 → 하단 저장 바에서 한 번에 flush.
 * 저장 전 다른 화면으로 나가면 스테이징은 버려져 원래대로(baseline 유지). 단일 값이라 대표↔팀장은 자동 상호배제
 * 실제 인가(대표=ROOT 전용 / 팀장 부서 필수, 부서당 1명)는 백엔드가 강제: 이 스토어는 UI 스테이징만
 */
import { positionsService } from '$lib/features/positions/services/positions.service';
import type { OrgPosition } from '$lib/features/positions/types';
import type { MemberSummary } from '$lib/features/members/types';

class PositionStore {
  private _baseline = $state<Record<string, OrgPosition | null>>({}); // 서버 baseline(멤버별 직책)
  private _pending = $state<Map<string, OrgPosition | null>>(new Map());
  private _busy = $state(false);
  private _error = $state('');

  /** SSR 실데이터 주입: memberId → 직책. invalidate 후 재호출(스테이징 초기화) */
  hydrate(members: MemberSummary[]): void {
    const base: Record<string, OrgPosition | null> = {};
    for (const m of members) base[String(m.id)] = m.position ?? null;
    this._baseline = base;
    this._pending = new Map();
  }

  get busy(): boolean {
    return this._busy;
  }
  get error(): string {
    return this._error;
  }
  get dirty(): boolean {
    return this._pending.size > 0;
  }
  get pendingCount(): number {
    return this._pending.size;
  }

  /** 멤버의 유효 직책(스테이징 우선) */
  positionOf(memberId: string): OrgPosition | null {
    return this._pending.has(memberId)
      ? (this._pending.get(memberId) ?? null)
      : (this._baseline[memberId] ?? null);
  }

  /** 멤버 직책 설정(스테이징). null = 해제. baseline 과 같아지면 스테이징 제거(dirty 정확) */
  setPosition(memberId: string, position: OrgPosition | null): void {
    const base = this._baseline[memberId] ?? null;
    const next = new Map(this._pending);
    if (position === base) next.delete(memberId);
    else next.set(memberId, position);
    this._pending = next;
    this._error = '';
  }

  /** 스테이징 폐기(되돌리기) */
  discard(): void {
    this._pending = new Map();
    this._error = '';
  }

  /** 스테이징을 백엔드에 반영(변경된 멤버만). 성공 시 baseline 낙관적 반영 + 스테이징 비움 */
  async flush(): Promise<{ success: boolean; error?: string }> {
    if (!this.dirty) return { success: true };
    this._busy = true;
    this._error = '';
    try {
      for (const [memberId, position] of this._pending) {
        const r = await positionsService.setMember(Number(memberId), position);
        if (!r.success) {
          this._error = r.error ?? '직책 설정에 실패했습니다.';
          return { success: false, error: this._error };
        }
      }
      const next = { ...this._baseline };
      for (const [id, position] of this._pending) next[id] = position;
      this._baseline = next;
      this._pending = new Map();
      return { success: true };
    } finally {
      this._busy = false;
    }
  }
}

export const positionStore = new PositionStore();
